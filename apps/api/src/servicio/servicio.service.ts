import { BadRequestException, Injectable } from '@nestjs/common';
import type { EstatusClinica } from '@salud-digna/shared';
import { CatalogosService } from '../catalogos/catalogos.service';
import { ResultadosService } from '../resultados/resultados.service';
import { TramitesService } from '../tramites/tramites.service';

export type EtapaProcesoDiagnostico =
  'pendiente_toma' | 'muestra_tomada' | 'en_analisis' | 'en_validacion' | 'listo';

export interface EstadoProcesoDiagnostico {
  tramiteId: string;
  folio: string;
  pacienteId: string;
  estudioNombre: string | null;
  etapaDiagnostica: EtapaProcesoDiagnostico;
  etiquetaEtapa: string;
  progresoPct: number;
  horaEstimadaEntrega: string;
  clinica: {
    id: string;
    nombre: string;
    region: string;
    estatus: EstatusClinica;
    mensajeEstatus: string | null;
    tieneIncidencia: boolean;
  } | null;
}

const ETIQUETA_ETAPA: Record<
  EtapaProcesoDiagnostico,
  { etiqueta: string; pct: number; horas: number }
> = {
  pendiente_toma: { etiqueta: 'Pendiente de toma en clínica', pct: 20, horas: 24 },
  muestra_tomada: { etiqueta: 'Muestra tomada', pct: 45, horas: 12 },
  en_analisis: { etiqueta: 'En análisis técnico', pct: 70, horas: 6 },
  en_validacion: { etiqueta: 'En validación médica', pct: 88, horas: 2 },
  listo: { etiqueta: 'Listo para consulta y descarga', pct: 100, horas: 0 },
};

/**
 * Estatus general del servicio por clínica y estatus del proceso diagnóstico (#31).
 */
@Injectable()
export class ServicioService {
  constructor(
    private readonly catalogos: CatalogosService,
    private readonly tramites: TramitesService,
    private readonly resultados: ResultadosService,
  ) {}

  obtenerEstatusGeneral(region?: string) {
    const clinicas = this.catalogos.listarClinicas(region ? { region } : undefined);
    const resumen = {
      operando: clinicas.filter((c) => c.estatus === 'operando').length,
      retraso: clinicas.filter((c) => c.estatus === 'retraso').length,
      fuera_de_servicio: clinicas.filter((c) => c.estatus === 'fuera_de_servicio').length,
    };
    const incidencias = clinicas
      .filter((c) => c.estatus !== 'operando')
      .map((c) => ({
        clinicaId: c.id,
        nombre: c.nombre,
        region: c.region,
        estatus: c.estatus,
        mensaje: c.mensajeEstatus ?? 'Incidencia operativa reportada en clínica.',
      }));

    return {
      region: region ?? 'todas',
      actualizadoEn: new Date().toISOString(),
      resumen,
      incidencias,
      clinicas,
    };
  }

  actualizarEstatusClinica(
    clinicaId: string,
    estatus: EstatusClinica,
    mensajeEstatus?: string | null,
  ) {
    if (!['operando', 'retraso', 'fuera_de_servicio'].includes(estatus)) {
      throw new BadRequestException('Estatus de clínica inválido');
    }
    return this.catalogos.actualizarEstatusClinica(clinicaId, estatus, mensajeEstatus ?? null);
  }

  obtenerProcesoDiagnostico(idOFolio: string): EstadoProcesoDiagnostico {
    const tramite = this.tramites.obtenerPorIdOFolio(idOFolio);
    const resultado = this.resultados.buscarPorTramiteId(tramite.id);
    const clinica = tramite.clinicaId
      ? this.catalogos.obtenerClinicaPorId(tramite.clinicaId)
      : null;

    let etapa: EtapaProcesoDiagnostico = 'pendiente_toma';
    if (resultado) {
      if (resultado.estado === 'liberado') etapa = 'listo';
      else if (resultado.estado === 'validacion_medica') etapa = 'en_validacion';
      else if (resultado.estado === 'revision_tecnica') etapa = 'en_validacion';
      else etapa = 'en_analisis';
    } else if (tramite.estado === 'resultados_liberados' || tramite.estado === 'cerrado') {
      etapa = 'listo';
    } else if (tramite.estado === 'en_proceso') {
      etapa = 'en_analisis';
    } else if (tramite.estado === 'pago_factura') {
      etapa = 'muestra_tomada';
    }

    const meta = ETIQUETA_ETAPA[etapa];
    const baseMs = Date.parse(tramite.actualizadoEn) || Date.now();
    const horaEstimadaEntrega = new Date(baseMs + meta.horas * 60 * 60 * 1000).toISOString();

    return {
      tramiteId: tramite.id,
      folio: tramite.folio,
      pacienteId: tramite.pacienteId,
      estudioNombre: tramite.contexto.estudio?.nombre ?? null,
      etapaDiagnostica: etapa,
      etiquetaEtapa: meta.etiqueta,
      progresoPct: meta.pct,
      horaEstimadaEntrega,
      clinica: clinica
        ? {
            id: clinica.id,
            nombre: clinica.nombre,
            region: clinica.region,
            estatus: clinica.estatus,
            mensajeEstatus: clinica.mensajeEstatus,
            tieneIncidencia: clinica.estatus !== 'operando',
          }
        : null,
    };
  }
}
