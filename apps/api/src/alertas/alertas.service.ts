import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { CanalAtencion } from '@salud-digna/shared';
import { z } from 'zod';
import { AuditoriaService } from '../auditoria/auditoria.service';
import type { UsuarioAutenticado } from '../auth/guards';
import { CanalesService } from '../canales/canales.service';
import { PacienteStoreService } from '../identidad/paciente-store.service';
import { ConsentimientoService } from '../privacidad/consentimiento.service';
import { TramitesService } from '../tramites/tramites.service';

export type NivelAlerta = 'informativa' | 'preventiva' | 'urgente';

export interface AlertaEpidemiologica {
  id: string;
  titulo: string;
  mensaje: string;
  region: string;
  vigenciaHasta: string;
  nivel: NivelAlerta;
  activa: boolean;
  creadoPorId: string;
  creadoEn: string;
  destinatariosNotificados: number;
  omitidosPorConsentimiento: number;
  esDemo: boolean;
}

export interface EntregaAlertaPaciente {
  id: string;
  alertaId: string;
  pacienteId: string;
  canal: CanalAtencion;
  titulo: string;
  mensaje: string;
  nivel: NivelAlerta;
  region: string;
  enviadoEn: string;
}

export interface RecordatorioPreventivo {
  regla: string;
  pacienteId: string;
  estudioSugeridoId: string;
  estudioSugeridoNombre: string;
  mensaje: string;
  canalDestino: CanalAtencion;
  evaluadoEn: string;
}

export const CrearAlertaSchema = z.object({
  titulo: z.string().min(4).max(160),
  mensaje: z.string().min(10).max(800),
  region: z.string().min(2).max(60),
  vigenciaHasta: z.string().datetime({ offset: true }).optional(),
  nivel: z.enum(['informativa', 'preventiva', 'urgente']).default('preventiva'),
});

const MS_365_DIAS = 365 * 24 * 60 * 60 * 1000;

/**
 * Alertas epidemiológicas por región y recordatorios de prevención (#32).
 * Respeta consentimiento de notificaciones (LFPDPPP) y envía por el canal preferido del paciente.
 */
@Injectable()
export class AlertasService {
  private readonly alertas: AlertaEpidemiologica[] = [];
  private readonly entregas: EntregaAlertaPaciente[] = [];
  private readonly recordatoriosEnviadosHoy = new Set<string>();

  constructor(
    private readonly pacientes: PacienteStoreService,
    private readonly consentimientos: ConsentimientoService,
    private readonly canales: CanalesService,
    private readonly tramites: TramitesService,
    private readonly auditoria: AuditoriaService,
  ) {
    this.sembrarDemo();
  }

  private sembrarDemo(): void {
    const dentroDe30Dias = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const ahora = new Date().toISOString();
    this.alertas.push(
      {
        id: 'alr_demo_dengue_pue',
        titulo: 'Prevención de dengue en temporada de lluvias',
        mensaje:
          'Si presentas fiebre alta y dolor retroocular, acude a valoración médica. En Salud Digna Puebla contamos con biometría hemática para seguimiento indicado por tu médico.',
        region: 'Puebla',
        vigenciaHasta: dentroDe30Dias,
        nivel: 'preventiva',
        activa: true,
        creadoPorId: 'usr_admin_01',
        creadoEn: ahora,
        destinatariosNotificados: 1,
        omitidosPorConsentimiento: 0,
        esDemo: true,
      },
      {
        id: 'alr_demo_influenza_cdmx',
        titulo: 'Campaña preventiva de influenza estacional',
        mensaje:
          'Refuerza medidas preventivas respiratorias y realiza tu chequeo general preventivo en clínicas CDMX.',
        region: 'CDMX',
        vigenciaHasta: dentroDe30Dias,
        nivel: 'informativa',
        activa: true,
        creadoPorId: 'usr_admin_01',
        creadoEn: ahora,
        destinatariosNotificados: 0,
        omitidosPorConsentimiento: 0,
        esDemo: true,
      },
    );
  }

