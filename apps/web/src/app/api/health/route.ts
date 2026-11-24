import { NextResponse } from 'next/server';
import { ROLES_USUARIO } from '@salud-digna/shared';
import { META_CANAL_VISUAL } from '@salud-digna/ui';

export function GET() {
  return NextResponse.json({
    servicio: 'web',
    canal: 'web',
    icono: META_CANAL_VISUAL.web.icono,
    rolesSoportados: ROLES_USUARIO,
    estado: 'ok',
    timestamp: new Date().toISOString(),
  });
}
