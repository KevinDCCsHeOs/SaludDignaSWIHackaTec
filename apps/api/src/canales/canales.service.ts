import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { CanalAtencion, EventoOmnicanal, TipoActor } from '@salud-digna/shared';
import { CANALES_ATENCION, TIPOS_ACTOR } from '@salud-digna/shared';
import { z } from 'zod';
import { EventBusService } from '../eventos/event-bus.service';
import { IdentityResolverService } from '../identidad/identidad.service';
import { TicketsService } from '../tickets/tickets.service';
import { TimelineService } from '../timeline/timeline.service';

export type EstadoEntregaMensaje = 'sent' | 'delivered' | 'read' | 'failed';

export interface InteraccionRegistro {
  id: string;
  pacienteId: string;
  tramiteId: string | null;
  canal: CanalAtencion;
  actorTipo: TipoActor;
  actorId: string | null;
  resumen: string;
  referenciaExterna: string | null;
  estadoEntrega: EstadoEntregaMensaje | null;
  metadatos: Record<string, unknown> | null;
  creadoEn: string;
}

export interface RegistroPushToken {
  pacienteId: string;
  expoPushToken: string;
  plataforma: 'android' | 'ios' | 'web';
  actualizadoEn: string;
}

export interface NotificacionPushDespachada {
  id: string;
  pacienteId: string;
  expoPushToken: string;
  titulo: string;
  cuerpo: string;
  tipoEvento: EventoOmnicanal['tipo'];
  enviadoEn: string;
}

export const RegistrarLlamadaSchema = z.object({
  pacienteId: z.string().min(1).max(36),
  tramiteId: z.string().min(1).max(36).nullable().optional(),
  motivo: z.string().min(2).max(160),
  notas: z.string().min(1).max(1000),
  resultado: z.string().min(2).max(160),
  duracionSegundos: z.number().int().nonnegative().default(120),
});

export const CorreoEntranteSchema = z.object({
  remitente: z.string().email(),
  nombreRemitente: z.string().min(1).max(120).optional(),
  asunto: z.string().min(2).max(200),
  cuerpo: z.string().min(2).max(2000),
  region: z.string().min(1).max(60).default('Puebla'),
  tramiteId: z.string().min(1).max(36).nullable().optional(),
});

export const RegistrarInteraccionSchema = z.object({
  pacienteId: z.string().min(1).max(36),
  tramiteId: z.string().min(1).max(36).nullable().optional(),
  canal: z.enum(CANALES_ATENCION),
  actorTipo: z.enum(TIPOS_ACTOR),
  actorId: z.string().min(1).max(64).nullable().optional(),
  resumen: z.string().min(1).max(1000),
  referenciaExterna: z.string().min(1).max(128).nullable().optional(),
  metadatos: z.record(z.unknown()).nullable().optional(),
});

export const RegistrarPushTokenSchema = z.object({
  pacienteId: z.string().min(1).max(36),
  expoPushToken: z.string().min(10).max(200),
  plataforma: z.enum(['android', 'ios', 'web']).default('android'),
});

@Injectable()
export class CanalesService {
  private readonly interacciones: InteraccionRegistro[] = [];
  private readonly pushTokens = new Map<string, RegistroPushToken[]>();
  private readonly pushDespachados: NotificacionPushDespachada[] = [];

  constructor(
    private readonly identidad: IdentityResolverService,
    private readonly tickets: TicketsService,
    private readonly timeline: TimelineService,
    private readonly eventBus: EventBusService,
  ) {
    // Consumidor de notificaciones push para la app móvil Expo (#22)
    this.eventBus.suscribir('notificaciones', (evento) => {
      if (!evento.pacienteId) return;
      if (evento.tipo !== 'cita.confirmada' && evento.tipo !== 'resultado.liberado') return;
      const tokens = this.pushTokens.get(evento.pacienteId) ?? [];
      for (const reg of tokens) {
        const titulo =
          evento.tipo === 'cita.confirmada'
            ? 'Tu cita está confirmada'
            : 'Tus resultados ya están listos';
        const cuerpo =
          evento.tipo === 'cita.confirmada'
            ? `Cita confirmada para ${evento.datos.fechaHora}. Consulta los detalles en la app.`
            : 'Ya puedes consultar tus resultados liberados desde la app Salud Digna.';
        this.pushDespachados.push({
          id: `push_${randomUUID().slice(0, 10)}`,
          pacienteId: evento.pacienteId,
          expoPushToken: reg.expoPushToken,
          titulo,
          cuerpo,
          tipoEvento: evento.tipo,
          enviadoEn: new Date().toISOString(),
        });
      }
    });
  }

