import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { RolUsuario } from '@salud-digna/shared';
import type { Request } from 'express';
import jwt from 'jsonwebtoken';
import { CLAVE_PERMISOS, CLAVE_PUBLICO, CLAVE_ROLES } from './decoradores';
import { PermisoSistema, rolTienePermisos } from './permisos';

export interface PayloadJwtAcceso {
  sub: string;
  email: string;
  rol: RolUsuario;
  region: string | null;
  pacienteId: string | null;
  tipo: 'access';
}

export interface UsuarioAutenticado {
  id: string;
  email: string;
  rol: RolUsuario;
  region: string | null;
  pacienteId: string | null;
}

export function obtenerSecretoJwtAcceso(): string {
  const secreto = process.env.JWT_ACCESS_SECRET;
  if (!secreto && process.env.NODE_ENV === 'production') {
    throw new Error('JWT_ACCESS_SECRET es obligatorio en producción');
  }
  return secreto ?? 'dev-jwt-access-secret-not-for-prod';
}

export function obtenerSecretoJwtRefresh(): string {
  const secreto = process.env.JWT_REFRESH_SECRET;
  if (!secreto && process.env.NODE_ENV === 'production') {
    throw new Error('JWT_REFRESH_SECRET es obligatorio en producción');
  }
  return secreto ?? 'dev-jwt-refresh-secret-not-for-prod';
}

export function obtenerTokenServicioBot(): string {
  return process.env.API_SERVICE_TOKEN ?? 'dev-api-service-token-not-for-prod';
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const esPublico = this.reflector.getAllAndOverride<boolean>(CLAVE_PUBLICO, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (esPublico) return true;

    const req = context.switchToHttp().getRequest<Request & { usuario?: UsuarioAutenticado }>();

    // Soporte de token de servicio interno para `apps/whatsapp-bot` (rol `asesor_ia`, ADR 0005)
    const tokenServicio = req.headers['x-service-token'];
    if (typeof tokenServicio === 'string' && tokenServicio === obtenerTokenServicioBot()) {
      req.usuario = {
        id: 'usr_asesor_ia',
        email: 'ia.bot@demo.saluddigna.local',
        rol: 'asesor_ia',
        region: null,
        pacienteId: null,
      };
      return true;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token de acceso requerido');
    }

    const token = authHeader.slice('Bearer '.length).trim();
    try {
      const payload = jwt.verify(token, obtenerSecretoJwtAcceso()) as PayloadJwtAcceso;
      if (payload.tipo !== 'access') {
        throw new UnauthorizedException('Tipo de token inválido');
      }
      req.usuario = {
        id: payload.sub,
        email: payload.email,
        rol: payload.rol,
        region: payload.region,
        pacienteId: payload.pacienteId,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Token de acceso inválido o expirado');
    }
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const rolesRequeridos = this.reflector.getAllAndOverride<RolUsuario[] | undefined>(
      CLAVE_ROLES,
      [context.getHandler(), context.getClass()],
    );
    if (!rolesRequeridos || rolesRequeridos.length === 0) return true;

    const req = context.switchToHttp().getRequest<Request & { usuario?: UsuarioAutenticado }>();
    if (!req.usuario || !rolesRequeridos.includes(req.usuario.rol)) {
      throw new ForbiddenException('Tu rol no tiene acceso a este recurso');
    }
    return true;
  }
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const permisosRequeridos = this.reflector.getAllAndOverride<PermisoSistema[] | undefined>(
      CLAVE_PERMISOS,
      [context.getHandler(), context.getClass()],
    );
    if (!permisosRequeridos || permisosRequeridos.length === 0) return true;

    const req = context.switchToHttp().getRequest<Request & { usuario?: UsuarioAutenticado }>();
    if (!req.usuario || !rolTienePermisos(req.usuario.rol, permisosRequeridos)) {
      throw new ForbiddenException('No cuentas con permisos suficientes para esta operación');
    }
    return true;
  }
}