  private puedeRecibirNotificaciones(pacienteId: string): boolean {
    const historial = this.consentimientos
      .listarPorPaciente(pacienteId)
      .filter((c) => c.tipo === 'notificaciones');
    if (historial.length === 0) {
      // Sin revocación registrada: permitido para pacientes demo; si existe registro exige vigencia
      return true;
    }
    return this.consentimientos.tieneConsentimientoVigente(pacienteId, 'notificaciones');
  }

  async publicarAlerta(
    entrada: z.input<typeof CrearAlertaSchema>,
    actor: UsuarioAutenticado,
    ip = '127.0.0.1',
  ): Promise<{ alerta: AlertaEpidemiologica; entregas: EntregaAlertaPaciente[] }> {
    const parsed = CrearAlertaSchema.safeParse(entrada);
    if (!parsed.success) {
      throw new BadRequestException({
        mensaje: 'Datos inválidos para publicar alerta epidemiológica',
        errores: parsed.error.flatten().fieldErrors,
      });
    }

    const d = parsed.data;
    const ahora = new Date().toISOString();
    const vigenciaHasta =
      d.vigenciaHasta ?? new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();

    const alerta: AlertaEpidemiologica = {
      id: `alr_${randomUUID().slice(0, 10)}`,
      titulo: d.titulo.trim(),
      mensaje: d.mensaje.trim(),
      region: d.region.trim(),
      vigenciaHasta,
      nivel: d.nivel,
      activa: true,
      creadoPorId: actor.id,
      creadoEn: ahora,
      destinatariosNotificados: 0,
      omitidosPorConsentimiento: 0,
      esDemo: true,
    };

    const esTodas = alerta.region.toLowerCase() === 'todas';
    const destinatarios = this.pacientes
      .listarTodosActivos()
      .filter((p) => esTodas || (p.region ?? '').toLowerCase() === alerta.region.toLowerCase());

    const entregasNuevas: EntregaAlertaPaciente[] = [];
    for (const p of destinatarios) {
      if (!this.puedeRecibirNotificaciones(p.id)) {
        alerta.omitidosPorConsentimiento += 1;
        continue;
      }

      const entrega: EntregaAlertaPaciente = {
        id: `eal_${randomUUID().slice(0, 10)}`,
        alertaId: alerta.id,
        pacienteId: p.id,
        canal: p.canalPreferido,
        titulo: alerta.titulo,
        mensaje: alerta.mensaje,
        nivel: alerta.nivel,
        region: alerta.region,
        enviadoEn: ahora,
      };
      this.entregas.push(entrega);
      entregasNuevas.push(entrega);
      alerta.destinatariosNotificados += 1;

      await this.canales
        .registrarInteraccionCanal({
          pacienteId: p.id,
          canal: p.canalPreferido,
          actorTipo: 'sistema',
          actorId: 'alertas-epidemiologicas',
          resumen: `Alerta preventiva (${alerta.region}): ${alerta.titulo}`,
          referenciaExterna: `${alerta.id}_${p.id}`,
          metadatos: { alertaId: alerta.id, nivel: alerta.nivel, region: alerta.region },
        })
        .catch(() => undefined);
    }

    this.alertas.unshift(alerta);

    await this.auditoria.registrar({
      usuarioId: actor.id,
      rol: actor.rol,
      accion: 'crear',
      entidad: 'AlertaEpidemiologica',
      entidadId: alerta.id,
      canal: 'web',
      ip,
      exitoso: true,
      detalleSinPii: {
        region: alerta.region,
        nivel: alerta.nivel,
        destinatariosNotificados: alerta.destinatariosNotificados,
        omitidosPorConsentimiento: alerta.omitidosPorConsentimiento,
      },
    });

    return { alerta, entregas: entregasNuevas };
  }

  listarActivas(region?: string, ahoraMs = Date.now()): AlertaEpidemiologica[] {
    const reg = region?.trim().toLowerCase();
    return this.alertas.filter((a) => {
      if (!a.activa) return false;
      if (Date.parse(a.vigenciaHasta) < ahoraMs) return false;
      if (reg && reg !== 'todas' && a.region.toLowerCase() !== 'todas') {
        return a.region.toLowerCase() === reg;
      }
      return true;
    });
  }

