/**
 * Acciones registradas en la bitácora de auditoría append-only (#11).
 */
export const ACCIONES_AUDITORIA = [
  'leer',
  'crear',
  'actualizar',
  'eliminar',
  'login',
  'logout',
  'verificar_otp',
  'vincular_identidad',
  'exportar',
  'liberar_resultado',
] as const;

export type AccionAuditoria = (typeof ACCIONES_AUDITORIA)[number];

/**
 * Tipos de consentimiento expreso conforme a la LFPDPPP (#10).
 */
export const TIPOS_CONSENTIMIENTO = [
  'aviso_privacidad',
  'datos_sensibles',
  'notificaciones',
] as const;

export type TipoConsentimiento = (typeof TIPOS_CONSENTIMIENTO)[number];

/**
 * Clasificación de sensibilidad de campos en el modelo de datos (LFPDPPP).
 */
export const NIVELES_SENSIBILIDAD = [
  'publico',
  'interno',
  'personal',
  'sensible_cifrado',
] as const;

export type NivelSensibilidad = (typeof NIVELES_SENSIBILIDAD)[number];

/**
 * Inventario canónico de campos cifrados en reposo con AES-256-GCM (#2, #10).
 * Utilizado como referencia por el módulo `privacidad` y la auditoría de esquema.
 */
export const CAMPOS_SENSIBLES_CIFRADOS = [
  {
    entidad: 'Paciente',
    campoPrisma: 'fechaNacCifrada',
    columnaSql: 'fecha_nac_cifrada',
    algoritmo: 'AES-256-GCM',
    buscablePorHash: false,
    motivo: 'Dato personal identificativo y usado para verificación en Call Center',
  },
  {
    entidad: 'Paciente',
    campoPrisma: 'curpCifrado',
    columnaSql: 'curp_cifrado',
    algoritmo: 'AES-256-GCM',
    buscablePorHash: true,
    columnaHash: 'curp_hash',
    motivo: 'Identificador oficial único; se consulta mediante curp_hash (SHA-256 + pepper)',
  },
  {
    entidad: 'Paciente',
    campoPrisma: 'datosFiscalesCifrados',
    columnaSql: 'datos_fiscales_cifrados',
    algoritmo: 'AES-256-GCM',
    buscablePorHash: false,
    motivo: 'RFC, razón social, régimen fiscal y CP para facturación (#33)',
  },
  {
    entidad: 'Resultado',
    campoPrisma: 'contenidoCifrado',
    columnaSql: 'contenido_cifrado',
    algoritmo: 'AES-256-GCM',
    buscablePorHash: false,
    motivo: 'Dato personal sensible de salud conforme a la LFPDPPP',
  },
  {
    entidad: 'Resultado',
    campoPrisma: 'archivoUrlCifrada',
    columnaSql: 'archivo_url_cifrada',
    algoritmo: 'AES-256-GCM',
    buscablePorHash: false,
    motivo: 'Ubicación del PDF clínico del paciente',
  },
] as const;
