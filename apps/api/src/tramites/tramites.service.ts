import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  CanalAtencion,
  EstadoTramite,
  EstatusPasoTramite,
  TipoActor,
  TipoTramite,
} from '@salud-digna/shared';
import {
  CANALES_ATENCION,
  ESTADOS_TRAMITE,
  TIPOS_TRAMITE,
  obtenerPlazos,
  perfilPlazosDesdeEntorno,
  type Plazos,
} from '@salud-digna/shared';
import { z } from 'zod';
import { CatalogosService } from '../catalogos/catalogos.service';
import { PersistenciaService } from '../common/persistencia/persistencia.service';
import { KeyValueStoreService } from '../common/redis/kv-store.service';
import { EventBusService } from '../eventos/event-bus.service';
import { validarTransicionTramite } from './maquina-estados';

export interface ConflictoContexto {
  campo: string;
  valorAnterior: unknown;
  valorNuevo: unknown;
  canal: CanalAtencion;
  en: string;
}

export interface ContextoTramite {
  pasoActual: string;
  estudio: { id: string; nombre: string; precio: number } | null;
  clinica: { id: string; nombre: string; region?: string } | null;
  fechaTentativa: string | null;
  datosCapturados: Record<string, unknown>;
  pendientes: string[];
  ultimoCanal: CanalAtencion;
  actualizadoEn: string;
  conflictos: ConflictoContexto[];
  /** Versión del trámite: aumenta con cada escritura; una escritura con versión vieja da 409 (v2). */
  versionTramite?: number;
  /** Canal propietario con caducidad (lease, v2). */
  propietario?: PropietarioTramite | null;
  /** Horario apartado sin confirmar (v2): se libera al vencer el plazo. */
  cupo?: { apartadoHasta: string; liberadoEn: string | null } | null;
}

/**
 * Un solo canal propietario a la vez (traspaso v2, principio 6). `exclusivo` lo usa el Call Center:
 * mientras dura, los demás canales no escriben. Un canal conversacional (web, app, WhatsApp) se
 * transfiere solo al escribir desde otro canal.
 */
export interface PropietarioTramite {
  canal: CanalAtencion;
  actorId: string;
  hasta: string;
  exclusivo: boolean;
}

export interface PasoTramiteRegistro {
  id: string;
  orden: number;
  clavePaso: string;
  estatus: EstatusPasoTramite;
  canal: CanalAtencion;
  datos: Record<string, unknown> | null;
  iniciadoEn: string;
  completadoEn: string | null;
}

export interface CitaTramiteRegistro {
  id: string;
  clinicaId: string;
  fechaHora: string;
  estatus: 'agendada' | 'confirmada' | 'cancelada';
  canalAgendamiento: CanalAtencion;
  codigoConfirmacion: string;
  confirmadaEn: string | null;
}

export interface TramiteRegistro {
  id: string;
  folio: string;
  pacienteId: string;
  estudioId: string | null;
  clinicaId: string | null;
  tipo: TipoTramite;
  estado: EstadoTramite;
  estadoAnterior: EstadoTramite | null;
  pasoActual: string;
  contexto: ContextoTramite;
  canalOrigen: CanalAtencion;
  ultimoCanal: CanalAtencion;
  region: string | null;
  cita: CitaTramiteRegistro | null;
  pasos: PasoTramiteRegistro[];
  esDemo: boolean;
  creadoEn: string;
  actualizadoEn: string;
}

export const CrearTramiteSchema = z.object({
  pacienteId: z.string().min(1).max(36),
  canal: z.enum(CANALES_ATENCION),
  tipo: z.enum(TIPOS_TRAMITE).default('estudio'),
  estudioId: z.string().min(1).max(36).optional(),
  clinicaId: z.string().min(1).max(36).optional(),
  region: z.string().min(1).max(60).optional(),
  esDemo: z.boolean().default(true),
});

export const AvanzarTramiteSchema = z.object({
  estadoDestino: z.enum(ESTADOS_TRAMITE),
  canal: z.enum(CANALES_ATENCION),
  estudioId: z.string().min(1).max(36).optional(),
  clinicaId: z.string().min(1).max(36).optional(),
  fechaHora: z.string().datetime({ offset: true }).optional(),
  resultadoId: z.string().min(1).max(36).optional(),
  datos: z.record(z.unknown()).optional(),
  /** Versión que el cliente vio; si el trámite cambió en otro canal responde 409 (v2). */
  versionEsperada: z.number().int().positive().optional(),
});

export const PausarTramiteSchema = z.object({
  canal: z.enum(CANALES_ATENCION),
  motivo: z.string().min(1).max(200).optional(),
  pendientes: z.array(z.string().min(1).max(80)).optional(),
  /** Versión que el cliente vio; si el trámite cambió en otro canal responde 409 (v2). */
  versionEsperada: z.number().int().positive().optional(),
});

export const RetomarTramiteSchema = z.object({
  canal: z.enum(CANALES_ATENCION),
  /** Versión que el cliente vio; si el trámite cambió en otro canal responde 409 (v2). */
  versionEsperada: z.number().int().positive().optional(),
});

