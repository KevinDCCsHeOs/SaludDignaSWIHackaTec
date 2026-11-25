import type { CanalAtencion, EstadoTramite } from '@salud-digna/shared';
import type { EntradaTimelineDto, OrdenEstudiosDto, PropietarioTramiteDto } from './api';

/**
 * Reglas de la vista del operador tipo CRM (traspaso v2, sección 8). Se adaptan al flujo real del
 * prototipo; la prioridad y la siguiente mejor acción son propuestas del equipo por validar.
 */

const HORA_MS = 60 * 60 * 1000;

/** Umbral sin actividad del paciente para considerar el trámite detenido (2 h, propuesta). */
export const UMBRAL_DETENIDO_HORAS = 2;

// ----------------------------------------------------------------------------
// Avance por tramos
// ----------------------------------------------------------------------------

export interface TramoProceso {
  clave: string;
  etiqueta: string;
  completado: boolean;
  canal: CanalAtencion | null;
  fecha: string | null;
}

interface DefinicionTramo {
  clave: string;
  etiqueta: string;
  eventos: string[];
  /** Estados del trámite a partir de los cuales el tramo ya está hecho. */
  hechoDesde: EstadoTramite[];
}

const ORDEN_ESTADOS: EstadoTramite[] = [
  'cotizacion',
  'registro',
  'seleccion_clinica',
  'cita_agendada',
  'cita_confirmada',
  'pago_factura',
  'en_proceso',
  'resultados_liberados',
  'cerrado',
];

function estadosDesde(estado: EstadoTramite): EstadoTramite[] {
  return ORDEN_ESTADOS.slice(ORDEN_ESTADOS.indexOf(estado));
}

/** Plantilla "Agendar estudio" adaptada a los estados reales del trámite del prototipo. */
const TRAMOS_ESTUDIO: DefinicionTramo[] = [
  {
    clave: 'cotizar',
    etiqueta: 'Cotizar',
    eventos: ['cotizacion.iniciada', 'estudio.seleccionado'],
    hechoDesde: estadosDesde('cotizacion'),
  },
  {
    clave: 'identificarse',
    etiqueta: 'Identificarse',
    eventos: ['identidad.verificada'],
    hechoDesde: estadosDesde('cita_confirmada'),
  },
  {
    clave: 'clinica',
    etiqueta: 'Elegir clínica',
    eventos: ['clinica.seleccionada'],
    hechoDesde: estadosDesde('seleccion_clinica'),
  },
  {
    clave: 'horario',
    etiqueta: 'Apartar horario',
    eventos: ['cita.agendada', 'cita.apartada'],
    hechoDesde: estadosDesde('cita_agendada'),
  },
  {
    clave: 'confirmar',
    etiqueta: 'Confirmar cita',
    eventos: ['cita.confirmada'],
    hechoDesde: estadosDesde('cita_confirmada'),
  },
  {
    clave: 'pagar',
    etiqueta: 'Pagar',
    eventos: [],
    hechoDesde: estadosDesde('pago_factura'),
  },
  {
    clave: 'resultados',
    etiqueta: 'Resultados',
    eventos: ['resultado.liberado'],
    hechoDesde: estadosDesde('resultados_liberados'),
  },
];

/**
 * Cada tramo muestra el canal donde se completó (según la línea de tiempo). Un trámite pausado se
 * evalúa por su estado previo, que es donde realmente se quedó.
 */
export function calcularTramos(
  estado: EstadoTramite,
  estadoAnterior: EstadoTramite | null,
  timeline: EntradaTimelineDto[],
): TramoProceso[] {
  const estadoEfectivo = estado === 'pausado' && estadoAnterior ? estadoAnterior : estado;
  const ordenados = [...timeline].sort((a, b) => Date.parse(a.fecha) - Date.parse(b.fecha));
  return TRAMOS_ESTUDIO.map((t) => {
    const evento = ordenados.find((e) => e.tipoEvento && t.eventos.includes(e.tipoEvento));
    const porEstado = t.hechoDesde.includes(estadoEfectivo);
    return {
      clave: t.clave,
      etiqueta: t.etiqueta,
      completado: porEstado || Boolean(evento),
      canal: evento?.canal ?? null,
      fecha: evento?.fecha ?? null,
    };
  });
}

export function porcentajeAvance(tramos: TramoProceso[]): number {
  if (tramos.length === 0) return 0;
  return Math.round((tramos.filter((t) => t.completado).length / tramos.length) * 100);
}

/** Primer tramo pendiente: "aquí se quedó". */
export function tramoPendiente(tramos: TramoProceso[]): TramoProceso | null {
  return tramos.find((t) => !t.completado) ?? null;
}

