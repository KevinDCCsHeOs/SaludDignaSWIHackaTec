/**
 * Ruta de atención por riesgo (traspaso v2, sección 4 y árbol de decisión del caso LC-01).
 * Fuente: `especificaciones/solicitudes.json` y `rutas-por-riesgo.json`.
 * Riesgo = probabilidad × impacto (1–5 cada uno). Los pesos y umbrales son propuestas del equipo
 * para validar con Salud Digna.
 */
export const RUTAS_ATENCION = ['Aceptar', 'Reducir', 'Compartir', 'Escalar', 'Evitar'] as const;

export type RutaAtencion = (typeof RUTAS_ATENCION)[number];

export const PERMISOS_ACCION = [
  'info',
  'agendar',
  'pagar',
  'resultados',
  'facturar',
  'alta',
  'corregir',
] as const;

export type PermisoAccion = (typeof PERMISOS_ACCION)[number];

/** Valor del permiso del actor para esa acción (perfiles.json). */
export type ValorPermiso = 'si' | 'no' | 'condicionado' | 'tras_registro';

export interface SolicitudRiesgo {
  id: string;
  nombre: string;
  tipo: 'solicitud' | 'salida_no_conforme';
  probabilidad: number;
  impacto: number;
  permisoRequerido: PermisoAccion;
  requiereIdentidad: boolean;
  contenidoClinico: boolean;
}

export const SOLICITUDES_RIESGO = [
  {
    id: 'info',
    nombre: 'Informarse: sucursal y horario (E01)',
    tipo: 'solicitud',
    probabilidad: 1,
    impacto: 1,
    permisoRequerido: 'info',
    requiereIdentidad: false,
    contenidoClinico: false,
  },
  {
    id: 'cot',
    nombre: 'Cotizar un estudio (E02)',
    tipo: 'solicitud',
    probabilidad: 2,
    impacto: 2,
    permisoRequerido: 'info',
    requiereIdentidad: false,
    contenidoClinico: false,
  },
  {
    id: 'age',
    nombre: 'Agendar con preparación (E03–E05)',
    tipo: 'solicitud',
    probabilidad: 2,
    impacto: 3,
    permisoRequerido: 'agendar',
    requiereIdentidad: true,
    contenidoClinico: true,
  },
  {
    id: 'ree',
    nombre: 'Reenvío de resultados (E08)',
    tipo: 'solicitud',
    probabilidad: 2,
    impacto: 4,
    permisoRequerido: 'resultados',
    requiereIdentidad: true,
    contenidoClinico: true,
  },
  {
    id: 'fac',
    nombre: 'Facturar (E09)',
    tipo: 'solicitud',
    probabilidad: 3,
    impacto: 2,
    permisoRequerido: 'facturar',
    requiereIdentidad: true,
    contenidoClinico: false,
  },
  {
    id: 'altT',
    nombre: 'Darse de alta como tutor de un menor',
    tipo: 'solicitud',
    probabilidad: 2,
    impacto: 5,
    permisoRequerido: 'alta',
    requiereIdentidad: true,
    contenidoClinico: false,
  },
  {
    id: 'altC',
    nombre: 'Darse de alta como cuidador de un adulto mayor',
    tipo: 'solicitud',
    probabilidad: 2,
    impacto: 5,
    permisoRequerido: 'alta',
    requiereIdentidad: true,
    contenidoClinico: false,
  },
  {
    id: 'acc',
    nombre: 'Recuperar acceso a la cuenta',
    tipo: 'solicitud',
    probabilidad: 3,
    impacto: 2,
    permisoRequerido: 'info',
    requiereIdentidad: true,
    contenidoClinico: false,
  },
  {
    id: 'mue',
    nombre: 'Muestra rechazada por preparación · INC-O1-06',
    tipo: 'salida_no_conforme',
    probabilidad: 4,
    impacto: 2,
    permisoRequerido: 'agendar',
    requiereIdentidad: true,
    contenidoClinico: true,
  },
  {
    id: 'ret',
    nombre: 'Resultado retrasado · INC-O4-05',
    tipo: 'salida_no_conforme',
    probabilidad: 4,
    impacto: 2,
    permisoRequerido: 'info',
    requiereIdentidad: true,
    contenidoClinico: false,
  },
  {
    id: 'fin',
    nombre: 'Factura con régimen equivocado · INC-S1-02',
    tipo: 'salida_no_conforme',
    probabilidad: 4,
    impacto: 3,
    permisoRequerido: 'facturar',
    requiereIdentidad: true,
    contenidoClinico: false,
  },
  {
    id: 'dat',
    nombre: 'Datos incorrectos en la orden · INC-O1-08',
    tipo: 'salida_no_conforme',
    probabilidad: 3,
    impacto: 5,
    permisoRequerido: 'corregir',
    requiereIdentidad: true,
    contenidoClinico: false,
  },
  {
    id: 'env',
    nombre: 'No llegó el resultado digital · INC-O4-03',
    tipo: 'salida_no_conforme',
    probabilidad: 3,
    impacto: 3,
    permisoRequerido: 'resultados',
    requiereIdentidad: true,
    contenidoClinico: true,
  },
  {
    id: 'que',
    nombre: 'Queja formal por espera (E10)',
    tipo: 'salida_no_conforme',
    probabilidad: 3,
    impacto: 5,
    permisoRequerido: 'info',
    requiereIdentidad: true,
    contenidoClinico: false,
  },
  {
    id: 'cri',
    nombre: 'Resultado con valor crítico · INC-O4-07',
    tipo: 'salida_no_conforme',
    probabilidad: 4,
    impacto: 5,
    permisoRequerido: 'info',
    requiereIdentidad: false,
    contenidoClinico: true,
  },
  {
    id: 'eme',
    nombre: 'Emergencia médica durante el trámite',
    tipo: 'salida_no_conforme',
    probabilidad: 5,
    impacto: 5,
    permisoRequerido: 'info',
    requiereIdentidad: false,
    contenidoClinico: true,
  },
] as const satisfies readonly SolicitudRiesgo[];