export const ESTADOS_TERMINALES_TRAMITE: readonly EstadoTramite[] = ['cerrado', 'cancelado'];

export function esEstadoTerminal(estado: EstadoTramite): boolean {
  return ESTADOS_TERMINALES_TRAMITE.includes(estado);
}

export const CancelarTramiteSchema = z.object({
  canal: z.enum(CANALES_ATENCION),
  motivo: z.string().min(1).max(200).optional(),
  /** Versión que el cliente vio; si el trámite cambió en otro canal responde 409 (v2). */
  versionEsperada: z.number().int().positive().optional(),
});

const TTL_CACHE_CONTEXTO_SEG = 24 * 60 * 60; // 24 h (#13)

@Injectable()
export class TramitesService implements OnModuleInit {
  private readonly tramites = new Map<string, TramiteRegistro>();
  private secuenciaFolio = 1;
  /** Perfil de temporizadores (`PLAZOS_PERFIL`): producción o exposición (v2). */
  readonly plazos: Plazos = obtenerPlazos(perfilPlazosDesdeEntorno(process.env.PLAZOS_PERFIL));

  constructor(
    private readonly catalogos: CatalogosService,
    private readonly eventBus: EventBusService,
    private readonly kv: KeyValueStoreService,
    private readonly persistencia: PersistenciaService,
  ) {
    this.cargarSnapshotSiExiste();
  }

  /**
   * Al arrancar recarga los trámites desde MySQL (fuente de verdad, #13). Si la BD no está
   * configurada se conserva lo cargado del snapshot JSON (desarrollo y pruebas).
   */
  async onModuleInit(): Promise<void> {
    const desdeBd = await this.persistencia.cargarTramites();
    if (!desdeBd) return;
    this.tramites.clear();
    for (const t of desdeBd) {
      this.tramites.set(t.id, t);
    }
    this.recalcularSecuenciaFolio();
  }

  private recalcularSecuenciaFolio(): void {
    let maximo = 0;
    for (const t of this.tramites.values()) {
      const numero = Number(t.folio.split('-').at(-1));
      if (Number.isFinite(numero) && numero > maximo) maximo = numero;
    }
    this.secuenciaFolio = Math.max(this.secuenciaFolio, maximo + 1);
  }

  private obtenerRutaSnapshot(): string | null {
    return process.env.TRAMITES_SNAPSHOT_PATH ?? null;
  }

  private cargarSnapshotSiExiste(): void {
    const ruta = this.obtenerRutaSnapshot();
    if (!ruta || !fs.existsSync(ruta)) return;
    try {
      const raw = JSON.parse(fs.readFileSync(ruta, 'utf8')) as {
        secuenciaFolio: number;
        tramites: TramiteRegistro[];
      };
      this.secuenciaFolio = raw.secuenciaFolio ?? 1;
      this.tramites.clear();
      for (const t of raw.tramites ?? []) {
        this.tramites.set(t.id, t);
      }
      this.recalcularSecuenciaFolio();
    } catch {
      // Si el snapshot estuviera corrupto, arranca limpio sin tumbar el proceso
    }
  }

  persistirSnapshot(): void {
    const ruta = this.obtenerRutaSnapshot();
    if (!ruta) return;
    fs.mkdirSync(path.dirname(ruta), { recursive: true });
    fs.writeFileSync(
      ruta,
      JSON.stringify(
        {
          secuenciaFolio: this.secuenciaFolio,
          tramites: [...this.tramites.values()],
        },
        null,
        2,
      ),
      'utf8',
    );
  }

  private claveCacheContexto(pacienteId: string): string {
    return `ctx:${pacienteId}`;
  }

  /**
   * Guarda el trámite (MySQL + snapshot) y actualiza la caché `ctx:{pacienteId}` con el trámite
   * activo más reciente del paciente. Un trámite cerrado o cancelado nunca queda en caché (#13).
   */
  async sincronizarCacheContexto(tramite: TramiteRegistro): Promise<void> {
    await this.persistencia.guardarTramite(tramite);
    this.persistirSnapshot();

    const clave = this.claveCacheContexto(tramite.pacienteId);
    const activo = esEstadoTerminal(tramite.estado)
      ? this.obtenerActivoDePaciente(tramite.pacienteId)
      : tramite;

    if (!activo) {
      await this.kv.del(clave);
      return;
    }

    await this.kv.set(
      clave,
      JSON.stringify({
        tramiteId: activo.id,
        folio: activo.folio,
        estado: activo.estado,
        contexto: activo.contexto,
      }),
      TTL_CACHE_CONTEXTO_SEG,
    );
  }

  private generarFolioLegible(): string {
    const num = String(this.secuenciaFolio++).padStart(6, '0');
    return `SD-${new Date().getFullYear()}-${num}`;
  }

