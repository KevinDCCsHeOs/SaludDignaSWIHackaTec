import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { EventoOmnicanal, validarEventoOmnicanal } from '@salud-digna/shared';

export type EventoSinIdNiFecha<T extends EventoOmnicanal = EventoOmnicanal> = Omit<
  T,
  'eventId' | 'timestamp'
> & {
  eventId?: string;
  timestamp?: string;
};

/**
 * Publicador centralizado de eventos de dominio validados contra `@salud-digna/shared`.
 * Registra los eventos en memoria y los persiste en tabla outbox si hay persistencia configurada;
 * en el issue #14 se conecta directamente con Redis Streams sin cambiar los emisores.
 */
@Injectable()
export class EventPublisherService {
  private readonly eventosEmitidos: EventoOmnicanal[] = [];
  private persistidorOutbox?: (evento: EventoOmnicanal) => Promise<void>;

  configurarPersistidor(fn: (evento: EventoOmnicanal) => Promise<void>): void {
    this.persistidorOutbox = fn;
  }

  async publicar<T extends EventoOmnicanal>(entrada: EventoSinIdNiFecha<T>): Promise<T> {
    const candidato = {
      ...entrada,
      eventId: entrada.eventId ?? randomUUID(),
      timestamp: entrada.timestamp ?? new Date().toISOString(),
    };
    const validado = validarEventoOmnicanal(candidato) as T;
    this.eventosEmitidos.push(validado);

    if (this.persistidorOutbox) {
      try {
        await this.persistidorOutbox(validado);
      } catch {
        // El evento permanece validado en memoria si la BD no está conectada en modo local/test
      }
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
