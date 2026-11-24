import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { CanalAtencion, RolUsuario } from '@salud-digna/shared';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { KeyValueStoreService } from '../common/redis/kv-store.service';
import {
  obtenerSecretoJwtAcceso,
  obtenerSecretoJwtRefresh,
  PayloadJwtAcceso,
  UsuarioAutenticado,
} from './guards';
import { MATRIZ_PERMISOS_POR_ROL } from './permisos';
import { UsuarioAuthRegistro, UsuarioAuthStoreService } from './usuarios-demo';

const TTL_ACCESS_SEGUNDOS = 15 * 60; // 15 min (#6)
const TTL_REFRESH_SEGUNDOS = 7 * 24 * 60 * 60; // 7 días (#6)
const MAX_INTENTOS_LOGIN = 5;
const VENTANA_RATE_LIMIT_LOGIN_SEG = 15 * 60;

export const LoginSchema = z.object({
  email: z.string().email(),
  contrasena: z.string().min(1),
});

interface PayloadJwtRefresh {
  sub: string;
  jti: string;
  tipo: 'refresh';
}

export interface ResultadoTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  usuario: {
    id: string;
    email: string;
    nombre: string;
    rol: RolUsuario;
    region: string | null;
    pacienteId: string | null;
    permisos: readonly string[];
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usuarios: UsuarioAuthStoreService,
    private readonly kv: KeyValueStoreService,
    private readonly auditoria: AuditoriaService,
  ) {}

  private claveRateLimit(ip: string, email: string): string {
    return `rl:login:${ip}:${email.trim().toLowerCase()}`;
  }

  private claveRefresh(jti: string): string {
    return `auth:rt:${jti}`;
  }

  private claveVersionSesion(usuarioId: string): string {
    return `auth:revoked_before:${usuarioId}`;
  }

  private async emitirParTokens(usuario: UsuarioAuthRegistro): Promise<ResultadoTokens> {
    const jti = randomUUID();
    const payloadAcceso: PayloadJwtAcceso = {
      sub: usuario.id,
      email: usuario.email,
      rol: usuario.rol,
      region: usuario.region,
      pacienteId: usuario.pacienteId,
      tipo: 'access',
    };
    const payloadRefresh: PayloadJwtRefresh = {
      sub: usuario.id,
      jti,
      tipo: 'refresh',
    };

    const accessToken = jwt.sign(payloadAcceso, obtenerSecretoJwtAcceso(), {
      expiresIn: TTL_ACCESS_SEGUNDOS,
    });
    const refreshToken = jwt.sign(payloadRefresh, obtenerSecretoJwtRefresh(), {
      expiresIn: TTL_REFRESH_SEGUNDOS,
    });

    await this.kv.set(
      this.claveRefresh(jti),
      JSON.stringify({ usuarioId: usuario.id, creadoEn: Date.now() }),
      TTL_REFRESH_SEGUNDOS,
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: TTL_ACCESS_SEGUNDOS,
      usuario: {
        id: usuario.id,
        email: usuario.email,
        nombre: usuario.nombre,
        rol: usuario.rol,
        region: usuario.region,
        pacienteId: usuario.pacienteId,
        permisos: MATRIZ_PERMISOS_POR_ROL[usuario.rol],
      },
    };
  }

  async login(
    entrada: { email: string; contrasena: string },
    ip = '127.0.0.1',
    canal: CanalAtencion = 'web',
  ): Promise<ResultadoTokens> {
    const parsed = LoginSchema.safeParse(entrada);
    if (!parsed.success) {
      throw new BadRequestException('Formato de credenciales inválido');
    }

    const email = parsed.data.email.trim().toLowerCase();
    const claveRl = this.claveRateLimit(ip, email);
    const intentosActuales = Number((await this.kv.get(claveRl)) ?? '0');

    if (intentosActuales >= MAX_INTENTOS_LOGIN) {
      throw new HttpException(
        'Demasiados intentos fallidos de inicio de sesión. Intenta de nuevo en 15 minutos.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const usuario = this.usuarios.buscarPorEmail(email);
    const valida =
      usuario && usuario.activo
        ? await bcrypt.compare(parsed.data.contrasena, usuario.passwordHash)
        : false;

    if (!usuario || !valida) {
      await this.kv.incr(claveRl, VENTANA_RATE_LIMIT_LOGIN_SEG);
      await this.auditoria.registrar({
        usuarioId: usuario?.id ?? null,
        rol: usuario?.rol ?? null,
        accion: 'login',
        entidad: 'Usuario',
        entidadId: usuario?.id ?? 'desconocido',
        pacienteId: usuario?.pacienteId ?? null,
        canal,
        ip,
        exitoso: false,
      });
      throw new UnauthorizedException('Credenciales inválidas');
    }

    await this.kv.del(claveRl);
    this.usuarios.registrarUltimoAcceso(usuario.id);

    await this.auditoria.registrar({
      usuarioId: usuario.id,
      rol: usuario.rol,
      accion: 'login',
      entidad: 'Usuario',
      entidadId: usuario.id,
      pacienteId: usuario.pacienteId,
      canal,
      ip,
      exitoso: true,
    });

    return this.emitirParTokens(usuario);
  }

  async refresh(refreshToken: string): Promise<ResultadoTokens> {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token requerido');
    }

    let payload: PayloadJwtRefresh;
    try {
      payload = jwt.verify(refreshToken, obtenerSecretoJwtRefresh()) as PayloadJwtRefresh;
    } catch {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }

    if (payload.tipo !== 'refresh' || !payload.jti) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    const guardadoRaw = await this.kv.get(this.claveRefresh(payload.jti));
    if (!guardadoRaw) {
      throw new UnauthorizedException('Sesión revocada o expirada');
    }

    const guardado = JSON.parse(guardadoRaw) as { usuarioId: string; creadoEn: number };
    const revocadoAntes = Number((await this.kv.get(this.claveVersionSesion(payload.sub))) ?? '0');
    if (revocadoAntes > 0 && guardado.creadoEn < revocadoAntes) {
      await this.kv.del(this.claveRefresh(payload.jti));
      throw new UnauthorizedException('Sesión invalidada por cambio de contraseña');
    }

    const usuario = this.usuarios.buscarPorId(payload.sub);
    if (!usuario || !usuario.activo) {
      throw new UnauthorizedException('Usuario inactivo');
    }

    // Rotación: invalidar el refresh token anterior
    await this.kv.del(this.claveRefresh(payload.jti));
    return this.emitirParTokens(usuario);
  }

  async logout(
    refreshToken: string | undefined,
    usuario: UsuarioAutenticado | undefined,
    canal: CanalAtencion = 'web',
    ip = '127.0.0.1',
  ): Promise<{ ok: true }> {
    if (refreshToken) {
      try {
        const payload = jwt.verify(refreshToken, obtenerSecretoJwtRefresh()) as PayloadJwtRefresh;
        if (payload.jti) {
          await this.kv.del(this.claveRefresh(payload.jti));
        }
      } catch {
        // Token ya expirado o inválido: logout sigue siendo idempotente
      }
    }

    if (usuario) {
      await this.auditoria.registrar({
        usuarioId: usuario.id,
        rol: usuario.rol,
        accion: 'logout',
        entidad: 'Usuario',
        entidadId: usuario.id,
        pacienteId: usuario.pacienteId,
        canal,
        ip,
        exitoso: true,
      });
    }

    return { ok: true };
  }

  async revocarTodasLasSesiones(usuarioId: string): Promise<void> {
    await this.kv.set(this.claveVersionSesion(usuarioId), String(Date.now()), TTL_REFRESH_SEGUNDOS);
  }

  obtenerPerfil(usuarioAuth: UsuarioAutenticado) {
    const usuario = this.usuarios.buscarPorId(usuarioAuth.id);
    return {
      id: usuarioAuth.id,
      email: usuarioAuth.email,
      nombre: usuario?.nombre ?? usuarioAuth.email,
      rol: usuarioAuth.rol,
      region: usuarioAuth.region,
      pacienteId: usuarioAuth.pacienteId,
      permisos: MATRIZ_PERMISOS_POR_ROL[usuarioAuth.rol],
    };
  }
}