  /**
   * Cierra el paso en curso y abre uno nuevo. Lo usan `avanzar` y el autoguardado de contexto
   * cuando el trámite cambia de estado (#12, #13).
   */
  registrarPaso(
    tramite: TramiteRegistro,
    clavePaso: string,
    canal: CanalAtencion,
    ahora: string,
    opciones?: { datos?: Record<string, unknown> | null; completado?: boolean },
  ): void {
    const pasoPrevio = tramite.pasos.at(-1);
    if (pasoPrevio && !pasoPrevio.completadoEn) {
      pasoPrevio.estatus = 'completado';
      pasoPrevio.completadoEn = ahora;
    }

    tramite.pasos.push({
      id: `paso_${randomUUID().slice(0, 10)}`,
      orden: tramite.pasos.length + 1,
      clavePaso,
      estatus: opciones?.completado ? 'completado' : 'en_progreso',
      canal,
      datos: opciones?.datos ?? null,
      iniciadoEn: ahora,
      completadoEn: opciones?.completado ? ahora : null,
    });
  }

  // --------------------------------------------------------------------------
  // Canal propietario y versión del trámite (traspaso v2, sección 6)
  // --------------------------------------------------------------------------

  versionDe(tramite: TramiteRegistro): number {
    return tramite.contexto.versionTramite ?? 1;
  }

  propietarioActivo(tramite: TramiteRegistro, ahora = Date.now()): PropietarioTramite | null {
    const p = tramite.contexto.propietario;
    return p && Date.parse(p.hasta) > ahora ? p : null;
  }

  private nuevoPropietario(
    canal: CanalAtencion,
    actorId: string,
    exclusivo: boolean,
  ): PropietarioTramite {
    return {
      canal,
      actorId,
      exclusivo,
      hasta: new Date(Date.now() + this.plazos.lease * 1000).toISOString(),
    };
  }

  private async publicarTransferencia(
    tramite: TramiteRegistro,
    anterior: CanalAtencion | null,
    nuevo: PropietarioTramite,
    actor: { tipo: TipoActor; id: string },
  ): Promise<void> {
    await this.eventBus.publish({
      tipo: 'contexto.transferido',
      version: 1,
      pacienteId: tramite.pacienteId,
      tramiteId: tramite.id,
      canal: nuevo.canal,
      actor,
      rolActor:
        actor.tipo === 'paciente' ? 'titular' : actor.tipo === 'asesor_ia' ? 'bot' : 'operador',
      versionTramite: this.versionDe(tramite),
      datos: {
        folio: tramite.folio,
        canalAnterior: anterior,
        canalNuevo: nuevo.canal,
        versionNueva: this.versionDe(tramite),
        propietarioHasta: nuevo.hasta,
      },
    });
  }

  /**
   * Regla de escritura v2, antes de cualquier cambio:
   * 1. Si el cliente envía la versión que vio y ya no es la actual → 409 (escritura obsoleta).
   * 2. Si otro canal tiene el trámite en exclusiva (llamada en curso) → 409.
   * 3. Si otro canal conversacional lo tenía, el permiso se transfiere al canal que escribe.
   * El sistema (temporizadores) escribe sin tomar el permiso.
   */
  async controlarEscritura(
    tramite: TramiteRegistro,
    canal: CanalAtencion,
    actor: { tipo: TipoActor; id: string },
    versionEsperada?: number,
  ): Promise<void> {
    const versionActual = this.versionDe(tramite);
    if (versionEsperada !== undefined && versionEsperada !== versionActual) {
      throw new ConflictException({
        mensaje: `El trámite ${tramite.folio} cambió en otro canal (versión ${versionActual}); vuelve a cargarlo antes de continuar`,
        codigo: 'VERSION_OBSOLETA',
        versionActual,
      });
    }
    if (actor.tipo === 'sistema') return;

    const actual = this.propietarioActivo(tramite);
    if (actual && actual.canal !== canal && actual.exclusivo) {
      throw new ConflictException({
        mensaje: `El trámite ${tramite.folio} está en atención por ${actual.canal}; ese canal lo conserva hasta liberarlo`,
        codigo: 'CANAL_NO_PROPIETARIO',
        canalPropietario: actual.canal,
      });
    }

    if (actual && actual.canal === canal) {
      // Mismo canal: renovar el permiso
      actual.hasta = this.nuevoPropietario(canal, actual.actorId, actual.exclusivo).hasta;
      return;
    }
    const nuevo = this.nuevoPropietario(canal, actor.id, false);
    tramite.contexto.propietario = nuevo;
    if (actual) {
      await this.publicarTransferencia(tramite, actual.canal, nuevo, actor);
    }
  }

  /** Cada escritura aceptada incrementa la versión del trámite. */
  incrementarVersion(tramite: TramiteRegistro): number {
    tramite.contexto.versionTramite = this.versionDe(tramite) + 1;
    return tramite.contexto.versionTramite;
  }

