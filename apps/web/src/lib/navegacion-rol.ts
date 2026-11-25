import type { RolUsuario } from '@salud-digna/shared';

export interface ItemMenuRol {
  href: string;
  claveNav:
    | 'inicio'
    | 'cotizar'
    | 'misTramites'
    | 'resultados'
    | 'consola'
    | 'journey'
    | 'admin'
    | 'medico'
    | 'revisor';
}

/**
 * Ruta de aterrizaje automática después del login según el rol (#29).
 */
export function rutaInicioPorRol(rol: RolUsuario): string {
  switch (rol) {
    case 'asesor':
    case 'asesor_pro':
      return '/consola';
    case 'medico':
      return '/medico';
    case 'revisor_tecnico':
      return '/revisor';
    case 'admin':
      return '/admin';
    default:
      return '/';
  }
}

/**
 * Construye el menú dinámico a partir del rol y la matriz de permisos (#6, #29).
 * Cada rol ve exclusivamente sus pestañas y flujos.
 */
export function construirMenuPorRol(
  rol: RolUsuario | null | undefined,
  permisos: readonly string[] = [],
): ItemMenuRol[] {
  if (!rol || rol === 'paciente') {
    return [
      { href: '/', claveNav: 'inicio' },
      { href: '/cotizar', claveNav: 'cotizar' },
      { href: '/mis-tramites', claveNav: 'misTramites' },
      { href: '/resultados', claveNav: 'resultados' },
    ];
  }

  if (rol === 'asesor' || rol === 'asesor_pro') {
    const items: ItemMenuRol[] = [
      { href: '/consola', claveNav: 'consola' },
      { href: '/journey', claveNav: 'journey' },
    ];
    if (rol === 'asesor_pro' || permisos.includes('kpis:leer')) {
      items.push({ href: '/admin', claveNav: 'admin' });
    }
    return items;
  }

  if (rol === 'medico') {
    return [
      { href: '/medico', claveNav: 'medico' },
      { href: '/resultados', claveNav: 'resultados' },
    ];
  }

  if (rol === 'revisor_tecnico') {
    return [{ href: '/revisor', claveNav: 'revisor' }];
  }

  // Admin: monitoreo, KPIs, Patient Journey, consola
  return [
    { href: '/admin', claveNav: 'admin' },
    { href: '/journey', claveNav: 'journey' },
    { href: '/consola', claveNav: 'consola' },
  ];
}

const REGLAS_ACCESO_RUTA: ReadonlyArray<{ prefijo: string; roles: readonly RolUsuario[] }> = [
  { prefijo: '/admin', roles: ['admin', 'asesor_pro'] },
  { prefijo: '/journey', roles: ['admin', 'asesor', 'asesor_pro'] },
  { prefijo: '/consola', roles: ['admin', 'asesor', 'asesor_pro'] },
  { prefijo: '/medico', roles: ['medico', 'admin'] },
  { prefijo: '/revisor', roles: ['revisor_tecnico', 'admin'] },
];

export function rolPuedeAccederRuta(rol: RolUsuario | null | undefined, pathname: string): boolean {
  const regla = REGLAS_ACCESO_RUTA.find(
    (r) => pathname === r.prefijo || pathname.startsWith(`${r.prefijo}/`),
  );
  if (!regla) return true;
  if (!rol) return true; // En rutas protegidas sin cookie, la página solicita login en cliente
  return regla.roles.includes(rol);
}