export type IdSolicitudRiesgo = (typeof SOLICITUDES_RIESGO)[number]['id'];

export interface DefinicionRuta {
  ruta: RutaAtencion;
  nivel: number;
  /** Riesgo máximo de la ruta (inclusive); `null` para la última. */
  hasta: number | null;
  quienAtiende: string;
  /** Compromiso de que intervenga una persona, en segundos; `null` si es autoservicio o bot. */
  compromisoSegundos: number | null;
}

export const RUTAS_POR_RIESGO: readonly DefinicionRuta[] = [
  {
    ruta: 'Aceptar',
    nivel: 0,
    hasta: 4,
    quienAtiende: 'Autoservicio completo',
    compromisoSegundos: null,
  },
  {
    ruta: 'Reducir',
    nivel: 1,
    hasta: 9,
    quienAtiende: 'Bot con confirmación y seguimiento',
    compromisoSegundos: null,
  },
  {
    ruta: 'Compartir',
    nivel: 2,
    hasta: 14,
    quienAtiende: 'Asesor o especialista con el contexto acumulado',
    compromisoSegundos: 120,
  },
  {
    ruta: 'Escalar',
    nivel: 3,
    hasta: 19,
    quienAtiende: 'Supervisor, médico o soporte, con prioridad',
    compromisoSegundos: 900,
  },
  {
    ruta: 'Evitar',
    nivel: 4,
    hasta: null,
    quienAtiende: 'Una persona interviene de inmediato; el bot no responde el contenido',
    compromisoSegundos: 120,
  },
];