  /** El Call Center toma el trámite en exclusiva al atender la llamada (contexto.transferido). */
  async tomarPropietario(
    idOFolio: string,
    canal: CanalAtencion,
    actor: { tipo: TipoActor; id: string },
    versionEsperada?: number,
  ): Promise<TramiteRegistro> {
    const tramite = this.obtenerPorIdOFolio(idOFolio);
    if (esEstadoTerminal(tramite.estado)) {
      throw new ConflictException(`El trámite ${tramite.folio} está ${tramite.estado}`);
    }
    const versionActual = this.versionDe(tramite);
    if (versionEsperada !== undefined && versionEsperada !== versionActual) {
      throw new ConflictException({
        mensaje: `El trámite ${tramite.folio} cambió (versión ${versionActual}); vuelve a cargarlo`,
        codigo: 'VERSION_OBSOLETA',
        versionActual,
      });
    }
    const actual = this.propietarioActivo(tramite);
    if (actual && actual.exclusivo && actual.canal === canal && actual.actorId !== actor.id) {
      throw new ConflictException({
        mensaje: `Otro asesor ya atiende el trámite ${tramite.folio}`,
        codigo: 'CANAL_NO_PROPIETARIO',
        canalPropietario: actual.canal,
      });
    }
    const nuevo = this.nuevoPropietario(canal, actor.id, true);
    tramite.contexto.propietario = nuevo;
    this.incrementarVersion(tramite);
    tramite.actualizadoEn = new Date().toISOString();
    await this.sincronizarCacheContexto(tramite);
    await this.publicarTransferencia(tramite, actual?.canal ?? null, nuevo, actor);
    return tramite;
  }

  /** Renueva el permiso exclusivo mientras la llamada sigue (latido de la consola). */
  async renovarPropietario(
    idOFolio: string,
    actor: { tipo: TipoActor; id: string },
  ): Promise<TramiteRegistro> {
    const tramite = this.obtenerPorIdOFolio(idOFolio);
    const actual = this.propietarioActivo(tramite);
    if (!actual || actual.actorId !== actor.id) {
      throw new ConflictException({
        mensaje: 'El permiso del canal ya no es tuyo; vuelve a tomar el trámite',
        codigo: 'PERMISO_PERDIDO',
      });
    }
    actual.hasta = this.nuevoPropietario(actual.canal, actor.id, actual.exclusivo).hasta;
    await this.sincronizarCacheContexto(tramite);
    return tramite;
  }

  /** Al colgar se libera el permiso; cualquier canal puede retomar. */
  async liberarPropietario(
    idOFolio: string,
    actor: { tipo: TipoActor; id: string },
  ): Promise<TramiteRegistro> {
    const tramite = this.obtenerPorIdOFolio(idOFolio);
    const actual = this.propietarioActivo(tramite);
    if (!actual) return tramite;
    if (actual.actorId !== actor.id && actor.tipo !== 'admin') {
      throw new ConflictException({
        mensaje: 'Solo quien tiene el trámite puede liberarlo',
        codigo: 'CANAL_NO_PROPIETARIO',
        canalPropietario: actual.canal,
      });
    }
    tramite.contexto.propietario = null;
    await this.sincronizarCacheContexto(tramite);
    await this.eventBus.publish({
      tipo: 'canal.propietario_liberado',
      version: 1,
      pacienteId: tramite.pacienteId,
      tramiteId: tramite.id,
      canal: actual.canal,
      actor,
      rolActor: 'operador',
      versionTramite: this.versionDe(tramite),
      datos: { folio: tramite.folio, canalLiberado: actual.canal, motivo: 'liberado' },
    });
    return tramite;
  }

  /**
   * Revisión periódica de plazos (la llama `TemporizadoresService`). Cada vencimiento se registra
   * con la hora del umbral (`ocurridoEn`) y una llave de idempotencia, aunque se detecte tarde.
   */
  async revisarVencimientos(ahora = Date.now()): Promise<number> {
    let vencidos = 0;
    for (const tramite of this.listarTodosActivos()) {
      const p = tramite.contexto.propietario;
      if (p && Date.parse(p.hasta) <= ahora) {
        tramite.contexto.propietario = null;
        await this.sincronizarCacheContexto(tramite);
        vencidos++;
        // Solo la llamada (permiso exclusivo) deja rastro: los permisos conversacionales vencen
        // en silencio para no llenar la línea de tiempo con cada pausa breve del paciente.
        if (p.exclusivo) {
          await this.eventBus.publish({
            tipo: 'canal.propietario_liberado',
            version: 1,
            pacienteId: tramite.pacienteId,
            tramiteId: tramite.id,
            canal: p.canal,
            actor: { tipo: 'sistema', id: 'temporizadores' },
            rolActor: 'sistema',
            ocurridoEn: p.hasta,
            versionTramite: this.versionDe(tramite),
            llaveIdempotencia: `canal.propietario_liberado:${tramite.id}:${p.hasta}`,
            datos: { folio: tramite.folio, canalLiberado: p.canal, motivo: 'caducado' },
          });
        }
      }

      const cupo = tramite.contexto.cupo;
      if (
        cupo &&
        !cupo.liberadoEn &&
        tramite.cita?.estatus === 'agendada' &&
        Date.parse(cupo.apartadoHasta) <= ahora
      ) {
        cupo.liberadoEn = cupo.apartadoHasta;
        await this.sincronizarCacheContexto(tramite);
        vencidos++;
        await this.eventBus.publish({
          tipo: 'cupo.liberado',
          version: 1,
          pacienteId: tramite.pacienteId,
          tramiteId: tramite.id,
          canal: tramite.ultimoCanal,
          actor: { tipo: 'sistema', id: 'temporizadores' },
          rolActor: 'sistema',
          ocurridoEn: cupo.apartadoHasta,
          versionTramite: this.versionDe(tramite),
          llaveIdempotencia: `cupo.liberado:${tramite.id}:${cupo.apartadoHasta}`,
          datos: {
            folio: tramite.folio,
            clinicaId: tramite.cita.clinicaId,
            fechaHora: tramite.cita.fechaHora,
          },
        });
      }
    }
    return vencidos;
  }