  listarEntregasPaciente(pacienteId: string): EntregaAlertaPaciente[] {
    return this.entregas.filter((e) => e.pacienteId === pacienteId);
  }

  /**
   * Reglas simples de prevención según historial de estudios del paciente (#32):
   * - Último chequeo de glucosa > 12 meses (o nunca realizado) -> recordatorio preventivo.
   * - Chequeo general de biometría hemática > 12 meses -> recordatorio anual.
   */
  evaluarPrevencionPaciente(pacienteId: string, ahoraMs = Date.now()): RecordatorioPreventivo[] {
    const paciente = this.pacientes.buscarPorId(pacienteId);
    if (!paciente || !this.puedeRecibirNotificaciones(pacienteId)) {
      return [];
    }

    const historial = this.tramites.listarPorPaciente(pacienteId);
    const ahoraIso = new Date(ahoraMs).toISOString();
    const sugerencias: RecordatorioPreventivo[] = [];

    const ultimoGlucosa = historial.find(
      (t) =>
        t.estudioId === 'est_lab_glu' ||
        t.estudioId === 'est_lab_qs6' ||
        t.estudioId === 'est_lab_qs27',
    );
    const glucosaVencida =
      !ultimoGlucosa || ahoraMs - Date.parse(ultimoGlucosa.creadoEn) > MS_365_DIAS;

    if (glucosaVencida) {
      sugerencias.push({
        regla: 'glucosa_anual_12m',
        pacienteId,
        estudioSugeridoId: 'est_lab_glu',
        estudioSugeridoNombre: 'Glucosa sérica en ayuno',
        mensaje:
          'Recordatorio preventivo: tu último chequeo de glucosa fue hace más de 12 meses (o no tenemos registro). Realizar una glucosa anual ayuda a detectar cambios a tiempo.',
        canalDestino: paciente.canalPreferido,
        evaluadoEn: ahoraIso,
      });
    }

    const ultimaBh = historial.find((t) => t.estudioId === 'est_lab_bh');
    const bhVencida = !ultimaBh || ahoraMs - Date.parse(ultimaBh.creadoEn) > MS_365_DIAS;
    if (bhVencida) {
      sugerencias.push({
        regla: 'biometria_anual_12m',
        pacienteId,
        estudioSugeridoId: 'est_lab_bh',
        estudioSugeridoNombre: 'Biometría hemática completa',
        mensaje:
          'Chequeo preventivo anual sugerido: una biometría hemática te permite monitorear tu salud general con un estudio rápido y accesible.',
        canalDestino: paciente.canalPreferido,
        evaluadoEn: ahoraIso,
      });
    }

    return sugerencias;
  }

  async despacharRecordatoriosPreventivos(ahoraMs = Date.now()) {
    const fechaDia = new Date(ahoraMs).toISOString().slice(0, 10);
    const despachados: RecordatorioPreventivo[] = [];

    for (const paciente of this.pacientes.listarTodosActivos()) {
      const lista = this.evaluarPrevencionPaciente(paciente.id, ahoraMs);
      for (const rec of lista) {
        const clave = `${paciente.id}:${rec.regla}:${fechaDia}`;
        if (this.recordatoriosEnviadosHoy.has(clave)) continue;
        this.recordatoriosEnviadosHoy.add(clave);
        despachados.push(rec);

        await this.canales
          .registrarInteraccionCanal({
            pacienteId: paciente.id,
            canal: rec.canalDestino,
            actorTipo: 'sistema',
            actorId: 'prevencion-salud',
            resumen: rec.mensaje,
            referenciaExterna: `prev_${paciente.id}_${rec.regla}_${fechaDia}`,
            metadatos: { regla: rec.regla, estudioSugeridoId: rec.estudioSugeridoId },
          })
          .catch(() => undefined);
      }
    }

    return { totalDespachados: despachados.length, recordatorios: despachados };
  }
}
