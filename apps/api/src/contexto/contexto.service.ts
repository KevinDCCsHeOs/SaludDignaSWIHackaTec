import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CanalAtencion, TipoActor } from '@salud-digna/shared';
import { CANALES_ATENCION } from '@salud-digna/shared';
import { z } from 'zod';
import { CatalogosService } from '../catalogos/catalogos.service';
import { KeyValueStoreService } from '../common/redis/kv-store.service';
import { EventBusService } from '../eventos/event-bus.service';
import { validarTransicionTramite } from '../tramites/maquina-estados';
import {
  ContextoTramite,
  esEstadoTerminal,
  TramiteRegistro,
  TramitesService,
} from '../tramites/tramites.service';

export const PatchContextoSchema = z.object({
  canal: z.enum(CANALES_ATENCION),
  pasoActual: z.string().min(1).max(60).optional(),
  estudioId: z.string().min(1).max(36).optional(),
  clinicaId: z.string().min(1).max(36).optional(),
  fechaTentativa: z.string().datetime({ offset: true }).nullable().optional(),
  datosCapturados: z.record(z.unknown()).optional(),
  pendientes: z.array(z.string().min(1).max(80)).optional(),
});

const ETIQUETAS_PASO: Record<string, string> = {
  cotizacion: 'cotización',
  registro: 'registro',
  seleccion_clinica: 'selección de clínica',
  cita_agendada: 'cita agendada',
  cita_confirmada: 'cita confirmada',
  pago_factura: 'pago y facturación',
  en_proceso: 'estudio en proceso',
  resultados_liberados: 'resultados liberados',
  cerrado: 'trámite cerrado',
  pausado: 'trámite pausado',
  cancelado: 'trámite cancelado',
};

const ETIQUETAS_PENDIENTE: Record<string, string> = {
  elegir_estudio: 'elegir estudio',
  elegir_clinica: 'elegir clínica',
  confirmar_fecha: 'confirmar fecha y horario',
  aceptar_preparacion: 'aceptar indicaciones de preparación',
};

/**
 * Genera el resumen en lenguaje natural del contexto acumulado para el bot y la consola del asesor (#13).
 */
export function resumenContexto(
  tramite: Pick<TramiteRegistro, 'folio' | 'estado' | 'contexto'>,
): string {
  const ctx = tramite.contexto;
  const estudioTexto = ctx.estudio ? ctx.estudio.nombre : 'un trámite pendiente';
  const clinicaTexto = ctx.clinica ? ` en ${ctx.clinica.nombre}` : '';
  const pasoTexto = ETIQUETAS_PASO[ctx.pasoActual] ?? ctx.pasoActual;
  const pendientesLegibles = ctx.pendientes.map((p) => ETIQUETAS_PENDIENTE[p] ?? p);
  const faltantesTexto =
    pendientesLegibles.length > 0 ? ` Falta: ${pendientesLegibles.join(', ')}.` : '';

  return `Tienes un ${estudioTexto} pendiente${clinicaTexto} (folio ${tramite.folio}, paso: ${pasoTexto}).${faltantesTexto}`;
}

@Injectable()
export class ContextoService {
  constructor(
    private readonly tramites: TramitesService,
    private readonly catalogos: CatalogosService,
    private readonly kv: KeyValueStoreService,
    private readonly eventBus: EventBusService,
  ) {}

