import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import type { CanalAtencion } from '@salud-digna/shared';
import { CANALES_ATENCION } from '@salud-digna/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { CLAVE_CANAL_VERIFICADO } from '../auth/decoradores';
import { EventPublisherService } from '../common/eventos/event-publisher.service';
import { KeyValueStoreService } from '../common/redis/kv-store.service';
import { PacienteStoreService } from '../identidad/paciente-store.service';
import { CifradoService } from '../privacidad/cifrado.service';
import { despacharOtpWhatsapp } from './despacho-otp-whatsapp';

const TTL_OTP_SEGUNDOS = 300; // 5 min (#8)
const TTL_BLOQUEO_SEGUNDOS = 900; // 15 min tras 3 fallos (#8)
const TTL_SESION_VERIFICADA_SEGUNDOS = 1800; // 30 min (#8)
const MAX_INTENTOS_OTP = 3;

export const SolicitarOtpSchema = z.object({
  pacienteId: z.string().min(1).max(36),
  canal: z.enum(CANALES_ATENCION),
});

export const VerificarOtpSchema = z.object({
  pacienteId: z.string().min(1).max(36),
  canal: z.enum(CANALES_ATENCION).default('whatsapp'),
  codigo: z.string().regex(/^\d{6}$/, 'El código OTP debe tener exactamente 6 dígitos'),
});

export const VerificarCallCenterSchema = z.object({
  pacienteId: z.string().min(1).max(36),
  fechaNacimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa formato YYYY-MM-DD'),
  ultimosDigitosTelefono: z.string().regex(/^\d{4}$/, 'Se requieren los últimos 4 dígitos'),
});

export interface DespachoOtpSimulado {
  pacienteId: string;
  canal: CanalAtencion;
  codigo: string;
  plantillaMeta?: {
    categoria: 'AUTHENTICATION';
    nombre: string;
    idioma: string;
  };
  enviadoEn: string;
}

interface RegistroOtpHash {
  salt: string;
  hash: string;
  canal: CanalAtencion;
  intentos: number;
}

@Injectable()
export class OtpService {
  private readonly despachosSimulados: DespachoOtpSimulado[] = [];

  constructor(
    private readonly kv: KeyValueStoreService,
    private readonly pacientes: PacienteStoreService,
    private readonly cifrado: CifradoService,
    private readonly eventPublisher: EventPublisherService,
    private readonly auditoria: AuditoriaService,
  ) {}

  private claveOtp(pacienteId: string): string {
    return `otp:${pacienteId}`;
  }

  private claveBloqueo(pacienteId: string): string {
    return `otp:lock:${pacienteId}`;
  }

  private claveSesionVerificada(pacienteId: string, canal: CanalAtencion): string {
    return `sesion:verificada:${pacienteId}:${canal}`;
  }

  private calcularHashOtp(codigo: string, salt: string): string {
    return createHmac('sha256', salt).update(codigo).digest('hex');
  }

  private compararEnTiempoConstante(hexA: string, hexB: string): boolean {
    const bufA = Buffer.from(hexA, 'hex');
    const bufB = Buffer.from(hexB, 'hex');
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }

