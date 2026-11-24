import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CanalAtencion, EstadoResolucionIdentidad, RolUsuario } from '@salud-digna/shared';
import { CANALES_ATENCION, IDIOMAS_PACIENTE } from '@salud-digna/shared';
import { z } from 'zod';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { EventPublisherService } from '../common/eventos/event-publisher.service';
import { OtpService } from '../otp/otp.service';
import { CifradoService } from '../privacidad/cifrado.service';
import { proyectarPacientePorRol } from '../privacidad/enmascarado';
import { normalizarIdentificador, normalizarTelefonoE164 } from './normalizador';
import {
  IdentidadCanalRegistro,
  PacienteRegistro,
  PacienteStoreService,
} from './paciente-store.service';

export const ResolverIdentidadSchema = z.object({
  canal: z.enum(CANALES_ATENCION),
  identificador: z.string().min(1).max(254),
});

export const VincularIdentidadSchema = z.object({
  pacienteId: z.string().min(1).max(36),
  canal: z.enum(CANALES_ATENCION),
  identificador: z.string().min(1).max(254),
  metodoVerificacion: z.string().min(1).max(40).default('otp_whatsapp'),
});

export const RegistroLigeroSchema = z.object({
  nombre: z.string().min(1).max(120),
  apellidos: z.string().min(1).max(150),
  canal: z.enum(CANALES_ATENCION),
  identificador: z.string().min(1).max(254),
  email: z.string().email().optional(),
  telefono: z.string().min(10).max(25).optional(),
  idioma: z.enum(IDIOMAS_PACIENTE).default('es'),
  region: z.string().min(1).max(60).optional(),
  esDemo: z.boolean().default(true),
});

export interface ResultadoResolucionIdentidad {
  estado: EstadoResolucionIdentidad;
  pacienteId?: string;
  identificadorNormalizado: string;
  requiereRevisionAsesor?: boolean;
}

