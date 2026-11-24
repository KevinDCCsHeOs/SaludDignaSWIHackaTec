import { Injectable, OnModuleDestroy } from '@nestjs/common';
import type { ConsumidorEvento, EventoOmnicanal } from '@salud-digna/shared';
import Redis from 'ioredis';
import {
  EventPublisherService,
  EventoSinIdNiFecha,
} from '../common/eventos/event-publisher.service';

export type HandlerConsumidorEvento = (evento: EventoOmnicanal) => Promise<void> | void;

export interface RegistroOutboxEvento {
  evento: EventoOmnicanal;
  publicadoEn: string | null;
  intentosPublicacion: number;
  streamId: string | null;
}

const STREAM_EVENTOS = 'eventos';
const MAX_REINTENTOS_CONSUMIDOR = 3;

/**
 * Bus de eventos omnicanal (#14, ADR 0003):
 * - Persiste en outbox antes de distribuir.
 * - Publica en Redis Streams (`XADD eventos * ...`) cuando Redis está activo.
 * - Gestiona grupos de consumo (`timeline`, `tickets`, `metricas`, `notificaciones`, `realtime`)
 *   con idempotencia estricta por `(grupo, eventId)` y reintentos ante fallos.
 */
@Injectable()
export class EventBusService implements OnModuleDestroy {
  private readonly outbox = new Map<string, RegistroOutboxEvento>();
  private readonly suscriptores = new Map<ConsumidorEvento, HandlerConsumidorEvento[]>();
  private readonly procesadosPorGrupo = new Map<ConsumidorEvento, Set<string>>();
  private readonly fallosPendientes: Array<{ grupo: ConsumidorEvento; evento: EventoOmnicanal }> =
    [];
  private redis: Redis | null = null;

  constructor(private readonly publisher: EventPublisherService) {
    if (process.env.NODE_ENV !== 'test' && process.env.REDIS_URL) {
      this.redis = new Redis(process.env.REDIS_URL, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      });
      this.redis.on('error', () => undefined);
    }

    // Conectar todos los módulos que usan `EventPublisherService` (#6–#11) al bus
    this.publisher.configurarDespachadorBus(async (evento) => {
      await this.distribuirEventoValidado(evento);
    });
  }

  suscribir(grupo: ConsumidorEvento, handler: HandlerConsumidorEvento): void {
    const lista = this.suscriptores.get(grupo) ?? [];
    lista.push(handler);
    this.suscriptores.set(grupo, lista);
    if (!this.procesadosPorGrupo.has(grupo)) {
      this.procesadosPorGrupo.set(grupo, new Set<string>());
    }
  }

  async publish<T extends EventoOmnicanal>(entrada: EventoSinIdNiFecha<T>): Promise<T> {
    return this.publisher.publicar(entrada);
  }

  /**
   * Publica en Redis Streams (si está conectado) y despacha a todos los grupos de consumo.
   */
  async distribuirEventoValidado(evento: EventoOmnicanal): Promise<void> {
    let registro = this.outbox.get(evento.eventId);
    if (!registro) {
      registro = {
        evento,
        publicadoEn: null,
        intentosPublicacion: 0,
        streamId: null,
      };
      this.outbox.set(evento.eventId, registro);
    }

    registro.intentosPublicacion += 1;

    // Publicación en Redis Streams (`XADD eventos * ...`)
    if (this.redis) {
      try {
        if (this.redis.status === 'wait') await this.redis.connect();
        const streamId = await this.redis.xadd(
          STREAM_EVENTOS,
          '*',
          'eventId',
          evento.eventId,
          'tipo',
          evento.tipo,
          'canal',
          evento.canal,
          'payload',
          JSON.stringify(evento),
        );
        registro.streamId = streamId;
      } catch {
        // Si Redis falla temporalmente, el evento queda en outbox para republicación
      }
    }

    registro.publicadoEn = new Date().toISOString();

    for (const [grupo, handlers] of this.suscriptores.entries()) {
      await this.entregarAGrupo(grupo, handlers, evento);
    }
  }

  private async entregarAGrupo(
    grupo: ConsumidorEvento,
    handlers: HandlerConsumidorEvento[],
    evento: EventoOmnicanal,
  ): Promise<boolean> {
    const procesados = this.procesadosPorGrupo.get(grupo) ?? new Set<string>();
    this.procesadosPorGrupo.set(grupo, procesados);

    // Idempotencia estricta por `(grupo, eventId)`
    if (procesados.has(evento.eventId)) {
      return true;
    }

    for (let intento = 1; intento <= MAX_REINTENTOS_CONSUMIDOR; intento++) {
      try {
        for (const handler of handlers) {
          await handler(evento);
        }
        procesados.add(evento.eventId);
        return true;
      } catch {
        if (intento === MAX_REINTENTOS_CONSUMIDOR) {
          this.fallosPendientes.push({ grupo, evento });
        }
      }
    }

    return false;
  }

  /**
   * Reprocesa manualmente eventos que agotaron reintentos inmediatos (resiliencia #14).
   */
  async reprocesarFallosPendientes(): Promise<number> {
    const lote = this.fallosPendientes.splice(0, this.fallosPendientes.length);
    let recuperados = 0;
    for (const item of lote) {
      const handlers = this.suscriptores.get(item.grupo) ?? [];
      const ok = await this.entregarAGrupo(item.grupo, handlers, item.evento);
      if (ok) recuperados += 1;
    }
    return recuperados;
  }

  /**
   * Permite simular o reinyectar un evento ya emitido (prueba de idempotencia ante duplicados).
   */
  async reentregarEvento(evento: EventoOmnicanal): Promise<void> {
    await this.distribuirEventoValidado(evento);
  }

  fueProcesadoPor(grupo: ConsumidorEvento, eventId: string): boolean {
    return this.procesadosPorGrupo.get(grupo)?.has(eventId) ?? false;
  }

  obtenerOutbox(): RegistroOutboxEvento[] {
    return [...this.outbox.values()];
  }

  obtenerConteoPendientes(): number {
    return this.fallosPendientes.length;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      await this.redis.quit().catch(() => undefined);
    }
  }
}