  private async publicarCitaApartada(
    tramite: TramiteRegistro,
    canal: CanalAtencion,
    actor: { tipo: TipoActor; id: string },
  ): Promise<void> {
    if (!tramite.cita) return;
    const apartadoHasta = new Date(Date.now() + this.plazos.cupo * 1000).toISOString();
    tramite.contexto.cupo = { apartadoHasta, liberadoEn: null };
    await this.eventBus.publish({
      tipo: 'cita.apartada',
      version: 1,
      pacienteId: tramite.pacienteId,
      tramiteId: tramite.id,
      canal,
      actor,
      versionTramite: this.versionDe(tramite),
      datos: {
        folio: tramite.folio,
        clinicaId: tramite.cita.clinicaId,
        fechaHora: tramite.cita.fechaHora,
        apartadoHasta,
      },
    });
  }

  obtenerPorIdOFolio(idOFolio: string): TramiteRegistro {
    const directo = this.tramites.get(idOFolio);
    if (directo) return directo;
    for (const t of this.tramites.values()) {
      if (t.folio === idOFolio) return t;
    }
    throw new NotFoundException(`Trámite ${idOFolio} no encontrado`);
  }

  listarPorPaciente(pacienteId: string, soloActivos = false): TramiteRegistro[] {
    return [...this.tramites.values()]
      .filter((t) => {
        if (t.pacienteId !== pacienteId) return false;
        if (soloActivos && (t.estado === 'cerrado' || t.estado === 'cancelado')) return false;
        return true;
      })
      .sort((a, b) => Date.parse(b.actualizadoEn) - Date.parse(a.actualizadoEn));
  }

  obtenerActivoDePaciente(pacienteId: string): TramiteRegistro | undefined {
    return this.listarPorPaciente(pacienteId, true)[0];
  }

  listarTodosActivos(): TramiteRegistro[] {
    return [...this.tramites.values()].filter((t) => !esEstadoTerminal(t.estado));
  }

  async crear(
    entrada: z.input<typeof CrearTramiteSchema>,
    actor: { tipo: TipoActor; id: string },
  ): Promise<TramiteRegistro> {
    const parsed = CrearTramiteSchema.safeParse(entrada);
    if (!parsed.success) {
      throw new BadRequestException({
        mensaje: 'Datos inválidos para crear trámite',
        errores: parsed.error.flatten().fieldErrors,
      });
    }

    const data = parsed.data;
    const estudio = data.estudioId ? this.catalogos.obtenerEstudioPorId(data.estudioId) : null;
    const clinica = data.clinicaId ? this.catalogos.obtenerClinicaPorId(data.clinicaId) : null;
    const ahora = new Date().toISOString();

    const pendientes: string[] = [];
    if (!estudio) pendientes.push('elegir_estudio');
    if (!clinica) pendientes.push('elegir_clinica');
    pendientes.push('confirmar_fecha', 'aceptar_preparacion');

    const tramite: TramiteRegistro = {
      id: `trm_${randomUUID().slice(0, 12)}`,
      folio: this.generarFolioLegible(),
      pacienteId: data.pacienteId,
      estudioId: estudio?.id ?? null,
      clinicaId: clinica?.id ?? null,
      tipo: data.tipo,
      estado: 'cotizacion',
      estadoAnterior: null,
      pasoActual: 'cotizacion',
      contexto: {
        pasoActual: 'cotizacion',
        estudio: estudio
          ? { id: estudio.id, nombre: estudio.nombre, precio: estudio.precio }
          : null,
        clinica: clinica
          ? { id: clinica.id, nombre: clinica.nombre, region: clinica.region }
          : null,
        fechaTentativa: null,
        datosCapturados: {},
        pendientes,
        ultimoCanal: data.canal,
        actualizadoEn: ahora,
        conflictos: [],
      },
      canalOrigen: data.canal,
      ultimoCanal: data.canal,
      region: clinica?.region ?? data.region ?? null,
      cita: null,
      pasos: [
        {
          id: `paso_${randomUUID().slice(0, 10)}`,
          orden: 1,
          clavePaso: 'cotizacion',
          estatus: 'en_progreso',
          canal: data.canal,
          datos: estudio ? { estudioId: estudio.id } : null,
          iniciadoEn: ahora,
          completadoEn: null,
        },
      ],
      esDemo: data.esDemo,
      creadoEn: ahora,
      actualizadoEn: ahora,
    };

    this.tramites.set(tramite.id, tramite);
    await this.sincronizarCacheContexto(tramite);

    await this.eventBus.publish({
      tipo: 'cotizacion.iniciada',
      version: 1,
      pacienteId: tramite.pacienteId,
      tramiteId: tramite.id,
      canal: data.canal,
      actor,
      datos: {
        folio: tramite.folio,
        tipoTramite: tramite.tipo,
        ...(estudio ? { estudioId: estudio.id } : {}),
        ...(tramite.region ? { region: tramite.region } : {}),
      },
    });

    if (estudio) {
      await this.eventBus.publish({
        tipo: 'estudio.seleccionado',
        version: 1,
        pacienteId: tramite.pacienteId,
        tramiteId: tramite.id,
        canal: data.canal,
        actor,
        datos: {
          estudioId: estudio.id,
          estudioNombre: estudio.nombre,
          precio: estudio.precio,
          requierePreparacion: Boolean(estudio.preparacion),
        },
      });
    }

    return tramite;
  }

