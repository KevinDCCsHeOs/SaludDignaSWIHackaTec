import type { RolUsuario } from '@salud-digna/shared';

export type PermisoSistema =
  | 'tramite:propio:leer'
  | 'tramite:propio:editar'
  | 'tramite:otros:leer'
  | 'tramite:otros:editar'
  | 'ticket:escalado:leer'
  | 'ticket:escalado:gestionar'
  | 'resultado:revisar'
  | 'resultado:liberar'
  | 'auditoria:leer'
  | 'kpis:leer'
  | 'identidad:resolver'
  | 'identidad:vincular'
  | 'identidad:merge'
  | 'otp:gestionar'
  | 'otp:call_center'
  | 'auth:asistir_recuperacion'
  | 'privacidad:consentimiento:leer'
  | 'privacidad:consentimiento:registrar';

/**
 * Matriz oficial de permisos por rol (Issue #6).
 * Fuente única consumida por `PermissionsGuard` en el API y por el layout dinámico (#29).
 */
export const MATRIZ_PERMISOS_POR_ROL: Record<RolUsuario, readonly PermisoSistema[]> = {
  paciente: [
    'tramite:propio:leer',
    'tramite:propio:editar',
    'otp:gestionar',
    'privacidad:consentimiento:registrar',
    'privacidad:consentimiento:leer',
  ],
  asesor_ia: [
    'identidad:resolver',
    'identidad:vincular',
    'otp:gestionar',
    'privacidad:consentimiento:registrar',
    'privacidad:consentimiento:leer',
  ],
  asesor: [
    'tramite:otros:leer',
    'tramite:otros:editar',
    'identidad:resolver',
    'identidad:vincular',
    'otp:gestionar',
    'otp:call_center',
    'auth:asistir_recuperacion',
    'privacidad:consentimiento:leer',
    'privacidad:consentimiento:registrar',
  ],
  asesor_pro: [
    'tramite:otros:leer',
    'tramite:otros:editar',
    'ticket:escalado:leer',
    'ticket:escalado:gestionar',
    'identidad:resolver',
    'identidad:vincular',
    'identidad:merge',
    'otp:gestionar',
    'otp:call_center',
    'auth:asistir_recuperacion',
    'privacidad:consentimiento:leer',
    'privacidad:consentimiento:registrar',
  ],
  medico: ['tramite:otros:leer', 'resultado:liberar', 'privacidad:consentimiento:leer'],
  revisor_tecnico: ['tramite:otros:leer', 'resultado:revisar'],
  admin: [
    'tramite:propio:leer',
    'tramite:otros:leer',
    'ticket:escalado:leer',
    'auditoria:leer',
    'kpis:leer',
    'identidad:resolver',
    'identidad:vincular',
    'identidad:merge',
    'otp:gestionar',
    'otp:call_center',
    'auth:asistir_recuperacion',
    'privacidad:consentimiento:leer',
    'privacidad:consentimiento:registrar',
  ],
};

export function rolTienePermisos(rol: RolUsuario, requeridos: readonly PermisoSistema[]): boolean {
  const permisosDelRol = MATRIZ_PERMISOS_POR_ROL[rol] ?? [];
  return requeridos.every((p) => permisosDelRol.includes(p));
}
