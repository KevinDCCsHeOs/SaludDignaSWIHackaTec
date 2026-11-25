import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { CanalesService } from '../canales/canales.service';
import { CatalogosService } from '../catalogos/catalogos.service';
import { TramitesService } from '../tramites/tramites.service';

export interface AlertaVigencia {
  tramiteId: string;
  folio: string;
  pacienteId: string;
  estudioNombre: string;
  venceEn: string;
  diasRestantes: number;
  mensajeRecordatorio: string;
  notificadoEn: string;
}

const MS_POR_DIA = 24 * 60 * 60 * 1000;
const UMBRAL_DIAS_VIGENCIA = 3;

/**
 * Job diario de vigencias (#25):
 * Detecta órdenes o estudios activos cuya vigencia vence en los próximos 3 días
 * y registra recordatorios proactivos para el paciente sin duplicarlos en el mismo día.
 */
@Injectable()
export class VigenciasService implements OnModuleInit, OnModuleDestroy {
  private readonly alertasRegistradas: AlertaVigencia[] = [];
  private readonly clavesNotificadas = new Set<string>();
  private intervaloDiario: NodeJS.Timeout | null = null;

  constructor(
    private readonly tramites: TramitesService,
    private readonly catalogos: CatalogosService,
    private readonly canales: CanalesService,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV !== 'test') {
      this.intervaloDiario = setInterval(() => {
        void this.verificarVigencias();
      }, MS_POR_DIA);
      this.intervaloDiario.unref();
    }
  }

  onModuleDestroy(): void {
    if (this.intervaloDiario) {
      clearInterval(this.intervaloDiario);
      this.intervaloDiario = null;
    }
  }

  private calcularVencimientoMs(tramite: {
    creadoEn: string;
    estudioId: string | null;
    contexto: { datosCapturados: Record<string, unknown> };
  }): { venceMs: number; estudioNombre: string } | null {
    const fechaExplicita = tramite.contexto.datosCapturados.fechaVencimientoOrden;
    const estudio = tramite.estudioId
      ? this.catalogos.obtenerEstudioPorId(tramite.estudioId)
      : null;

    if (typeof fechaExplicita === 'string' && !Number.isNaN(Date.parse(fechaExplicita))) {
      return {
        venceMs: Date.parse(fechaExplicita),
        estudioNombre: estudio?.nombre ?? 'tu orden de estudio',
      };
    }

    if (!estudio) return null;
    const creadoMs = Date.parse(tramite.creadoEn);
    if (Number.isNaN(creadoMs)) return null;
    return {
      venceMs: creadoMs + estudio.vigenciaDias * MS_POR_DIA,
      estudioNombre: estudio.nombre,
    };
  }

  listarProximasAVencer(ahoraMs = Date.now(), umbralDias = UMBRAL_DIAS_VIGENCIA): AlertaVigencia[] {
    const resultado: AlertaVigencia[] = [];
    const activos = this.tramites.listarTodosActivos();

    for (const tramite of activos) {
      const info = this.calcularVencimientoMs(tramite);
      if (!info) continue;
      const diffMs = info.venceMs - ahoraMs;
      const diasRestantes = Math.ceil(diffMs / MS_POR_DIA);
      if (diasRestantes <= umbralDias && diasRestantes >= 0) {
        const mensaje =
          diasRestantes === 0
            ? `Recordatorio de vigencia: tu orden de ${info.estudioNombre} (${tramite.folio}) vence hoy. Agenda o acude a tu clínica para no perderla.`
            : `Recordatorio de vigencia: tu orden de ${info.estudioNombre} (${tramite.folio}) vence en ${diasRestantes} día(s). ¿Deseas agendar tu cita ahora?`;

        resultado.push({
          tramiteId: tramite.id,
          folio: tramite.folio,
          pacienteId: tramite.pacienteId,
          estudioNombre: info.estudioNombre,
          venceEn: new Date(info.venceMs).toISOString(),
          diasRestantes,
          mensajeRecordatorio: mensaje,
          notificadoEn: new Date(ahoraMs).toISOString(),
        });
      }
    }

    return resultado;
  }

  async verificarVigencias(ahoraMs = Date.now()): Promise<{
    revisados: number;
    recordatoriosEnviados: AlertaVigencia[];
  }> {
    const activos = this.tramites.listarTodosActivos();
    const proximas = this.listarProximasAVencer(ahoraMs);
    const fechaDia = new Date(ahoraMs).toISOString().slice(0, 10);
    const enviadas: AlertaVigencia[] = [];

    for (const alerta of proximas) {
      const clave = `${alerta.tramiteId}:${fechaDia}`;
      if (this.clavesNotificadas.has(clave)) continue;
      this.clavesNotificadas.add(clave);
      this.alertasRegistradas.push(alerta);
      enviadas.push(alerta);

      await this.canales
        .registrarInteraccionCanal({
          pacienteId: alerta.pacienteId,
          tramiteId: alerta.tramiteId,
          canal: 'whatsapp',
          actorTipo: 'sistema',
          actorId: 'vigencias-job',
          resumen: alerta.mensajeRecordatorio,
          referenciaExterna: `vigencia_${alerta.tramiteId}_${fechaDia}`,
          metadatos: {
            tipo: 'recordatorio_vigencia',
            diasRestantes: alerta.diasRestantes,
            venceEn: alerta.venceEn,
          },
        })
        .catch(() => undefined);
    }

    return {
      revisados: activos.length,
      recordatoriosEnviados: enviadas,
    };
  }

  obtenerHistorialAlertas(): AlertaVigencia[] {
    return [...this.alertasRegistradas];
  }
}