  /**
   * Registra una llamada de Call Center y la publica en la línea de tiempo unificada (#19, #23).
   */
  registrarLlamada(
    entrada: z.input<typeof RegistrarLlamadaSchema>,
    asesor: { id: string; tipo: TipoActor },
  ): InteraccionRegistro {
    const parsed = RegistrarLlamadaSchema.safeParse(entrada);
    if (!parsed.success) {
      throw new BadRequestException({
        mensaje: 'Datos inválidos para registrar llamada',
        errores: parsed.error.flatten().fieldErrors,
      });
    }

    const d = parsed.data;
    const resumen = `Llamada Call Center (${d.motivo}) — ${d.resultado}. Notas: ${d.notas}`;
    const interaccion = this.guardarInteraccion({
      pacienteId: d.pacienteId,
      tramiteId: d.tramiteId ?? null,
      canal: 'call_center',
      actorTipo: asesor.tipo,
      actorId: asesor.id,
      resumen,
      referenciaExterna: null,
      metadatos: {
        motivo: d.motivo,
        resultado: d.resultado,
        duracionSegundos: d.duracionSegundos,
      },
    });

    this.timeline.registrarInteraccion({
      id: interaccion.id,
      pacienteId: interaccion.pacienteId,
      tramiteId: interaccion.tramiteId,
      canal: 'call_center',
      actorTipo: asesor.tipo,
      resumen: `Llamada (${d.motivo}): ${d.resultado}`,
      fecha: interaccion.creadoEn,
    });

    return interaccion;
  }

  /**
   * Simula un correo entrante: resuelve identidad por email, crea interacción + ticket
   * y genera respuesta automática de acuse por correo (#23).
   */
  async procesarCorreoEntrante(entrada: z.input<typeof CorreoEntranteSchema>) {
    const parsed = CorreoEntranteSchema.safeParse(entrada);
    if (!parsed.success) {
      throw new BadRequestException({
        mensaje: 'Datos inválidos de correo entrante',
        errores: parsed.error.flatten().fieldErrors,
      });
    }

    const d = parsed.data;
    const resolucion = await this.identidad.resolver({
      canal: 'email',
      identificador: d.remitente,
    });

    let pacienteId = resolucion.pacienteId;
    if (!pacienteId) {
      const nombrePartes = (d.nombreRemitente ?? d.remitente.split('@')[0]).trim().split(/\s+/);
      const registro = await this.identidad.registrarLigero({
        nombre: nombrePartes[0] ?? 'Paciente',
        apellidos: nombrePartes.slice(1).join(' ') || 'Correo Demo',
        canal: 'email',
        identificador: d.remitente,
        email: d.remitente,
        region: d.region,
        esDemo: true,
      });
      pacienteId = registro.pacienteId;
    }

    const interaccion = this.guardarInteraccion({
      pacienteId,
      tramiteId: d.tramiteId ?? null,
      canal: 'email',
      actorTipo: 'paciente',
      actorId: pacienteId,
      resumen: `Correo recibido: "${d.asunto}"`,
      referenciaExterna: null,
      metadatos: {
        asunto: d.asunto,
        longitudCuerpo: d.cuerpo.length,
      },
    });

    this.timeline.registrarInteraccion({
      id: interaccion.id,
      pacienteId,
      tramiteId: d.tramiteId ?? null,
      canal: 'email',
      actorTipo: 'paciente',
      resumen: `Correo entrante: ${d.asunto}`,
      fecha: interaccion.creadoEn,
    });

    const ticket = await this.tickets.crear(
      {
        pacienteId,
        tramiteId: d.tramiteId ?? null,
        canalOrigen: 'email',
        tipo: /queja|molest|error/i.test(`${d.asunto} ${d.cuerpo}`) ? 'queja' : 'duda',
        region: d.region,
        resumenIa: `Correo recibido con asunto "${d.asunto}"`,
      },
      { tipo: 'sistema', id: 'canal-email-simulado' },
    );

    const acuseAutomatico = {
      para: d.remitente,
      asunto: `Acuse de recibo [${ticket.folio}]: ${d.asunto}`,
      cuerpo: `Recibimos tu mensaje en Salud Digna Omnicanal. Quedó registrado con el folio ${ticket.folio} y un asesor dará seguimiento sin pedirte repetir tu información.`,
      simulado: true,
      enviadoEn: new Date().toISOString(),
    };

    return {
      pacienteId,
      estadoIdentidad: resolucion.estado,
      interaccion,
      ticket,
      acuseAutomatico,
    };
  }