  async avanzar(
    idOFolio: string,
    entrada: z.input<typeof AvanzarTramiteSchema>,
    actor: { tipo: TipoActor; id: string },
  ): Promise<TramiteRegistro> {
    const parsed = AvanzarTramiteSchema.safeParse(entrada);
    if (!parsed.success) {
      throw new BadRequestException({
        mensaje: 'Datos inválidos para avanzar trámite',
        errores: parsed.error.flatten().fieldErrors,
      });
    }

    const tramite = this.obtenerPorIdOFolio(idOFolio);
    const data = parsed.data;

    const estudio = data.estudioId
      ? this.catalogos.obtenerEstudioPorId(data.estudioId)
      : tramite.estudioId
        ? this.catalogos.obtenerEstudioPorId(tramite.estudioId)
        : null;
    const clinica = data.clinicaId
      ? this.catalogos.obtenerClinicaPorId(data.clinicaId)
      : tramite.clinicaId
        ? this.catalogos.obtenerClinicaPorId(tramite.clinicaId)
        : null;

    const fechaEfectiva = data.fechaHora ?? tramite.contexto.fechaTentativa;

    const chequeo = validarTransicionTramite(
      tramite.estado,
      data.estadoDestino,
      {
        estudioId: estudio?.id ?? null,
        clinicaId: clinica?.id ?? null,
        fechaHora: fechaEfectiva,
        citaId: tramite.cita?.id ?? null,
        resultadoId: data.resultadoId ?? null,
      },
      tramite.estadoAnterior,
    );

    if (!chequeo.valida) {
      throw new ConflictException(chequeo.motivo);
    }
    await this.controlarEscritura(tramite, data.canal, actor, data.versionEsperada);

    const canalAnterior = tramite.ultimoCanal;
    const estadoPrevio = tramite.estado;
    const ahora = new Date().toISOString();

    // Al salir de `pausado` hacia su estado previo ya no hay nada que restaurar
    if (estadoPrevio === 'pausado') {
      tramite.estadoAnterior = null;
    }

    tramite.estado = data.estadoDestino;
    tramite.pasoActual = data.estadoDestino;
    tramite.ultimoCanal = data.canal;
    tramite.actualizadoEn = ahora;

    if (estudio) {
      tramite.estudioId = estudio.id;
      tramite.contexto.estudio = { id: estudio.id, nombre: estudio.nombre, precio: estudio.precio };
      tramite.contexto.pendientes = tramite.contexto.pendientes.filter(
        (p) => p !== 'elegir_estudio',
      );
    }
    if (clinica) {
      tramite.clinicaId = clinica.id;
      tramite.region = clinica.region;
      tramite.contexto.clinica = {
        id: clinica.id,
        nombre: clinica.nombre,
        region: clinica.region,
      };
      tramite.contexto.pendientes = tramite.contexto.pendientes.filter(
        (p) => p !== 'elegir_clinica',
      );
    }
    if (fechaEfectiva) {
      tramite.contexto.fechaTentativa = fechaEfectiva;
    }

    tramite.contexto.pasoActual = data.estadoDestino;
    tramite.contexto.ultimoCanal = data.canal;
    tramite.contexto.actualizadoEn = ahora;

    if (data.estadoDestino === 'cita_agendada' && clinica && fechaEfectiva) {
      const codigo = `SD${randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()}`;
      tramite.cita = {
        id: `cit_${randomUUID().slice(0, 10)}`,
        clinicaId: clinica.id,
        fechaHora: fechaEfectiva,
        estatus: 'agendada',
        canalAgendamiento: data.canal,
        codigoConfirmacion: codigo,
        confirmadaEn: null,
      };
      tramite.contexto.pendientes = tramite.contexto.pendientes.filter(
        (p) => p !== 'confirmar_fecha',
      );
    }

    if (data.estadoDestino === 'cita_confirmada' && tramite.cita) {
      tramite.cita.estatus = 'confirmada';
      tramite.cita.confirmadaEn = ahora;
      tramite.contexto.pendientes = [];
    }

    this.registrarPaso(tramite, data.estadoDestino, data.canal, ahora, {
      datos: data.datos ?? null,
      completado: data.estadoDestino === 'cerrado' || data.estadoDestino === 'cita_confirmada',
    });

    // Confirmar un horario que ya se liberó: se vuelve a apartar sin pedir datos (v2)
    const reapartar =
      data.estadoDestino === 'cita_confirmada' && Boolean(tramite.contexto.cupo?.liberadoEn);
    if (data.estadoDestino === 'cita_confirmada' && !reapartar) {
      tramite.contexto.cupo = null;
    }

    this.incrementarVersion(tramite);
    await this.sincronizarCacheContexto(tramite);

    // Emitir cambio de canal si el trámite continuó en otro canal
    if (canalAnterior !== data.canal) {
      await this.eventBus.publish({
        tipo: 'canal.cambiado',
        version: 1,
        pacienteId: tramite.pacienteId,
        tramiteId: tramite.id,
        canal: data.canal,
        actor,
        datos: {
          canalAnterior,
          canalNuevo: data.canal,
          pasoActual: tramite.pasoActual,
          verificado: true,
        },
      });
    }

    // Emitir evento de dominio específico de la transición
    if (data.estadoDestino === 'seleccion_clinica' && clinica) {
      await this.eventBus.publish({
        tipo: 'clinica.seleccionada',
        version: 1,
        pacienteId: tramite.pacienteId,
        tramiteId: tramite.id,
        canal: data.canal,
        actor,
        datos: {
          clinicaId: clinica.id,
          clinicaNombre: clinica.nombre,
          ...(estudio ? { estudioId: estudio.id } : {}),
          region: clinica.region,
        },
      });
    } else if (data.estadoDestino === 'cita_agendada' && tramite.cita && clinica) {
      await this.eventBus.publish({
        tipo: 'cita.agendada',
        version: 1,
        pacienteId: tramite.pacienteId,
        tramiteId: tramite.id,
        canal: data.canal,
        actor,
        datos: {
          citaId: tramite.cita.id,
          clinicaId: clinica.id,
          fechaHora: tramite.cita.fechaHora,
          codigoConfirmacion: tramite.cita.codigoConfirmacion,
        },
      });
      // El horario queda apartado; si nadie lo confirma a tiempo se libera (v2)
      await this.publicarCitaApartada(tramite, data.canal, actor);
      await this.sincronizarCacheContexto(tramite);
    } else if (data.estadoDestino === 'cita_confirmada' && tramite.cita && clinica) {
      if (reapartar) {
        await this.publicarCitaApartada(tramite, data.canal, actor);
        tramite.contexto.cupo = null;
        await this.sincronizarCacheContexto(tramite);
      }
      await this.eventBus.publish({
        tipo: 'cita.confirmada',
        version: 1,
        pacienteId: tramite.pacienteId,
        tramiteId: tramite.id,
        canal: data.canal,
        actor,
        datos: {
          citaId: tramite.cita.id,
          clinicaId: clinica.id,
          fechaHora: tramite.cita.fechaHora,
          confirmadaPorCanal: data.canal,
        },
      });
    } else if (data.estadoDestino === 'resultados_liberados' && estudio) {
      await this.eventBus.publish({
        tipo: 'resultado.liberado',
        version: 1,
        pacienteId: tramite.pacienteId,
        tramiteId: tramite.id,
        canal: data.canal,
        actor,
        datos: {
          resultadoId: data.resultadoId ?? `res_${randomUUID().slice(0, 8)}`,
          estudioId: estudio.id,
          validadoPorId: actor.id,
          canalNotificacion: data.canal,
        },
      });
    } else {
      // Transiciones sin evento de dominio propio (registro, pago, en proceso, cierre…):
      // todo cambio de estado debe quedar en la trazabilidad (AGENTS.md).
      await this.eventBus.publish({
        tipo: 'tramite.avanzado',
        version: 1,
        pacienteId: tramite.pacienteId,
        tramiteId: tramite.id,
        canal: data.canal,
        actor,
        datos: {
          folio: tramite.folio,
          estadoAnterior: estadoPrevio,
          estadoNuevo: data.estadoDestino,
          pasoActual: tramite.pasoActual,
        },
      });
    }

    return tramite;
  }

