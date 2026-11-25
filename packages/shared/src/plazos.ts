/**
 * Temporizadores de sesión del traspaso v2 (`especificaciones/plazos.json`), en segundos.
 * `exposicion` acelera los relojes para la demostración; el código de un solo uso no se reduce.
 * Las cifras son propuestas del equipo para validar con Salud Digna.
 */
export const PERFILES_PLAZOS = ['produccion', 'exposicion'] as const;

export type PerfilPlazos = (typeof PERFILES_PLAZOS)[number];

export interface Plazos {
  /** Inactividad hasta el único aviso, que ya anuncia el cierre y cómo retomar. */
  aviso: number;
  /** Inactividad hasta pausar la conversación, sin enviar mensaje. */
  cierre: number;
  /** Duración de un horario apartado sin confirmar. */
  cupo: number;
  /** Duración del permiso de canal propietario sin renovación. */
  lease: number;
  /** Validez del código de un solo uso. */
  otp: number;
  /** Tiempo para que el asesor tome un chat asignado antes de volver a la cola. */
  asignacionChat: number;
  /** Vida del borrador del trámite antes de archivarse como abandonado. */
  borrador: number;
}

export const PLAZOS: Record<PerfilPlazos, Plazos> = {
  produccion: {
    aviso: 600,
    cierre: 1800,
    cupo: 900,
    lease: 120,
    otp: 900,
    asignacionChat: 300,
    borrador: 604_800,
  },
  exposicion: {
    aviso: 30,
    cierre: 60,
    cupo: 120,
    lease: 20,
    otp: 900,
    asignacionChat: 30,
    borrador: 604_800,
  },
};

/** Perfil activo a partir de `PLAZOS_PERFIL`; cualquier otro valor usa producción. */
export function perfilPlazosDesdeEntorno(valor: string | undefined): PerfilPlazos {
  return valor === 'exposicion' ? 'exposicion' : 'produccion';
}

export function obtenerPlazos(perfil: PerfilPlazos): Plazos {
  return PLAZOS[perfil];
}
