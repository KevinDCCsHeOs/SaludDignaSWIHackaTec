import { NextResponse, type NextRequest } from 'next/server';
import type { RolUsuario } from '@salud-digna/shared';
import { rolPuedeAccederRuta, rutaInicioPorRol } from './lib/navegacion-rol';

const ROLES_VALIDOS: readonly RolUsuario[] = [
  'paciente',
  'asesor_ia',
  'asesor',
  'asesor_pro',
  'medico',
  'revisor_tecnico',
  'admin',
];

/**
 * Middleware de Next.js para control de rutas por rol y redirección post-login (#29).
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const rolCookie = request.cookies.get('sd_web_rol')?.value as RolUsuario | undefined;
  const rol = rolCookie && ROLES_VALIDOS.includes(rolCookie) ? rolCookie : null;

  if (rol && pathname === '/login') {
    return NextResponse.redirect(new URL(rutaInicioPorRol(rol), request.url));
  }

  if (rol && !rolPuedeAccederRuta(rol, pathname)) {
    return NextResponse.redirect(new URL('/403', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/journey/:path*',
    '/consola/:path*',
    '/medico/:path*',
    '/revisor/:path*',
    '/login',
  ],
};
