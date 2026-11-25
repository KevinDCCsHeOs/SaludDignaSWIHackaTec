import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { EventoOmnicanal, validarEventoOmnicanal } from '@salud-digna/shared';

const MAX_EVENTOS_EN_MEMORIA = 1000;
const MAX_LLAVES_IDEMPOTENCIA = 5000;

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
  /** Llaves de idempotencia ya publicadas (traspaso v2): un reintento no duplica el evento. */
  private readonly porLlave = new Map<string, EventoOmnicanal>();
  private persistidorOutbox?: (evento: EventoOmnicanal) => Promise<void>;
  private despachadorBus?: (evento: EventoOmnicanal) => Promise<void>;

  configurarPersistidor(fn: (evento: EventoOmnicanal) => Promise<void>): void {
    this.persistidorOutbox = fn;
  }

  configurarDespachadorBus(fn: (evento: EventoOmnicanal) => Promise<void>): void {
    this.despachadorBus = fn;
  }

  async publicar<T extends EventoOmnicanal>(entrada: EventoSinIdNiFecha<T>): Promise<T> {
    const llave = entrada.llaveIdempotencia;
    if (llave) {
      const previo = this.porLlave.get(llave);
      if (previo) return previo as T;
    }

    const timestamp = entrada.timestamp ?? new Date().toISOString();
    const candidato = {
      ...entrada,
      eventId: entrada.eventId ?? randomUUID(),
      timestamp,
      // Hora del hecho: si el emisor no la indica, coincide con la hora de registro
      ocurridoEn: entrada.ocurridoEn ?? timestamp,
    };
    const validado = validarEventoOmnicanal(candidato) as T;
    if (llave) {
      this.porLlave.set(llave, validado);
      if (this.porLlave.size > MAX_LLAVES_IDEMPOTENCIA) {
        const masAntigua = this.porLlave.keys().next().value;
        if (masAntigua !== undefined) this.porLlave.delete(masAntigua);
      }
    }
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
    this.porLlave.clear();
  }
}
