import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { CanalAtencion, EventoOmnicanal, TipoActor } from '@salud-digna/shared';
import { CANALES_ATENCION, TIPOS_ACTOR } from '@salud-digna/shared';
import { z } from 'zod';
import { PersistenciaService } from '../common/persistencia/persistencia.service';
import { KeyValueStoreService } from '../common/redis/kv-store.service';
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
  /** `true` si Expo Push Service aceptó el envío; `false` si falló o el envío real está apagado. */
  entregadoAExpo: boolean;
}

const URL_EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';
/** Los tokens de push se guardan en Redis (AOF en producción): sobreviven reinicios sin migración. */
const TTL_PUSH_TOKENS_SEG = 180 * 24 * 60 * 60;
const MAX_PUSH_DESPACHADOS_EN_MEMORIA = 500;

function esTokenExpoReal(token: string): boolean {
  return /^Expo(nent)?PushToken\[.+\]$/.test(token);
}

/** El envío real a Expo se apaga en pruebas o con `EXPO_PUSH_DESHABILITADO=1`. */
function envioPushRealHabilitado(): boolean {
  return process.env.NODE_ENV !== 'test' && process.env.EXPO_PUSH_DESHABILITADO !== '1';
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
export class CanalesService implements OnModuleInit {
  private readonly logger = new Logger('Canales');
  private readonly interacciones: InteraccionRegistro[] = [];
  private readonly pushDespachados: NotificacionPushDespachada[] = [];

  constructor(
    private readonly identidad: IdentityResolverService,
    private readonly tickets: TicketsService,
    private readonly timeline: TimelineService,
    private readonly eventBus: EventBusService,
    private readonly persistencia: PersistenciaService,
    private readonly kv: KeyValueStoreService,
  ) {
    // Consumidor de notificaciones push para la app móvil Expo (#22)
    this.eventBus.suscribir('notificaciones', async (evento) => {
      if (!evento.pacienteId) return;
      if (evento.tipo !== 'cita.confirmada' && evento.tipo !== 'resultado.liberado') return;
      const titulo =
        evento.tipo === 'cita.confirmada'
          ? 'Tu cita está confirmada'
          : 'Tus resultados ya están listos';
      const cuerpo =
        evento.tipo === 'cita.confirmada'
          ? `Cita confirmada para ${evento.datos.fechaHora}. Consulta los detalles en la app.`
          : 'Ya puedes consultar tus resultados liberados desde la app Salud Digna.';
      await this.enviarPush(evento.pacienteId, evento.tipo, titulo, cuerpo);
    });
  }

  /**
   * Recarga llamadas, correos y mensajes desde MySQL y los vuelve a poner en la línea de tiempo,
   * para que sobrevivan un reinicio del API.
   */
  async onModuleInit(): Promise<void> {
    const desdeBd = await this.persistencia.cargarInteracciones();
    if (!desdeBd) return;
    this.interacciones.splice(0, this.interacciones.length, ...desdeBd);
    for (const i of desdeBd) {
      this.timeline.registrarInteraccion({
        id: i.id,
        pacienteId: i.pacienteId,
        tramiteId: i.tramiteId,
        canal: i.canal,
        actorTipo: i.actorTipo,
        resumen: i.resumen,
        fecha: i.creadoEn,
      });
    }
  }

  private claveTokens(pacienteId: string): string {
    return `push:${pacienteId}`;
  }

  private async leerTokens(pacienteId: string): Promise<RegistroPushToken[]> {
    const crudo = await this.kv.get(this.claveTokens(pacienteId));
    if (!crudo) return [];
    try {
      return JSON.parse(crudo) as RegistroPushToken[];
    } catch {
      return [];
    }
  }

  /**
   * Envía la notificación a cada dispositivo del paciente mediante Expo Push Service y deja un
   * registro (sin texto clínico: solo títulos genéricos).
   */
  private async enviarPush(
    pacienteId: string,
    tipoEvento: EventoOmnicanal['tipo'],
    titulo: string,
    cuerpo: string,
  ): Promise<void> {
    const tokens = await this.leerTokens(pacienteId);
    if (tokens.length === 0) return;

    const reales = tokens.filter((t) => esTokenExpoReal(t.expoPushToken));
    let aceptado = false;
    if (reales.length > 0 && envioPushRealHabilitado()) {
      try {
        const respuesta = await fetch(URL_EXPO_PUSH, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify(
            reales.map((t) => ({
              to: t.expoPushToken,
              title: titulo,
              body: cuerpo,
              sound: 'default',
            })),
          ),
          signal: AbortSignal.timeout(5000),
        });
        aceptado = respuesta.ok;
        if (!respuesta.ok) {
          this.logger.warn(`Expo Push respondió HTTP ${respuesta.status}`);
        }
      } catch (error) {
        this.logger.warn(
          `No se pudo contactar a Expo Push: ${error instanceof Error ? error.name : 'error'}`,
        );
      }
    }

    const ahora = new Date().toISOString();
    for (const reg of tokens) {
      this.pushDespachados.push({
        id: `push_${randomUUID().slice(0, 10)}`,
        pacienteId,
        expoPushToken: reg.expoPushToken,
        titulo,
        cuerpo,
        tipoEvento,
        enviadoEn: ahora,
        entregadoAExpo: aceptado && esTokenExpoReal(reg.expoPushToken),
      });
    }
    if (this.pushDespachados.length > MAX_PUSH_DESPACHADOS_EN_MEMORIA) {
      this.pushDespachados.splice(0, this.pushDespachados.length - MAX_PUSH_DESPACHADOS_EN_MEMORIA);
    }
  }

  /**
   * Registra una llamada de Call Center y la publica en la línea de tiempo unificada (#19, #23).
   */
  async registrarLlamada(
    entrada: z.input<typeof RegistrarLlamadaSchema>,
    asesor: { id: string; tipo: TipoActor },
  ): Promise<InteraccionRegistro> {
    const parsed = RegistrarLlamadaSchema.safeParse(entrada);
    if (!parsed.success) {
      throw new BadRequestException({
        mensaje: 'Datos inválidos para registrar llamada',
        errores: parsed.error.flatten().fieldErrors,
      });
    }

    const d = parsed.data;
    const resumen = `Llamada Call Center (${d.motivo}) — ${d.resultado}. Notas: ${d.notas}`;
    const interaccion = await this.guardarInteraccion({
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

    const interaccion = await this.guardarInteraccion({
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
  async registrarInteraccionCanal(entrada: z.input<typeof RegistrarInteraccionSchema>): Promise<{
    duplicado: boolean;
    interaccion: InteraccionRegistro;
  }> {
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

    const interaccion = await this.guardarInteraccion({
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

  async actualizarEstadoEntrega(
    canal: CanalAtencion,
    referenciaExterna: string,
    estado: EstadoEntregaMensaje,
  ): Promise<{ actualizado: boolean; referenciaExterna: string; estado: EstadoEntregaMensaje }> {
    const encontrada = this.interacciones.find(
      (i) => i.canal === canal && i.referenciaExterna === referenciaExterna,
    );
    if (encontrada) {
      encontrada.estadoEntrega = estado;
      await this.persistencia.guardarInteraccion(encontrada);
      return { actualizado: true, referenciaExterna, estado };
    }
    return { actualizado: false, referenciaExterna, estado };
  }

  listarInteracciones(pacienteId: string): InteraccionRegistro[] {
    return this.interacciones.filter((i) => i.pacienteId === pacienteId);
  }

  async registrarPushToken(
    entrada: z.input<typeof RegistrarPushTokenSchema>,
  ): Promise<RegistroPushToken> {
    const parsed = RegistrarPushTokenSchema.safeParse(entrada);
    if (!parsed.success) {
      throw new BadRequestException('Token push inválido');
    }

    const { pacienteId, expoPushToken, plataforma } = parsed.data;
    const lista = await this.leerTokens(pacienteId);
    const ahora = new Date().toISOString();
    let registro = lista.find((t) => t.expoPushToken === expoPushToken);
    if (registro) {
      registro.plataforma = plataforma;
      registro.actualizadoEn = ahora;
    } else {
      registro = { pacienteId, expoPushToken, plataforma, actualizadoEn: ahora };
      lista.push(registro);
    }

    await this.kv.set(this.claveTokens(pacienteId), JSON.stringify(lista), TTL_PUSH_TOKENS_SEG);
    return registro;
  }

  listarPushTokens(pacienteId: string): Promise<RegistroPushToken[]> {
    return this.leerTokens(pacienteId);
  }

  obtenerPushDespachados(pacienteId?: string): NotificacionPushDespachada[] {
    return pacienteId
      ? this.pushDespachados.filter((p) => p.pacienteId === pacienteId)
      : [...this.pushDespachados];
  }

  private async guardarInteraccion(
    datos: Omit<InteraccionRegistro, 'id' | 'estadoEntrega' | 'creadoEn'>,
  ): Promise<InteraccionRegistro> {
    const registro: InteraccionRegistro = {
      id: `int_${randomUUID().slice(0, 12)}`,
      ...datos,
      estadoEntrega: null,
      creadoEn: new Date().toISOString(),
    };
    this.interacciones.push(registro);
    await this.persistencia.guardarInteraccion(registro);
    return registro;
  }
}
