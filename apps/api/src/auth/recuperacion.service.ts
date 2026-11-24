import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { CanalAtencion, RolUsuario } from '@salud-digna/shared';
import { CANALES_ATENCION } from '@salud-digna/shared';
import { z } from 'zod';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { KeyValueStoreService } from '../common/redis/kv-store.service';
import { normalizarTelefonoE164 } from '../identidad/normalizador';
import { PacienteStoreService } from '../identidad/paciente-store.service';
import { OtpService } from '../otp/otp.service';
import { AuthService } from './auth.service';
import { UsuarioAuthRegistro, UsuarioAuthStoreService } from './usuarios-demo';

const TTL_RECUPERACION_SEGUNDOS = 30 * 60; // 30 min (#9)

export const SolicitarRecuperacionSchema = z
  .object({
    email: z.string().email().optional(),
    telefono: z.string().min(10).max(25).optional(),
    canal: z.enum(CANALES_ATENCION).default('email'),
  })
  .refine((d) => Boolean(d.email || d.telefono), {
    message: 'Debes indicar email o teléfono para recuperar tu cuenta',
  });

export const RestablecerContrasenaSchema = z.object({
  token: z.string().min(32).max(128),
  nuevaContrasena: z
    .string()
    .min(8, 'La nueva contraseña debe tener al menos 8 caracteres')
    .max(128),
});

export interface NotificacionAccesoSimulada {
  tipo: 'enlace_recuperacion' | 'cambio_contrasena';
  usuarioId: string;
  pacienteId: string | null;
  canal: CanalAtencion;
  token?: string;
  enlace?: string;
  mensaje: string;
  enviadoEn: string;
}

@Injectable()
export class RecuperacionAccesoService {
  private readonly notificaciones: NotificacionAccesoSimulada[] = [];