  async solicitarOtp(
    entrada: { pacienteId: string; canal: CanalAtencion },
    ip = '127.0.0.1',
    origen: 'conversacion' | 'externo' = 'conversacion',
  ): Promise<{
    enviado: true;
    canal: CanalAtencion;
    expiraEnSegundos: number;
    mensaje: string;
  }> {
    const parsed = SolicitarOtpSchema.safeParse(entrada);
    if (!parsed.success) {
      throw new BadRequestException('Parámetros inválidos para solicitar OTP');
    }

    const { pacienteId, canal } = parsed.data;
    const paciente = this.pacientes.buscarPorId(pacienteId);
    if (!paciente) {
      throw new NotFoundException('Paciente no encontrado');
    }

    const bloqueado = await this.kv.get(this.claveBloqueo(pacienteId));
    if (bloqueado) {
      throw new HttpException(
        'Verificación bloqueada temporalmente por intentos fallidos. Intenta de nuevo en 15 minutos.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const codigo = String(randomInt(100000, 1000000));
    const salt = randomBytes(16).toString('hex');
    const hash = this.calcularHashOtp(codigo, salt);

    const registro: RegistroOtpHash = { salt, hash, canal, intentos: 0 };
    await this.kv.set(this.claveOtp(pacienteId), JSON.stringify(registro), TTL_OTP_SEGUNDOS);

    // En producción se despacha a Meta Cloud API (plantilla Authentication) o correo sin exponer el código.
    // En desarrollo/pruebas se registra en memoria interna accesible solo para pruebas automatizadas.
    this.despachosSimulados.push({
      pacienteId,
      canal,
      codigo,
      plantillaMeta:
        canal === 'whatsapp'
          ? {
              categoria: 'AUTHENTICATION',
              nombre: 'sd_codigo_verificacion',
              idioma: paciente.idioma,
            }
          : undefined,
      enviadoEn: new Date().toISOString(),
    });

    if (canal === 'whatsapp' && paciente.telefonoE164) {
      await despacharOtpWhatsapp(paciente.telefonoE164, codigo, paciente.idioma, origen);
    }

    await this.auditoria.registrar({
      usuarioId: null,
      rol: 'paciente',
      accion: 'crear',
      entidad: 'Otp',
      entidadId: pacienteId,
      pacienteId,
      canal,
      ip,
      exitoso: true,
    });

    return {
      enviado: true,
      canal,
      expiraEnSegundos: TTL_OTP_SEGUNDOS,
      mensaje: 'Enviamos un código de verificación de 6 dígitos válido por 5 minutos.',
    };
  }

  async verificarOtp(
    entrada: { pacienteId: string; canal?: CanalAtencion; codigo: string },
    ip = '127.0.0.1',
  ): Promise<{
    verificado: true;
    canal: CanalAtencion;
    sesionValidaHasta: string;
  }> {
    const parsed = VerificarOtpSchema.safeParse(entrada);
    if (!parsed.success) {
      throw new BadRequestException('El código debe ser numérico de 6 dígitos');
    }

    const { pacienteId, codigo } = parsed.data;
    const canal = parsed.data.canal;

    const bloqueado = await this.kv.get(this.claveBloqueo(pacienteId));
    if (bloqueado) {
      throw new HttpException(
        'Demasiados intentos fallidos. Tu verificación está bloqueada temporalmente por 15 minutos.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const raw = await this.kv.get(this.claveOtp(pacienteId));
    if (!raw) {
      await this.auditoria.registrar({
        accion: 'verificar_otp',
        entidad: 'Otp',
        entidadId: pacienteId,
        pacienteId,
        canal,
        ip,
        exitoso: false,
        detalleSinPii: { motivo: 'expirado_o_inexistente' },
      });
      throw new BadRequestException(
        'El código de verificación ha expirado o no fue solicitado. Pide uno nuevo para continuar.',
      );
    }

    const registro = JSON.parse(raw) as RegistroOtpHash;
    const hashCandidato = this.calcularHashOtp(codigo, registro.salt);
    const coincide = this.compararEnTiempoConstante(hashCandidato, registro.hash);

    if (!coincide) {
      const intentos = registro.intentos + 1;
      if (intentos >= MAX_INTENTOS_OTP) {
        await this.kv.del(this.claveOtp(pacienteId));
        await this.kv.set(this.claveBloqueo(pacienteId), '1', TTL_BLOQUEO_SEGUNDOS);
        await this.auditoria.registrar({
          accion: 'verificar_otp',
          entidad: 'Otp',
          entidadId: pacienteId,
          pacienteId,
          canal,
          ip,
          exitoso: false,
          detalleSinPii: { motivo: 'bloqueado_por_intentos', intentos },
        });
        throw new HttpException(
          'Superaste el máximo de 3 intentos. Por seguridad, intenta de nuevo en 15 minutos.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      const ttlRestante = Math.max(await this.kv.ttl(this.claveOtp(pacienteId)), 30);
      await this.kv.set(
        this.claveOtp(pacienteId),
        JSON.stringify({ ...registro, intentos }),
        ttlRestante,
      );
      await this.auditoria.registrar({
        accion: 'verificar_otp',
        entidad: 'Otp',
        entidadId: pacienteId,
        pacienteId,
        canal,
        ip,
        exitoso: false,
        detalleSinPii: { motivo: 'codigo_incorrecto', intentos },
      });
      throw new UnauthorizedException(
        `Código incorrecto. Te quedan ${MAX_INTENTOS_OTP - intentos} intento(s).`,
      );
    }

    await this.kv.del(this.claveOtp(pacienteId));
    const sesionValidaHasta = new Date(
      Date.now() + TTL_SESION_VERIFICADA_SEGUNDOS * 1000,
    ).toISOString();

    await this.kv.set(
      this.claveSesionVerificada(pacienteId, canal),
      JSON.stringify({
        metodo: canal === 'whatsapp' ? 'otp_whatsapp' : 'otp_email',
        sesionValidaHasta,
      }),
      TTL_SESION_VERIFICADA_SEGUNDOS,
    );

    await this.eventPublisher.publicar({
      tipo: 'identidad.verificada',
      version: 1,
      pacienteId,
      tramiteId: null,
      canal,
      actor: { tipo: 'paciente', id: pacienteId },
      datos: {
        metodo:
          canal === 'whatsapp' ? 'otp_whatsapp' : canal === 'email' ? 'otp_email' : 'otp_simulado',
        canalVerificado: canal,
        sesionValidaHasta,
      },
    });

    await this.auditoria.registrar({
      accion: 'verificar_otp',
      entidad: 'Otp',
      entidadId: pacienteId,
      pacienteId,
      canal,
      ip,
      exitoso: true,
    });

    return { verificado: true, canal, sesionValidaHasta };
  }

  /**
   * Verificación para Call Center (#8): valida fecha de nacimiento + últimos 4 dígitos del teléfono.
   */
  async verificarPreguntasCallCenter(
    entrada: { pacienteId: string; fechaNacimiento: string; ultimosDigitosTelefono: string },
    asesorId: string,
    ip = '127.0.0.1',
  ): Promise<{ verificado: true; canal: 'call_center'; sesionValidaHasta: string }> {
    const parsed = VerificarCallCenterSchema.safeParse(entrada);
    if (!parsed.success) {
      throw new BadRequestException('Datos de preguntas de seguridad inválidos');
    }

    const { pacienteId, fechaNacimiento, ultimosDigitosTelefono } = parsed.data;
    const paciente = this.pacientes.buscarPorId(pacienteId);
    if (!paciente) {
      throw new NotFoundException('Paciente no encontrado');
    }

    const bloqueado = await this.kv.get(this.claveBloqueo(pacienteId));
    if (bloqueado) {
      throw new HttpException(
        'Verificación bloqueada temporalmente por intentos fallidos.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const fechaGuardada = paciente.fechaNacCifrada
      ? this.cifrado.descifrar(paciente.fechaNacCifrada)
      : null;
    const ultimosTelefono = paciente.telefonoE164?.slice(-4) ?? null;

    const ok = fechaGuardada === fechaNacimiento && ultimosTelefono === ultimosDigitosTelefono;
    if (!ok) {
      const claveIntentosCc = `otp:cc_fail:${pacienteId}`;
      const intentos = await this.kv.incr(claveIntentosCc, TTL_BLOQUEO_SEGUNDOS);
      if (intentos >= MAX_INTENTOS_OTP) {
        await this.kv.set(this.claveBloqueo(pacienteId), '1', TTL_BLOQUEO_SEGUNDOS);
      }
      await this.auditoria.registrar({
        usuarioId: asesorId,
        rol: 'asesor',
        accion: 'verificar_otp',
        entidad: 'CallCenterVerificacion',
        entidadId: pacienteId,
        pacienteId,
        canal: 'call_center',
        ip,
        exitoso: false,
      });
      throw new UnauthorizedException('Las respuestas de verificación no coinciden');
    }

    const sesionValidaHasta = new Date(
      Date.now() + TTL_SESION_VERIFICADA_SEGUNDOS * 1000,
    ).toISOString();

    await this.kv.set(
      this.claveSesionVerificada(pacienteId, 'call_center'),
      JSON.stringify({ metodo: 'preguntas_call_center', sesionValidaHasta }),
      TTL_SESION_VERIFICADA_SEGUNDOS,
    );

    await this.eventPublisher.publicar({
      tipo: 'identidad.verificada',
      version: 1,
      pacienteId,
      tramiteId: null,
      canal: 'call_center',
      actor: { tipo: 'asesor', id: asesorId },
      datos: {
        metodo: 'preguntas_call_center',
        canalVerificado: 'call_center',
        sesionValidaHasta,
      },
    });

    await this.auditoria.registrar({
      usuarioId: asesorId,
      rol: 'asesor',
      accion: 'verificar_otp',
      entidad: 'CallCenterVerificacion',
      entidadId: pacienteId,
      pacienteId,
      canal: 'call_center',
      ip,
      exitoso: true,
    });

    return { verificado: true, canal: 'call_center', sesionValidaHasta };
  }

  async tieneSesionVerificada(pacienteId: string, canal: CanalAtencion): Promise<boolean> {
    const raw = await this.kv.get(this.claveSesionVerificada(pacienteId, canal));
    return raw !== null;
  }

  obtenerUltimoOtpSimulado(pacienteId: string): DespachoOtpSimulado | undefined {
    for (let i = this.despachosSimulados.length - 1; i >= 0; i--) {
      if (this.despachosSimulados[i].pacienteId === pacienteId) {
        return this.despachosSimulados[i];
      }
    }
    return undefined;
  }

  limpiarParaPruebas(): void {
    this.despachosSimulados.length = 0;
  }
}

/**
 * Guard que bloquea cualquier consulta de datos de trámite/contexto en un canal
 * si el paciente aún no cuenta con una sesión verificada por OTP o Call Center (#8).
 */
@Injectable()
export class CanalVerificadoGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly otpService: OtpService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiere = this.reflector.getAllAndOverride<boolean>(CLAVE_CANAL_VERIFICADO, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiere) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const pacienteId =
      (typeof req.params?.pacienteId === 'string' && req.params.pacienteId) ||
      (typeof req.body?.pacienteId === 'string' && req.body.pacienteId) ||
      (typeof req.query?.pacienteId === 'string' && req.query.pacienteId);

    const canalHeader = req.headers['x-canal'];
    const canal =
      typeof canalHeader === 'string' &&
      (CANALES_ATENCION as readonly string[]).includes(canalHeader)
        ? (canalHeader as CanalAtencion)
        : 'whatsapp';

    if (!pacienteId) {
      throw new ForbiddenException('Se requiere pacienteId verificado');
    }

    const verificado = await this.otpService.tieneSesionVerificada(pacienteId, canal);
    if (!verificado) {
      throw new ForbiddenException(
        'Debes verificar tu identidad mediante OTP antes de consultar datos del trámite.',
      );
    }

    return true;
  }
}
