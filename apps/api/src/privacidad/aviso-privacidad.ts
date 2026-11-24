export const VERSION_AVISO_VIGENTE = 'v1.0-2026';

export const AVISO_PRIVACIDAD_DEMO = {
  version: VERSION_AVISO_VIGENTE,
  esDemo: true,
  responsable: 'Prototipo Académico Salud Digna Omnicanal (InnovaTecNM 2026 — Datos Ficticios)',
  simplificado:
    'Utilizamos tus datos de contacto y del trámite únicamente para dar continuidad a tu atención entre Web, App, WhatsApp y Call Center, validar tu identidad con códigos de un solo uso y resguardar tus resultados clínicos bajo cifrado. Puedes ejercer tus derechos ARCO o revocar tu consentimiento en cualquier momento.',
  integralResumen: [
    'Finalidades primarias: identificación omnicanal, gestión de cotizaciones/citas, verificación OTP, liberación controlada de resultados clínicos y atención de tickets.',
    'Datos personales sensibles (LFPDPPP): CURP, fecha de nacimiento, datos fiscales y contenido de resultados clínicos, cifrados en reposo con AES-256-GCM.',
    'Transferencias mínimas: cuando utilizas el asistente virtual, el proveedor de IA recibe únicamente un resumen sin identificadores directos.',
    'Derechos ARCO: Acceso, Rectificación, Cancelación y Oposición disponibles vía portal web, app o Call Center previa verificación de identidad.',
  ],
  opcionesWhatsapp: {
    textoBotonAceptar: 'Acepto el aviso de privacidad',
    textoBotonRechazar: 'Ver detalles / No aceptar',
  },
} as const;