@Injectable()
export class IdentityResolverService {
  constructor(
    private readonly store: PacienteStoreService,
    private readonly cifrado: CifradoService,
    private readonly otpService: OtpService,
    private readonly eventPublisher: EventPublisherService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * Algoritmo oficial de resolución de identidad entre canales (#7, ADR 0006):
   * 1. Normalizar identificador (E.164, email minúsculas, CURP mayúsculas).
   * 2. Buscar en `IdentidadCanal`.
   * 3. Si no existe, buscar coincidencia fuerte en `Paciente` (teléfono, email o curp_hash).
   * 4. 1 coincidencia -> `requiere_verificacion`; 0 -> `nuevo`; >1 -> `ambiguo`.
   */
  async resolver(entrada: {
    canal: CanalAtencion;
    identificador: string;
  }): Promise<ResultadoResolucionIdentidad> {
    const parsed = ResolverIdentidadSchema.safeParse(entrada);
    if (!parsed.success) {
      throw new BadRequestException('Solicitud de resolución de identidad inválida');
    }

    const { canal, identificador } = parsed.data;
    let normalizado: ReturnType<typeof normalizarIdentificador>;
    try {
      normalizado = normalizarIdentificador(canal, identificador);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }

    // Paso 2: buscar coincidencia directa en `IdentidadCanal`
    const identidadExistente = this.store.buscarIdentidadCanal(canal, normalizado.valor);
    if (identidadExistente) {
      const estado: EstadoResolucionIdentidad = identidadExistente.verificadoEn
        ? 'conocido'
        : 'requiere_verificacion';
      await this.eventPublisher.publicar({
        tipo: 'identidad.resuelta',
        version: 1,
        pacienteId: identidadExistente.pacienteId,
        tramiteId: null,
        canal,
        actor: { tipo: 'sistema', id: 'identity-resolver' },
        datos: {
          estadoResolucion: estado,
          canalOrigen: canal,
          coincidencias: 1,
        },
      });
      return {
        estado,
        pacienteId: identidadExistente.pacienteId,
        identificadorNormalizado: normalizado.valor,
      };
    }

    // Paso 3: coincidencia fuerte en `Paciente` (nunca fuzzy matching por nombre)
    let coincidencias: PacienteRegistro[] = [];
    if (normalizado.tipo === 'telefono') {
      coincidencias = this.store.buscarPacientesPorTelefono(normalizado.valor);
    } else if (normalizado.tipo === 'email') {
      coincidencias = this.store.buscarPacientesPorEmail(normalizado.valor);
    } else if (normalizado.tipo === 'curp') {
      const hash = this.cifrado.hashCurp(normalizado.valor);
      coincidencias = this.store.buscarPacientesPorCurpHash(hash);
    }

    let estado: EstadoResolucionIdentidad;
    let pacienteId: string | undefined;

    if (coincidencias.length === 1) {
      estado = 'requiere_verificacion';
      pacienteId = coincidencias[0].id;
    } else if (coincidencias.length > 1) {
      estado = 'ambiguo';
    } else {
      estado = 'nuevo';
    }

    await this.eventPublisher.publicar({
      tipo: 'identidad.resuelta',
      version: 1,
      pacienteId: pacienteId ?? null,
      tramiteId: null,
      canal,
      actor: { tipo: 'sistema', id: 'identity-resolver' },
      datos: {
        estadoResolucion: estado,
        canalOrigen: canal,
        coincidencias: coincidencias.length,
      },
    });

    return {
      estado,
      ...(pacienteId ? { pacienteId } : {}),
      identificadorNormalizado: normalizado.valor,
      ...(estado === 'ambiguo' ? { requiereRevisionAsesor: true } : {}),
    };
  }

  /**
   * Vincula una `IdentidadCanal` nueva a un paciente existente ÚNICAMENTE tras verificación (#7, #8).
   */
  async vincularTrasVerificacion(
    entrada: {
      pacienteId: string;
      canal: CanalAtencion;
      identificador: string;
      metodoVerificacion?: string;
    },
    actorId: string,
    ip = '127.0.0.1',
  ): Promise<IdentidadCanalRegistro> {
    const parsed = VincularIdentidadSchema.safeParse(entrada);
    if (!parsed.success) {
      throw new BadRequestException('Datos de vinculación inválidos');
    }

    const { pacienteId, canal, identificador, metodoVerificacion } = parsed.data;
    const paciente = this.store.buscarPorId(pacienteId);
    if (!paciente) {
      throw new NotFoundException('Paciente no encontrado');
    }

    // Regla inviolable: no se vinculan identidades sin verificación previa (#7, #8)
    const verificado = await this.otpService.tieneSesionVerificada(pacienteId, canal);
    if (!verificado) {
      throw new ForbiddenException(
        'No se puede vincular una identidad de canal sin verificación previa (OTP o Call Center).',
      );
    }

    const normalizado = normalizarIdentificador(canal, identificador);
    const colision = this.store.buscarIdentidadCanal(canal, normalizado.valor);
    if (colision && colision.pacienteId !== pacienteId) {
      throw new ConflictException(
        'El identificador ya está vinculado a otro paciente. Requiere revisión del asesor.',
      );
    }

    const identidad = this.store.guardarIdentidadCanal({
      pacienteId,
      canal,
      identificador: normalizado.valor,
      verificadoEn: new Date().toISOString(),
      metodoVerificacion,
    });

    await this.eventPublisher.publicar({
      tipo: 'identidad.vinculada',
      version: 1,
      pacienteId,
      tramiteId: null,
      canal,
      actor: { tipo: 'sistema', id: actorId },
      datos: {
        identidadCanalId: identidad.id,
        canalVinculado: canal,
        metodoVerificacion,
      },
    });

    await this.auditoria.registrar({
      usuarioId: actorId,
      accion: 'vincular_identidad',
      entidad: 'IdentidadCanal',
      entidadId: identidad.id,
      pacienteId,
      canal,
      ip,
      exitoso: true,
    });

    return identidad;
  }

  /**
   * Alta de registro ligero para pacientes nuevos (#7).
   */
  async registrarLigero(entrada: z.input<typeof RegistroLigeroSchema>) {
    const parsed = RegistroLigeroSchema.safeParse(entrada);
    if (!parsed.success) {
      throw new BadRequestException('Datos inválidos para registro ligero');
    }

    const data = parsed.data;
    const norm = normalizarIdentificador(data.canal, data.identificador);
    const telefonoE164 = data.telefono
      ? normalizarTelefonoE164(data.telefono)
      : norm.tipo === 'telefono'
        ? norm.valor
        : null;
    const email = data.email
      ? data.email.trim().toLowerCase()
      : norm.tipo === 'email'
        ? norm.valor
        : null;

    const paciente = this.store.crearPaciente({
      nombre: data.nombre,
      apellidos: data.apellidos,
      telefonoE164,
      email,
      canalPreferido: data.canal,
      idioma: data.idioma,
      region: data.region ?? null,
      esDemo: data.esDemo,
    });

    const identidad = this.store.guardarIdentidadCanal({
      pacienteId: paciente.id,
      canal: data.canal,
      identificador: norm.valor,
      verificadoEn: null,
      metodoVerificacion: null,
      esPrincipal: true,
    });

    await this.eventPublisher.publicar({
      tipo: 'paciente.registrado',
      version: 1,
      pacienteId: paciente.id,
      tramiteId: null,
      canal: data.canal,
      actor: { tipo: 'paciente', id: paciente.id },
      datos: {
        registroLigero: true,
        canalPreferido: paciente.canalPreferido,
        idioma: paciente.idioma,
        ...(paciente.region ? { region: paciente.region } : {}),
        esDemo: paciente.esDemo,
      },
    });

    return { pacienteId: paciente.id, identidadCanalId: identidad.id };
  }

  /**
   * Merge controlado de duplicados con auditoría obligatoria (solo asesor_pro / admin, #7).
   */
  async fusionarDuplicados(
    pacienteOrigenId: string,
    pacienteDestinoId: string,
    motivo: string,
    usuarioId: string,
    rol: RolUsuario,
    ip = '127.0.0.1',
  ) {
    if (pacienteOrigenId === pacienteDestinoId) {
      throw new BadRequestException('El paciente origen y destino no pueden ser el mismo');
    }
    const resultado = this.store.fusionarPacientes(pacienteOrigenId, pacienteDestinoId);

    await this.auditoria.registrar({
      usuarioId,
      rol,
      accion: 'actualizar',
      entidad: 'PacienteMerge',
      entidadId: pacienteDestinoId,
      pacienteId: pacienteDestinoId,
      canal: 'web',
      ip,
      exitoso: true,
      detalleSinPii: {
        pacienteOrigenId,
        pacienteDestinoId,
        identidadesMovidas: resultado.identidadesMovidas,
        motivo,
      },
    });

    return {
      fusionado: true,
      pacienteDestinoId,
      identidadesMovidas: resultado.identidadesMovidas,
    };
  }

  /**
   * Busca pacientes por nombre, teléfono o correo devolviendo solo campos enmascarados por rol (#19, #10).
   */
  buscarPacientesMinimizado(termino: string, rol: RolUsuario) {
    return this.store.buscarPorTexto(termino).map((p) => this.obtenerPerfilMinimizado(p.id, rol));
  }

  /**
   * Devuelve el perfil del paciente proyectado y enmascarado según el rol solicitante (#10).
   */
  obtenerPerfilMinimizado(pacienteId: string, rol: RolUsuario) {
    const paciente = this.store.buscarPorId(pacienteId);
    if (!paciente) {
      throw new NotFoundException('Paciente no encontrado');
    }
    return proyectarPacientePorRol(
      {
        id: paciente.id,
        nombre: paciente.nombre,
        apellidos: paciente.apellidos,
        email: paciente.email,
        telefonoE164: paciente.telefonoE164,
        curp: paciente.curpCifrado ? this.cifrado.descifrar(paciente.curpCifrado) : null,
        fechaNacimiento: paciente.fechaNacCifrada
          ? this.cifrado.descifrar(paciente.fechaNacCifrada)
          : null,
        canalPreferido: paciente.canalPreferido,
        idioma: paciente.idioma,
        region: paciente.region,
        esDemo: paciente.esDemo,
      },
      rol,
    );
  }
}
