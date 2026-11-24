import type { EstadoTramite } from '@salud-digna/shared';

export interface DatosValidacionTransicion {
  estudioId?: string | null;
  clinicaId?: string | null;
  fechaHora?: string | null;
  citaId?: string | null;
  resultadoId?: string | null;
}

/**
 * Mapa explícito de transiciones válidas de la máquina de estados del trámite (#12).
 * El estado `pausado` se gestiona mediante `pausar` / `retomar` restaurando `estadoAnterior`.
 */
export const TRANSICIONES_VALIDAS_TRAMITE: Record<EstadoTramite, readonly EstadoTramite[]> = {
  cotizacion: ['registro', 'seleccion_clinica', 'pausado', 'cancelado'],
  registro: ['seleccion_clinica', 'pausado', 'cancelado'],
  seleccion_clinica: ['cita_agendada', 'pausado', 'cancelado'],
  cita_agendada: ['cita_confirmada', 'pausado', 'cancelado'],
  cita_confirmada: ['pago_factura', 'en_proceso', 'cancelado'],
  pago_factura: ['en_proceso', 'cancelado'],
  en_proceso: ['resultados_liberados'],
  resultados_liberados: ['cerrado'],
  cerrado: [],
  pausado: ['cotizacion', 'registro', 'seleccion_clinica', 'cita_agendada', 'cancelado'],
  cancelado: [],
};

export const ESTADOS_PAUSABLES: readonly EstadoTramite[] = [
  'cotizacion',
  'registro',
  'seleccion_clinica',
  'cita_agendada',
];

export function esTransicionValida(
  actual: EstadoTramite,
  destino: EstadoTramite,
  estadoAnterior?: EstadoTramite | null,
): boolean {
  if (actual === 'pausado') {
    if (destino === 'cancelado') return true;
    return Boolean(estadoAnterior && destino === estadoAnterior);
  }
  return TRANSICIONES_VALIDAS_TRAMITE[actual].includes(destino);
}

/**
 * Valida reglas de negocio y datos obligatorios antes de permitir una transición (#12).
 */
export function validarTransicionTramite(
  actual: EstadoTramite,
  destino: EstadoTramite,
  datos: DatosValidacionTransicion,
  estadoAnterior?: EstadoTramite | null,
): { valida: true } | { valida: false; motivo: string } {
  if (actual === destino) {
    return { valida: false, motivo: `El trámite ya se encuentra en el estado '${actual}'` };
  }

  if (!esTransicionValida(actual, destino, estadoAnterior)) {
    return {
      valida: false,
      motivo: `Transición inválida de '${actual}' a '${destino}'`,
    };
  }

  if (destino === 'seleccion_clinica' && !datos.estudioId) {
    return {
      valida: false,
      motivo: 'Debes seleccionar un estudio antes de avanzar a selección de clínica',
    };
  }

  if (destino === 'cita_agendada') {
    if (!datos.clinicaId) {
      return {
        valida: false,
        motivo: 'No se puede agendar una cita sin haber seleccionado una clínica',
      };
    }
    if (!datos.fechaHora) {
      return {
        valida: false,
        motivo: 'Debes indicar fecha y hora para agendar la cita',
      };
    }
  }

  if (destino === 'cita_confirmada' && !datos.citaId) {
    return {
      valida: false,
      motivo: 'No existe una cita agendada para confirmar',
    };
  }

  return { valida: true };
}