  /**
   * Registra interacciones desde canales externos (ej. WhatsApp Cloud API, #20) con deduplicación por `referenciaExterna`.
   */
  registrarInteraccionCanal(entrada: z.input<typeof RegistrarInteraccionSchema>): {
    duplicado: boolean;
    interaccion: InteraccionRegistro;
  } {
    const parsed = RegistrarInteraccionSchema.safeParse(entrada);
    if (!parsed.success) {
      throw new BadRequestException('Datos de interacción inválidos');
    }

    const d = parsed.data;
    if (d.referenciaExterna) {
      const existente = this.interacciones.find(
        (i) => i.canal === d.canal && i.referenciaExterna === d.referenciaExterna,
      );
      if (existente) {
        return { duplicado: true, interaccion: existente };
      }
    }

    const interaccion = this.guardarInteraccion({
      pacienteId: d.pacienteId,
      tramiteId: d.tramiteId ?? null,
      canal: d.canal,
      actorTipo: d.actorTipo,
      actorId: d.actorId ?? null,
      resumen: d.resumen,
      referenciaExterna: d.referenciaExterna ?? null,
      metadatos: d.metadatos ?? null,
    });

    this.timeline.registrarInteraccion({
      id: interaccion.id,
      pacienteId: interaccion.pacienteId,
      tramiteId: interaccion.tramiteId,
      canal: interaccion.canal,
      actorTipo: interaccion.actorTipo,
      resumen: interaccion.resumen,
      fecha: interaccion.creadoEn,
    });

    return { duplicado: false, interaccion };
  }

  actualizarEstadoEntrega(
    canal: CanalAtencion,
    referenciaExterna: string,
    estado: EstadoEntregaMensaje,
  ): { actualizado: boolean; referenciaExterna: string; estado: EstadoEntregaMensaje } {
    const encontrada = this.interacciones.find(
      (i) => i.canal === canal && i.referenciaExterna === referenciaExterna,
    );
    if (encontrada) {
      encontrada.estadoEntrega = estado;
      return { actualizado: true, referenciaExterna, estado };
    }
    return { actualizado: false, referenciaExterna, estado };
  }

  listarInteracciones(pacienteId: string): InteraccionRegistro[] {
    return this.interacciones.filter((i) => i.pacienteId === pacienteId);
  }

  registrarPushToken(entrada: z.input<typeof RegistrarPushTokenSchema>): RegistroPushToken {
    const parsed = RegistrarPushTokenSchema.safeParse(entrada);
    if (!parsed.success) {
      throw new BadRequestException('Token push inválido');
    }

    const lista = this.pushTokens.get(parsed.data.pacienteId) ?? [];
    const existente = lista.find((t) => t.expoPushToken === parsed.data.expoPushToken);
    const ahora = new Date().toISOString();
    if (existente) {
      existente.plataforma = parsed.data.plataforma;
      existente.actualizadoEn = ahora;
      return existente;
    }

    const nuevo: RegistroPushToken = {
      pacienteId: parsed.data.pacienteId,
      expoPushToken: parsed.data.expoPushToken,
      plataforma: parsed.data.plataforma,
      actualizadoEn: ahora,
    };
    lista.push(nuevo);
    this.pushTokens.set(parsed.data.pacienteId, lista);
    return nuevo;
  }

  listarPushTokens(pacienteId: string): RegistroPushToken[] {
    return this.pushTokens.get(pacienteId) ?? [];
  }

  obtenerPushDespachados(pacienteId?: string): NotificacionPushDespachada[] {
    return pacienteId
      ? this.pushDespachados.filter((p) => p.pacienteId === pacienteId)
      : [...this.pushDespachados];
  }

  private guardarInteraccion(
    datos: Omit<InteraccionRegistro, 'id' | 'estadoEntrega' | 'creadoEn'>,
  ): InteraccionRegistro {
    const registro: InteraccionRegistro = {
      id: `int_${randomUUID().slice(0, 12)}`,
      ...datos,
      estadoEntrega: null,
      creadoEn: new Date().toISOString(),
    };
    this.interacciones.push(registro);
    return registro;
  }
}