  async pausar(
    idOFolio: string,
    entrada: z.input<typeof PausarTramiteSchema>,
    actor: { tipo: TipoActor; id: string },
    opciones: { ocurridoEn?: string } = {},
  ): Promise<TramiteRegistro> {
    const parsed = PausarTramiteSchema.safeParse(entrada);
    if (!parsed.success) {
      throw new BadRequestException('Datos inválidos para pausar trámite');
    }

    const tramite = this.obtenerPorIdOFolio(idOFolio);
    await this.controlarEscritura(tramite, parsed.data.canal, actor, parsed.data.versionEsperada);
    const chequeo = validarTransicionTramite(tramite.estado, 'pausado', {});
    if (!chequeo.valida) {
      throw new ConflictException(chequeo.motivo);
    }

    const estadoPrevio = tramite.estado;
    const ahora = new Date().toISOString();

    tramite.estadoAnterior = estadoPrevio;
    tramite.estado = 'pausado';
    tramite.ultimoCanal = parsed.data.canal;
    tramite.actualizadoEn = ahora;
    tramite.contexto.ultimoCanal = parsed.data.canal;
    tramite.contexto.actualizadoEn = ahora;
    if (parsed.data.pendientes) {
      tramite.contexto.pendientes = parsed.data.pendientes;
    }

    this.incrementarVersion(tramite);
    await this.sincronizarCacheContexto(tramite);

    await this.eventBus.publish({
      tipo: 'tramite.pausado',
      version: 1,
      pacienteId: tramite.pacienteId,
      tramiteId: tramite.id,
      canal: parsed.data.canal,
      actor,
      ...(opciones.ocurridoEn ? { ocurridoEn: opciones.ocurridoEn } : {}),
      versionTramite: this.versionDe(tramite),
      datos: {
        folio: tramite.folio,
        estadoPrevio,
        pasoActual: tramite.pasoActual,
        pendientes: tramite.contexto.pendientes,
        ...(parsed.data.motivo ? { motivo: parsed.data.motivo } : {}),
      },
    });

    return tramite;
  }

