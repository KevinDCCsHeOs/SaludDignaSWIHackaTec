import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { EventoOmnicanal, validarEventoOmnicanal } from '@salud-digna/shared';

const MAX_EVENTOS_EN_MEMORIA = 1000;

export type EventoSinIdNiFecha<T extends EventoOmnicanal = EventoOmnicanal> = Omit<
  T,
  'eventId' | 'timestamp'
> & {
  eventId?: string;
  timestamp?: string;
};

/**
 * Fachada transversal de publicación de eventos validados contra `@salud-digna/shared`.
 * El `EventBusService` (#14) se conecta como despachador para distribuir a Redis Streams,
 * timeline, tiempo real (Socket.IO), métricas, tickets y notificaciones.
 */
@Injectable()
export class EventPublisherService {
  private readonly eventosEmitidos: EventoOmnicanal[] = [];
  private persistidorOutbox?: (evento: EventoOmnicanal) => Promise<void>;
  private despachadorBus?: (evento: EventoOmnicanal) => Promise<void>;

  configurarPersistidor(fn: (evento: EventoOmnicanal) => Promise<void>): void {
    this.persistidorOutbox = fn;
  }

  configurarDespachadorBus(fn: (evento: EventoOmnicanal) => Promise<void>): void {
    this.despachadorBus = fn;
  }

  async publicar<T extends EventoOmnicanal>(entrada: EventoSinIdNiFecha<T>): Promise<T> {
    const candidato = {
      ...entrada,
      eventId: entrada.eventId ?? randomUUID(),
      timestamp: entrada.timestamp ?? new Date().toISOString(),
    };
    const validado = validarEventoOmnicanal(candidato) as T;
    this.eventosEmitidos.push(validado);
    if (this.eventosEmitidos.length > MAX_EVENTOS_EN_MEMORIA) {
      this.eventosEmitidos.splice(0, this.eventosEmitidos.length - MAX_EVENTOS_EN_MEMORIA);
    }

    if (this.persistidorOutbox) {
      try {
        await this.persistidorOutbox(validado);
      } catch {
        // El persistidor registra el fallo; el evento sigue distribuyéndose en memoria
      }
    }

    if (this.despachadorBus) {
      await this.despachadorBus(validado);
    }

    return validado;
  }

  obtenerEventosEmitidos(): readonly EventoOmnicanal[] {
    return this.eventosEmitidos;
  }

  limpiarParaPruebas(): void {
    this.eventosEmitidos.length = 0;
  }
}