  constructor(
    private readonly usuarios: UsuarioAuthStoreService,
    private readonly pacientes: PacienteStoreService,
    private readonly otpService: OtpService,
    private readonly authService: AuthService,
    private readonly kv: KeyValueStoreService,
    private readonly auditoria: AuditoriaService,
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private claveToken(tokenHash: string): string {
    return `auth:rec:${tokenHash}`;
  }

  private construirEnlace(token: string): string {
    const baseUrl = process.env.WEB_BASE_URL ?? 'http://localhost:3002';
    return `${baseUrl}/restablecer-contrasena?token=${token}`;
  }

  private async emitirYEnviarEnlace(
    usuario: UsuarioAuthRegistro,
    canal: CanalAtencion,
  ): Promise<void> {
    const token = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(token);

    await this.kv.set(
      this.claveToken(tokenHash),
      JSON.stringify({
        usuarioId: usuario.id,
        pacienteId: usuario.pacienteId,
        canal,
        creadoEn: new Date().toISOString(),
      }),
      TTL_RECUPERACION_SEGUNDOS,
    );

    this.notificaciones.push({
      tipo: 'enlace_recuperacion',
      usuarioId: usuario.id,
      pacienteId: usuario.pacienteId,
      canal,
      token,
      enlace: this.construirEnlace(token),
      mensaje: 'Usa este enlace de un solo uso (válido por 30 minutos) para restablecer tu acceso.',
      enviadoEn: new Date().toISOString(),
    });
  }

  /**
   * Inicia recuperación de acceso desde web, app o WhatsApp (#9).
   * En WhatsApp exige verificación OTP previa antes de enviar el enlace.
   */
  async solicitarRecuperacion(
    entrada: { email?: string; telefono?: string; canal?: CanalAtencion },
    ip = '127.0.0.1',
  ): Promise<{ enviado: true; expiraEnSegundos: number; mensaje: string }> {
    const parsed = SolicitarRecuperacionSchema.safeParse(entrada);
    if (!parsed.success) {
      throw new BadRequestException('Debes proporcionar un correo o teléfono válido');
    }

    const { email, telefono, canal } = parsed.data;
    let usuario: UsuarioAuthRegistro | undefined;

    if (email) {
      usuario = this.usuarios.buscarPorEmail(email);
    } else if (telefono) {
      let telNorm: string;
      try {
        telNorm = normalizarTelefonoE164(telefono);
      } catch {
        throw new BadRequestException('Formato de teléfono inválido');
      }
      const coincidencias = this.pacientes.buscarPacientesPorTelefono(telNorm);
      if (coincidencias.length === 1 && coincidencias[0].usuarioId) {
        usuario = this.usuarios.buscarPorId(coincidencias[0].usuarioId);
      }
    }

    if (usuario) {
      if (canal === 'whatsapp') {
        if (!usuario.pacienteId) {
          throw new ForbiddenException('La cuenta no tiene un perfil de paciente vinculado');
        }
        const verificado = await this.otpService.tieneSesionVerificada(
          usuario.pacienteId,
          'whatsapp',
        );
        if (!verificado) {
          throw new ForbiddenException(
            'Para recibir el enlace por WhatsApp primero verifica tu identidad con el código OTP.',
          );
        }
      }

      await this.emitirYEnviarEnlace(usuario, canal);

      await this.auditoria.registrar({
        usuarioId: usuario.id,
        rol: usuario.rol,
        accion: 'actualizar',
        entidad: 'RecuperacionAcceso',
        entidadId: usuario.id,
        pacienteId: usuario.pacienteId,
        canal,
        ip,
        exitoso: true,
      });
    }

    // Respuesta genérica anti-enumeración de cuentas
    return {
      enviado: true,
      expiraEnSegundos: TTL_RECUPERACION_SEGUNDOS,
      mensaje:
        'Si los datos coinciden con una cuenta activa, enviamos un enlace de recuperación de un solo uso válido por 30 minutos.',
    };
  }

  /**
   * Asistencia desde consola del asesor (#9): solo dispara el enlace al paciente;
   * el asesor NUNCA ve el token ni puede ver o definir la contraseña.
   */
  async asistirDesdeAsesor(
    entrada: { pacienteId: string; canal?: CanalAtencion },
    asesorId: string,
    asesorRol: RolUsuario,
    ip = '127.0.0.1',
  ): Promise<{ enviado: true; canal: CanalAtencion; mensaje: string }> {
    const paciente = this.pacientes.buscarPorId(entrada.pacienteId);
    if (!paciente) {
      throw new NotFoundException('Paciente no encontrado');
    }

    const usuario = this.usuarios.buscarPorPacienteId(paciente.id);
    if (!usuario || !usuario.activo) {
      throw new NotFoundException('El paciente no tiene una cuenta web/app activa para recuperar');
    }

    const canal: CanalAtencion = entrada.canal ?? paciente.canalPreferido ?? 'email';
    await this.emitirYEnviarEnlace(usuario, canal);

    await this.auditoria.registrar({
      usuarioId: asesorId,
      rol: asesorRol,
      accion: 'actualizar',
      entidad: 'RecuperacionAccesoAsistida',
      entidadId: usuario.id,
      pacienteId: paciente.id,
      canal: 'call_center',
      ip,
      exitoso: true,
      detalleSinPii: { canalEnvio: canal },
    });

    return {
      enviado: true,
      canal,
      mensaje:
        'Se envió un enlace seguro de restablecimiento directamente al paciente (válido por 30 minutos).',
    };
  }

  /**
   * Consume el token de un solo uso, actualiza el hash bcrypt, revoca sesiones y notifica al paciente (#9).
   */
  async restablecerContrasena(
    entrada: { token: string; nuevaContrasena: string },
    canal: CanalAtencion = 'web',
    ip = '127.0.0.1',
  ): Promise<{ restablecida: true; mensaje: string }> {
    const parsed = RestablecerContrasenaSchema.safeParse(entrada);
    if (!parsed.success) {
      throw new BadRequestException({
        mensaje: 'Token o contraseña inválida',
        errores: parsed.error.flatten().fieldErrors,
      });
    }

    const clave = this.claveToken(this.hashToken(parsed.data.token));
    const raw = await this.kv.get(clave);
    if (!raw) {
      await this.auditoria.registrar({
        accion: 'actualizar',
        entidad: 'RestablecerContrasena',
        entidadId: 'token_invalido',
        canal,
        ip,
        exitoso: false,
      });
      throw new BadRequestException(
        'El enlace de recuperación es inválido, ya fue utilizado o expiró.',
      );
    }

    // Un solo uso: eliminar el token antes de completar
    await this.kv.del(clave);

    const datos = JSON.parse(raw) as {
      usuarioId: string;
      pacienteId: string | null;
      canal: CanalAtencion;
    };

    await this.usuarios.actualizarContrasena(datos.usuarioId, parsed.data.nuevaContrasena);
    await this.authService.revocarTodasLasSesiones(datos.usuarioId);

    this.notificaciones.push({
      tipo: 'cambio_contrasena',
      usuarioId: datos.usuarioId,
      pacienteId: datos.pacienteId,
      canal: datos.canal,
      mensaje:
        'Tu contraseña de Salud Digna Omnicanal fue actualizada correctamente. Si no fuiste tú, contáctanos de inmediato.',
      enviadoEn: new Date().toISOString(),
    });

    await this.auditoria.registrar({
      usuarioId: datos.usuarioId,
      rol: 'paciente',
      accion: 'actualizar',
      entidad: 'RestablecerContrasena',
      entidadId: datos.usuarioId,
      pacienteId: datos.pacienteId,
      canal,
      ip,
      exitoso: true,
    });

    return {
      restablecida: true,
      mensaje: 'Tu contraseña se actualizó correctamente. Ya puedes iniciar sesión.',
    };
  }

  obtenerNotificacionesParaPruebas(): readonly NotificacionAccesoSimulada[] {
    return this.notificaciones;
  }

  limpiarParaPruebas(): void {
    this.notificaciones.length = 0;
  }
}