export interface EntradaRutaRiesgo {
  solicitud: IdSolicitudRiesgo;
  /** Permiso del actor para la acción que pide la solicitud. Por omisión, titular con permiso. */
  permiso?: ValorPermiso;
  /** ¿La identidad ya se verificó en este canal? Por omisión, sí. */
  identidadVerificada?: boolean;
  /** Paciente enfermo o estresado: +5 al riesgo. */
  estres?: boolean;
  /** Otra lengua con contenido clínico: mínimo Compartir (intérprete). */
  otraLengua?: boolean;
  /** Urgencia por falta del resultado (regla fija 1 del árbol). */
  urgenciaPorResultado?: boolean;
}

export interface DecisionRutaRiesgo {
  solicitud: IdSolicitudRiesgo;
  riesgo: number;
  ruta: RutaAtencion;
  nivel: number;
  quienAtiende: string;
  compromisoSegundos: number | null;
  /** Antes de cualquier dato se pide código de un solo uso (regla fija 3). */
  requiereVerificacion: boolean;
  /** Atiende una persona (Compartir, Escalar o Evitar). */
  atiendePersona: boolean;
  /** El bot no responde el contenido (Evitar). */
  botBloqueado: boolean;
  motivos: string[];
}

export function nivelPorRiesgo(riesgo: number): number {
  return RUTAS_POR_RIESGO.findIndex((r) => r.hasta === null || riesgo <= r.hasta);
}

/**
 * Árbol de decisión: primero cuatro reglas fijas (urgencia, valor crítico, identidad y permiso);
 * después probabilidad × impacto con sus ajustes. Los modificadores ajustan la respuesta y pueden
 * subir la ruta un nivel, nunca bajarla.
 */
export function evaluarRutaPorRiesgo(entrada: EntradaRutaRiesgo): DecisionRutaRiesgo {
  const solicitud = SOLICITUDES_RIESGO.find((s) => s.id === entrada.solicitud);
  if (!solicitud) {
    throw new Error(`Solicitud desconocida: ${entrada.solicitud}`);
  }
  const permiso = entrada.permiso ?? 'si';
  const motivos: string[] = [];

  let riesgo = solicitud.probabilidad * solicitud.impacto;
  if (entrada.estres) {
    riesgo += 5;
    motivos.push('el estrés sube un nivel');
  }
  let nivel = nivelPorRiesgo(riesgo);

  // Regla fija 1: urgencia por falta del resultado
  if (entrada.urgenciaPorResultado) {
    nivel = Math.max(nivel, 3);
    motivos.push('urgencia por falta del resultado: un supervisor localiza y entrega');
  }
  // Regla fija 2: valor crítico (y emergencias) nunca por bot
  if (solicitud.id === 'cri' || solicitud.id === 'eme') {
    nivel = 4;
    motivos.push(
      solicitud.id === 'cri'
        ? 'valor crítico: lo comunica personal médico'
        : 'emergencia: 911 y una persona de inmediato',
    );
  }
  // Regla fija 4: permiso del actor para esta acción
  if (permiso === 'no' && solicitud.permisoRequerido === 'resultados') {
    nivel = 4;
    motivos.push('acceso de un tercero sin autorización');
  } else if (permiso === 'no' && solicitud.permisoRequerido === 'corregir') {
    nivel = Math.max(nivel, 3);
    motivos.push('solo el titular o su tutor corrige identidad');
  }
  // Ajuste: otra lengua con contenido clínico → intérprete
  if (entrada.otraLengua && solicitud.contenidoClinico && nivel < 2) {
    nivel = 2;
    motivos.push('contenido clínico en otra lengua: intérprete');
  }

  const def = RUTAS_POR_RIESGO[nivel];
  return {
    solicitud: solicitud.id,
    riesgo,
    ruta: def.ruta,
    nivel,
    quienAtiende: def.quienAtiende,
    compromisoSegundos: def.compromisoSegundos,
    // Regla fija 3: identidad antes de cualquier dato del trámite
    requiereVerificacion: solicitud.requiereIdentidad && entrada.identidadVerificada === false,
    atiendePersona: nivel >= 2,
    botBloqueado: nivel === 4,
    motivos,
  };
}
