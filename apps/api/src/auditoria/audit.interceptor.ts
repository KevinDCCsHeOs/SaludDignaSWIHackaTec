import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AccionAuditoria, CanalAtencion, RolUsuario } from '@salud-digna/shared';
import { CANALES_ATENCION } from '@salud-digna/shared';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { CLAVE_AUDITAR, ConfigAuditoriaDecorador } from '../auth/decoradores';
import { AuditoriaService } from './auditoria.service';

interface RequestConUsuario extends Request {
  usuario?: {
    id: string;
    rol: RolUsuario;
    email: string;
    pacienteId?: string | null;
  };
}

function inferirAccion(metodo: string): AccionAuditoria {
  switch (metodo.toUpperCase()) {
    case 'GET':
    case 'HEAD':
      return 'leer';
    case 'POST':
      return 'crear';
    case 'PUT':
    case 'PATCH':
      return 'actualizar';
    case 'DELETE':
      return 'eliminar';
    default:
      return 'leer';
  }
}

function extraerCanal(req: RequestConUsuario): CanalAtencion {
  const header = req.headers['x-canal'];
  const candidato =
    typeof header === 'string'
      ? header
      : typeof req.body?.canal === 'string'
        ? req.body.canal
        : 'web';
  return (CANALES_ATENCION as readonly string[]).includes(candidato)
    ? (candidato as CanalAtencion)
    : 'web';
}

function extraerPacienteId(req: RequestConUsuario): string | null {
  const candidatos = [
    req.params?.pacienteId,
    req.query?.pacienteId,
    req.body?.pacienteId,
    req.usuario?.pacienteId,
  ];
  for (const val of candidatos) {
    if (typeof val === 'string' && val.length > 0) return val;
  }
  return null;
}

/**
 * Interceptor global de auditoría (#11).
 * Registra de forma asíncrona quién leyó o modificó qué recurso, desde qué canal e IP,
 * sin escribir nunca datos personales sensibles en los metadatos.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditoria: AuditoriaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<RequestConUsuario>();
    const ruta = req.path ?? req.url ?? '/';

    // No saturar la bitácora con pings de healthcheck
    if (ruta === '/health') {
      return next.handle();
    }

    const config = this.reflector.getAllAndOverride<ConfigAuditoriaDecorador | undefined>(
      CLAVE_AUDITAR,
      [context.getHandler(), context.getClass()],
    );

    const accion = config?.accion ?? inferirAccion(req.method);
    const entidad = config?.entidad ?? ruta.split('/').filter(Boolean)[0] ?? 'sistema';
    const entidadId =
      (typeof req.params?.id === 'string' && req.params.id) ||
      (typeof req.params?.pacienteId === 'string' && req.params.pacienteId) ||
      extraerPacienteId(req) ||
      'coleccion';
    const canal = extraerCanal(req);
    const ip = req.ip ?? null;

    const registrarResultado = (exitoso: boolean, codigoError?: number) => {
      this.auditoria.registrarAsync({
        usuarioId: req.usuario?.id ?? null,
        rol: req.usuario?.rol ?? null,
        accion,
        entidad,
        entidadId,
        pacienteId: extraerPacienteId(req),
        canal,
        ip,
        exitoso,
        detalleSinPii: {
          metodo: req.method,
          ruta,
          ...(codigoError ? { status: codigoError } : {}),
        },
      });
    };

    return next.handle().pipe(
      tap({
        next: () => registrarResultado(true),
        error: (err: { getStatus?: () => number }) =>
          registrarResultado(false, err?.getStatus?.() ?? 500),
      }),
    );
  }
}