  /**
   * Autoguardado parcial en cada interacción sin esperar a "Confirmar" (#13).
   * Aplica política "último cambio gana + registro de conflicto" y actualiza caché Redis (TTL 24 h).
   */
  async actualizarParcial(
    tramiteId: string,
    entrada: z.input<typeof PatchContextoSchema>,
    actor: { tipo: TipoActor; id: string },
  ): Promise<{ tramite: TramiteRegistro; resumen: string }> {
    const parsed = PatchContextoSchema.safeParse(entrada);
    if (!parsed.success) {
      throw new BadRequestException({
        mensaje: 'Datos inválidos para actualizar contexto',
        errores: parsed.error.flatten().fieldErrors,
      });
    }

    const tramite = this.tramites.obtenerPorIdOFolio(tramiteId);
    if (esEstadoTerminal(tramite.estado)) {
      throw new ConflictException(
        `El trámite ${tramite.folio} está ${tramite.estado}; ya no se puede modificar su contexto`,
      );
    }
    const data = parsed.data;
    const ahora = new Date().toISOString();
    const canalAnterior = tramite.ultimoCanal;
    const ctx = tramite.contexto;

    let estudioSeleccionado: {
      id: string;
      nombre: string;
      precio: number;
      preparacion: string;
    } | null = null;
    let clinicaSeleccionada: { id: string; nombre: string; region: string } | null = null;

    if (data.estudioId) {
      const est = this.catalogos.obtenerEstudioPorId(data.estudioId);
      if (ctx.estudio && ctx.estudio.id !== est.id) {
        ctx.conflictos.push({
          campo: 'estudio',
          valorAnterior: ctx.estudio.id,
          valorNuevo: est.id,
          canal: data.canal,
          en: ahora,
        });
      }
      tramite.estudioId = est.id;
      ctx.estudio = { id: est.id, nombre: est.nombre, precio: est.precio };
      ctx.pendientes = ctx.pendientes.filter((p) => p !== 'elegir_estudio');
      estudioSeleccionado = est;
    }

    if (data.clinicaId) {
      const cli = this.catalogos.obtenerClinicaPorId(data.clinicaId);
      if (ctx.clinica && ctx.clinica.id !== cli.id) {
        ctx.conflictos.push({
          campo: 'clinica',
          valorAnterior: ctx.clinica.id,
          valorNuevo: cli.id,
          canal: data.canal,
          en: ahora,
        });
      }
      tramite.clinicaId = cli.id;
      tramite.region = cli.region;
      ctx.clinica = { id: cli.id, nombre: cli.nombre, region: cli.region };
      ctx.pendientes = ctx.pendientes.filter((p) => p !== 'elegir_clinica');
      this.avanzarASeleccionClinicaSiProcede(tramite, data.canal, ahora);
      clinicaSeleccionada = cli;
    }

    if (data.pasoActual) {
      tramite.pasoActual = data.pasoActual;
      ctx.pasoActual = data.pasoActual;
    }

    if (data.fechaTentativa !== undefined) {
      if (ctx.fechaTentativa && ctx.fechaTentativa !== data.fechaTentativa) {
        ctx.conflictos.push({
          campo: 'fechaTentativa',
          valorAnterior: ctx.fechaTentativa,
          valorNuevo: data.fechaTentativa,
          canal: data.canal,
          en: ahora,
        });
      }
      ctx.fechaTentativa = data.fechaTentativa;
    }

    if (data.datosCapturados) {
      for (const [k, v] of Object.entries(data.datosCapturados)) {
        if (ctx.datosCapturados[k] !== undefined && ctx.datosCapturados[k] !== v) {
          ctx.conflictos.push({
            campo: `datosCapturados.${k}`,
            valorAnterior: ctx.datosCapturados[k],
            valorNuevo: v,
            canal: data.canal,
            en: ahora,
          });
        }
        ctx.datosCapturados[k] = v;
      }
    }

    if (data.pendientes) {
      ctx.pendientes = data.pendientes;
    }

    tramite.ultimoCanal = data.canal;
    tramite.actualizadoEn = ahora;
    ctx.ultimoCanal = data.canal;
    ctx.actualizadoEn = ahora;

    await this.tramites.sincronizarCacheContexto(tramite);

    // Emitir cambio de canal si cambió respecto al último contacto (#13)
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
          pasoActual: ctx.pasoActual,
          verificado: true,
        },
      });
    }

    if (estudioSeleccionado) {
      await this.eventBus.publish({
        tipo: 'estudio.seleccionado',
        version: 1,
        pacienteId: tramite.pacienteId,
        tramiteId: tramite.id,
        canal: data.canal,
        actor,
        datos: {
          estudioId: estudioSeleccionado.id,
          estudioNombre: estudioSeleccionado.nombre,
          precio: estudioSeleccionado.precio,
          requierePreparacion: Boolean(estudioSeleccionado.preparacion),
        },
      });
    }

    if (clinicaSeleccionada) {
      await this.eventBus.publish({
        tipo: 'clinica.seleccionada',
        version: 1,
        pacienteId: tramite.pacienteId,
        tramiteId: tramite.id,
        canal: data.canal,
        actor,
        datos: {
          clinicaId: clinicaSeleccionada.id,
          clinicaNombre: clinicaSeleccionada.nombre,
          ...(tramite.estudioId ? { estudioId: tramite.estudioId } : {}),
          region: clinicaSeleccionada.region,
        },
      });
    }

    return {
      tramite,
      resumen: resumenContexto(tramite),
    };
  }

  /**
   * Elegir clínica durante el autoguardado avanza el trámite a `seleccion_clinica`, pero solo si la
   * máquina de estados lo permite (por ejemplo, exige estudio). Si el trámite está pausado, se
   * actualiza el estado al que regresará al retomarse (#12, #13).
   */
  private avanzarASeleccionClinicaSiProcede(
    tramite: TramiteRegistro,
    canal: CanalAtencion,
    ahora: string,
  ): void {
    const datos = { estudioId: tramite.estudioId, clinicaId: tramite.clinicaId };

    if (tramite.estado === 'pausado') {
      const previo = tramite.estadoAnterior;
      if (
        (previo === 'cotizacion' || previo === 'registro') &&
        validarTransicionTramite(previo, 'seleccion_clinica', datos).valida
      ) {
        tramite.estadoAnterior = 'seleccion_clinica';
        tramite.pasoActual = 'seleccion_clinica';
        tramite.contexto.pasoActual = 'seleccion_clinica';
      }
      return;
    }

    if (tramite.estado !== 'cotizacion' && tramite.estado !== 'registro') return;
    if (!validarTransicionTramite(tramite.estado, 'seleccion_clinica', datos).valida) return;

    tramite.estado = 'seleccion_clinica';
    tramite.pasoActual = 'seleccion_clinica';
    tramite.contexto.pasoActual = 'seleccion_clinica';
    this.tramites.registrarPaso(tramite, 'seleccion_clinica', canal, ahora, {
      datos: { clinicaId: tramite.clinicaId },
    });
  }

  /**
   * Consulta el contexto acumulado del paciente desde cualquier canal (#13).
   * Lee caché `ctx:{pacienteId}` en Redis y cae a la fuente de verdad si no existe en caché.
   */
  async obtenerPorPaciente(pacienteId: string): Promise<{
    pacienteId: string;
    tramiteId: string;
    folio: string;
    estado: string;
    contexto: ContextoTramite;
    resumen: string;
    origen: 'cache_redis' | 'fuente_verdad';
  }> {
    const enCache = await this.kv.get(`ctx:${pacienteId}`);
    if (enCache) {
      try {
        const parsed = JSON.parse(enCache) as {
          tramiteId: string;
          folio: string;
          estado: TramiteRegistro['estado'];
          contexto: ContextoTramite;
        };
        // Una entrada vieja de un trámite ya cerrado o cancelado no se sirve como "activo"
        if (!esEstadoTerminal(parsed.estado)) {
          return {
            pacienteId,
            ...parsed,
            resumen: resumenContexto(parsed),
            origen: 'cache_redis',
          };
        }
      } catch {
        // Entrada corrupta en caché: se ignora y se consulta la fuente de verdad
      }
    }

    const activo = this.tramites.obtenerActivoDePaciente(pacienteId);
    if (!activo) {
      throw new NotFoundException(`No hay un trámite activo para el paciente ${pacienteId}`);
    }

    await this.tramites.sincronizarCacheContexto(activo);
    return {
      pacienteId,
      tramiteId: activo.id,
      folio: activo.folio,
      estado: activo.estado,
      contexto: activo.contexto,
      resumen: resumenContexto(activo),
      origen: 'fuente_verdad',
    };
  }

  async registrarCambioDeCanal(
    tramiteId: string,
    canalNuevo: CanalAtencion,
    actor: { tipo: TipoActor; id: string },
  ) {
    return this.actualizarParcial(tramiteId, { canal: canalNuevo }, actor);
  }
}