  async retomar(
    idOFolio: string,
    entrada: z.input<typeof RetomarTramiteSchema>,
    actor: { tipo: TipoActor; id: string },
  ): Promise<TramiteRegistro> {
    const parsed = RetomarTramiteSchema.safeParse(entrada);
    if (!parsed.success) {
      throw new BadRequestException('Datos inválidos para retomar trámite');
    }

    const tramite = this.obtenerPorIdOFolio(idOFolio);
    await this.controlarEscritura(tramite, parsed.data.canal, actor, parsed.data.versionEsperada);
    if (tramite.estado !== 'pausado' || !tramite.estadoAnterior) {
      throw new ConflictException('Solo se puede retomar un trámite que esté en estado pausado');
    }

    const canalAnterior = tramite.ultimoCanal;
    const estadoRestaurado = tramite.estadoAnterior;
    const ahora = new Date().toISOString();

    tramite.estado = estadoRestaurado;
    tramite.estadoAnterior = null;
    tramite.ultimoCanal = parsed.data.canal;
    tramite.actualizadoEn = ahora;
    tramite.contexto.ultimoCanal = parsed.data.canal;
    tramite.contexto.actualizadoEn = ahora;

    this.incrementarVersion(tramite);
    await this.sincronizarCacheContexto(tramite);

    if (canalAnterior !== parsed.data.canal) {
      await this.eventBus.publish({
        tipo: 'canal.cambiado',
        version: 1,
        pacienteId: tramite.pacienteId,
        tramiteId: tramite.id,
        canal: parsed.data.canal,
        actor,
        datos: {
          canalAnterior,
          canalNuevo: parsed.data.canal,
          pasoActual: tramite.pasoActual,
          verificado: true,
        },
      });
    }

    await this.eventBus.publish({
      tipo: 'tramite.retomado',
      version: 1,
      pacienteId: tramite.pacienteId,
      tramiteId: tramite.id,
      canal: parsed.data.canal,
      actor,
      datos: {
        folio: tramite.folio,
        estadoRestaurado,
        pasoActual: tramite.pasoActual,
        canalAnterior,
        canalActual: parsed.data.canal,
      },
    });

    return tramite;
  }

  async cancelar(
    idOFolio: string,
    entrada: z.input<typeof CancelarTramiteSchema>,
    actor: { tipo: TipoActor; id: string },
  ): Promise<TramiteRegistro> {
    const parsed = CancelarTramiteSchema.safeParse(entrada);
    if (!parsed.success) {
      throw new BadRequestException('Datos inválidos para cancelar trámite');
    }

    const tramite = this.obtenerPorIdOFolio(idOFolio);
    await this.controlarEscritura(tramite, parsed.data.canal, actor, parsed.data.versionEsperada);
    const chequeo = validarTransicionTramite(
      tramite.estado,
      'cancelado',
      {},
      tramite.estadoAnterior,
    );
    if (!chequeo.valida) {
      throw new ConflictException(chequeo.motivo);
    }

    const ahora = new Date().toISOString();
    const estadoPrevio = tramite.estado;
    const citaCancelada = Boolean(tramite.cita && tramite.cita.estatus !== 'cancelada');

    tramite.estado = 'cancelado';
    tramite.estadoAnterior = null;
    tramite.pasoActual = 'cancelado';
    tramite.ultimoCanal = parsed.data.canal;
    tramite.actualizadoEn = ahora;
    tramite.contexto.pasoActual = 'cancelado';
    tramite.contexto.pendientes = [];
    tramite.contexto.ultimoCanal = parsed.data.canal;
    tramite.contexto.actualizadoEn = ahora;
    if (tramite.cita) {
      tramite.cita.estatus = 'cancelada';
    }
    this.registrarPaso(tramite, 'cancelado', parsed.data.canal, ahora, {
      datos: parsed.data.motivo ? { motivo: parsed.data.motivo } : null,
      completado: true,
    });

    tramite.contexto.propietario = null;
    this.incrementarVersion(tramite);
    await this.sincronizarCacheContexto(tramite);

    await this.eventBus.publish({
      tipo: 'tramite.cancelado',
      version: 1,
      pacienteId: tramite.pacienteId,
      tramiteId: tramite.id,
      canal: parsed.data.canal,
      actor,
      datos: {
        folio: tramite.folio,
        estadoPrevio,
        citaCancelada,
        ...(parsed.data.motivo ? { motivo: parsed.data.motivo } : {}),
      },
    });

    return tramite;
  }
}