// ----------------------------------------------------------------------------
// Semáforo de canales
// ----------------------------------------------------------------------------

export type ColorSemaforo = 'verde' | 'ambar' | 'rojo' | 'gris';

export interface EstadoCanal {
  canal: CanalAtencion | 'clinica';
  etiqueta: string;
  color: ColorSemaforo;
  estado: string;
  detalle: string;
}

export const CANALES_SEMAFORO: Array<{ canal: CanalAtencion | 'clinica'; etiqueta: string }> = [
  { canal: 'web', etiqueta: 'Web' },
  { canal: 'app', etiqueta: 'App' },
  { canal: 'whatsapp', etiqueta: 'WhatsApp' },
  { canal: 'call_center', etiqueta: 'Teléfono' },
  { canal: 'clinica', etiqueta: 'Clínica' },
  { canal: 'email', etiqueta: 'Correo' },
];

export function formatearHace(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} días`;
}

/** Reglas de `chState()` del simulador, sobre la línea de tiempo real. */
export function estadoCanales(
  timeline: EntradaTimelineDto[],
  propietario: PropietarioTramiteDto | null | undefined,
  ahora = Date.now(),
): EstadoCanal[] {
  const enLlamada =
    propietario && propietario.exclusivo && Date.parse(propietario.hasta) > ahora
      ? propietario.canal
      : null;

  return CANALES_SEMAFORO.map(({ canal, etiqueta }) => {
    if (canal === 'clinica') {
      return {
        canal,
        etiqueta,
        color: 'gris',
        estado: 'Sin integración',
        detalle: 'La llegada a clínica no está conectada en el prototipo',
      };
    }
    if (enLlamada === canal) {
      return {
        canal,
        etiqueta,
        color: 'verde',
        estado: 'En llamada',
        detalle: 'El asesor tiene el trámite; los demás canales no escriben',
      };
    }
    const usos = timeline.filter((e) => e.canal === canal);
    if (usos.length === 0) {
      return {
        canal,
        etiqueta,
        color: 'gris',
        estado: 'Sin uso',
        detalle: 'No ha usado este canal',
      };
    }
    const ultimo = Math.max(...usos.map((e) => Date.parse(e.fecha)));
    const hace = ahora - ultimo;
    if (hace < HORA_MS) {
      return { canal, etiqueta, color: 'verde', estado: 'Activo', detalle: formatearHace(hace) };
    }
    if (canal === 'whatsapp' && hace >= 24 * HORA_MS) {
      return {
        canal,
        etiqueta,
        color: 'ambar',
        estado: 'Ventana cerrada',
        detalle: `Último mensaje ${formatearHace(hace)}: solo plantillas, con costo`,
      };
    }
    return {
      canal,
      etiqueta,
      color: 'ambar',
      estado: 'Pausado',
      detalle: `Último uso ${formatearHace(hace)}; avance guardado`,
    };
  });
}

// ----------------------------------------------------------------------------
// Detenido, prioridad y siguiente mejor acción
// ----------------------------------------------------------------------------

export type OrigenDetencion = 'paciente' | 'interno' | null;

/** Actividad del paciente: los seguimientos del contact center no cuentan. */
export function ultimaActividadPaciente(timeline: EntradaTimelineDto[]): number | null {
  const propias = timeline.filter((e) => e.actorTipo === 'paciente' || e.actorTipo === 'asesor_ia');
  if (propias.length === 0) return null;
  return Math.max(...propias.map((e) => Date.parse(e.fecha)));
}

export function origenDetencion(
  estado: EstadoTramite,
  timeline: EntradaTimelineDto[],
  ahora = Date.now(),
): OrigenDetencion {
  if (estado === 'cerrado' || estado === 'cancelado' || estado === 'resultados_liberados') {
    return null;
  }
  const ultima = ultimaActividadPaciente(timeline);
  const inactivo = ultima === null ? Infinity : ahora - ultima;
  // Espera de un proceso interno (laboratorio): no es abandono del paciente
  if (estado === 'en_proceso' && inactivo >= UMBRAL_DETENIDO_HORAS * HORA_MS) return 'interno';
  if (estado === 'pausado' || inactivo >= UMBRAL_DETENIDO_HORAS * HORA_MS) return 'paciente';
  return null;
}

export interface Prioridad {
  puntos: number;
  nivel: 'Alta' | 'Media' | 'Baja';
  razones: string[];
}

/**
 * `prio()` del simulador (propuesta por validar): salida no conforme 3 o solicitud 1 · +2 avance
 * ≥ 50 % · +1 por día detenido (máx. 3) · +2 resultados incompletos. Alta ≥ 6, media 4–5.
 * (El +2 de menor o adulto mayor llega con los vínculos entre personas.)
 */
export function calcularPrioridad(params: {
  salidaNoConforme: boolean;
  avance: number;
  ultimaActividad: number | null;
  resultadosIncompletos: boolean;
  ahora?: number;
}): Prioridad {
  const razones: string[] = [];
  let p = params.salidaNoConforme ? 3 : 1;
  razones.push(params.salidaNoConforme ? 'salida no conforme (+3)' : 'solicitud (+1)');
  if (params.avance >= 50) {
    p += 2;
    razones.push(`avance de ${params.avance} % (+2)`);
  }
  if (params.ultimaActividad !== null) {
    const dias = Math.min(
      3,
      Math.floor(((params.ahora ?? Date.now()) - params.ultimaActividad) / (24 * HORA_MS)),
    );
    if (dias > 0) {
      p += dias;
      razones.push(`${dias} día(s) detenido (+${dias})`);
    }
  }
  if (params.resultadosIncompletos) {
    p += 2;
    razones.push('resultados incompletos (+2)');
  }
  return { puntos: p, nivel: p >= 6 ? 'Alta' : p >= 4 ? 'Media' : 'Baja', razones };
}

export interface SiguienteAccion {
  titulo: string;
  porque: string[];
  canalSugerido: string;
}

/** `nba()` y `suggest()` del simulador sobre los datos reales del trámite. */
export function siguienteMejorAccion(params: {
  estado: EstadoTramite;
  tramos: TramoProceso[];
  canales: EstadoCanal[];
  origen: OrigenDetencion;
  orden: OrdenEstudiosDto | null;
  timeline: EntradaTimelineDto[];
  ahora?: number;
}): SiguienteAccion {
  const ahora = params.ahora ?? Date.now();
  const pendiente = tramoPendiente(params.tramos);

  if (params.estado === 'cerrado' || (!pendiente && !params.orden?.enlaceBloqueado)) {
    return { titulo: 'Trámite completo', porque: ['No requiere seguimiento.'], canalSugerido: '—' };
  }

  if (params.orden?.enlaceBloqueado) {
    const faltan = params.orden.estudios.filter((e) => e.estado !== 'liberado');
    return {
      titulo: 'Informar el estudio pendiente',
      porque: [
        `El enlace de resultados de la orden ${params.orden.folio} se libera cuando estén los ${params.orden.total} estudios; faltan ${faltan.length}: ${faltan.map((e) => e.estudioNombre).join(', ')}.`,
        'Es la razón más probable del contacto. El operador informa el estado sin leer resultados: el contenido clínico está oculto para su rol.',
      ],
      canalSugerido: 'Correo con el estado del estudio pendiente',
    };
  }

  if (params.origen === 'interno') {
    return {
      titulo: 'Destrabar el proceso interno',
      porque: [
        `El trámite espera un proceso interno en "${pendiente?.etiqueta}". No es abandono del paciente.`,
      ],
      canalSugerido: 'Escalar al área responsable',
    };
  }

  const porque: string[] = [];
  const usados = params.canales.filter((c) => c.estado !== 'Sin uso' && c.color !== 'gris');
  if (pendiente) {
    porque.push(
      `Se quedó en "${pendiente.etiqueta}" después de usar ${usados.map((c) => c.etiqueta).join(', ') || 'un canal'}. Su avance está guardado.`,
    );
  }
  const wa = params.canales.find((c) => c.canal === 'whatsapp');
  if (wa?.estado === 'Ventana cerrada') {
    porque.push(
      'La ventana de 24 h de WhatsApp ya cerró: escribirle exige una plantilla con costo. El correo no tiene ese costo.',
    );
  }

  const ultimo = [...params.timeline]
    .filter((e) => e.actorTipo === 'paciente' || e.actorTipo === 'asesor_ia')
    .sort((a, b) => Date.parse(b.fecha) - Date.parse(a.fecha))[0];
  let canalSugerido = 'Correo de seguimiento';
  if (ultimo?.canal === 'whatsapp' && ahora - Date.parse(ultimo.fecha) < 24 * HORA_MS) {
    canalSugerido = 'WhatsApp (ventana abierta, sin plantilla)';
  } else if (ultimo?.canal === 'app') {
    canalSugerido = 'Aviso en la app';
  }

  return {
    titulo:
      params.origen === 'paciente'
        ? 'Invitar a retomar donde se quedó'
        : 'Acompañar el siguiente paso',
    porque,
    canalSugerido,
  };
}
