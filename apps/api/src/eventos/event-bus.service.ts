import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { ConsumidorEvento, EventoOmnicanal } from '@salud-digna/shared';
import Redis from 'ioredis';
import {
  EventPublisherService,
  EventoSinIdNiFecha,
} from '../common/eventos/event-publisher.service';
import { PersistenciaService } from '../common/persistencia/persistencia.service';

export type HandlerConsumidorEvento = (evento: EventoOmnicanal) => Promise<void> | void;

export interface RegistroOutboxEvento {
  evento: EventoOmnicanal;
  publicadoEn: string | null;
  intentosPublicacion: number;
  streamId: string | null;
}

const STREAM_EVENTOS = 'eventos';
const MAX_REINTENTOS_CONSUMIDOR = 3;
const MAX_REGISTROS_OUTBOX_EN_MEMORIA = 2000;
const MAX_IDS_PROCESADOS_POR_GRUPO = 10_000;
const INTERVALO_REINTENTOS_MS = 30_000;

/**
 * Bus de eventos omnicanal (#14, ADR 0003):
 * - Persiste en la tabla `eventos` de MySQL (outbox) antes de distribuir.
 * - Publica en Redis Streams (`XADD eventos * ...`) cuando Redis está activo.
 * - Gestiona grupos de consumo (`timeline`, `tickets`, `metricas`, `notificaciones`, `realtime`)
 *   con idempotencia estricta por `(grupo, eventId)` y reintentos ante fallos.
 * - Cada 30 s reintenta consumidores fallidos y republica en Redis los eventos pendientes
 *   (`publicadoEn = NULL` en MySQL).
 */
@Injectable()
export class EventBusService implements OnModuleInit, OnModuleDestroy {
  private readonly outbox = new Map<string, RegistroOutboxEvento>();
  private readonly suscriptores = new Map<ConsumidorEvento, HandlerConsumidorEvento[]>();
  private readonly procesadosPorGrupo = new Map<ConsumidorEvento, Set<string>>();
  private readonly fallosPendientes: Array<{ grupo: ConsumidorEvento; evento: EventoOmnicanal }> =
    [];
  private redis: Redis | null = null;
  private intervaloReintentos: NodeJS.Timeout | null = null;

  constructor(
    private readonly publisher: EventPublisherService,
    private readonly persistencia: PersistenciaService,
  ) {
    if (process.env.NODE_ENV !== 'test' && process.env.REDIS_URL) {
      this.redis = new Redis(process.env.REDIS_URL, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      });
      this.redis.on('error', () => undefined);
    }

    // Outbox en MySQL: el evento queda guardado antes de distribuirse (ADR 0003)
    this.publisher.configurarPersistidor(async (evento) => {
      await this.persistencia.guardarEvento(evento);
    });

    // Conectar todos los módulos que usan `EventPublisherService` (#6–#11) al bus
    this.publisher.configurarDespachadorBus(async (evento) => {
      await this.distribuirEventoValidado(evento);
    });
  }

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    this.intervaloReintentos = setInterval(() => {
      void this.reprocesarFallosPendientes();
      void this.republicarPendientesEnRedis();
    }, INTERVALO_REINTENTOS_MS);
    this.intervaloReintentos.unref();
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
      this.recortarOutboxEnMemoria();
    }

    if (registro.publicadoEn === null) {
      await this.publicarEnStream(registro);
    }

    for (const [grupo, handlers] of this.suscriptores.entries()) {
      await this.entregarAGrupo(grupo, handlers, evento);
    }
  }

  /**
   * `XADD eventos * ...`. Solo marca el evento como publicado si Redis lo aceptó; si Redis
   * no está configurado (desarrollo o pruebas) se considera publicado en memoria.
   */
  private async publicarEnStream(registro: RegistroOutboxEvento): Promise<boolean> {
    const evento = registro.evento;
    registro.intentosPublicacion += 1;

    if (!this.redis) {
      registro.publicadoEn = new Date().toISOString();
      await this.persistencia.marcarEventoPublicado(evento.eventId);
      return true;
    }

    try {
      if (this.redis.status === 'wait') await this.redis.connect();
      registro.streamId = await this.redis.xadd(
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
      registro.publicadoEn = new Date().toISOString();
      await this.persistencia.marcarEventoPublicado(evento.eventId);
      return true;
    } catch {
      // Queda pendiente (publicadoEn = NULL) para el job de republicación
      await this.persistencia.registrarIntentoFallido(evento.eventId);
      return false;
    }
  }

  /**
   * Republica en Redis Streams los eventos que quedaron pendientes en MySQL (outbox, ADR 0003).
   * Los consumidores internos ya los procesaron; aquí solo se completa la publicación externa.
   */
  async republicarPendientesEnRedis(): Promise<number> {
    if (!this.redis) return 0;
    const pendientes = await this.persistencia.eventosPendientesDePublicar();
    let publicados = 0;
    for (const evento of pendientes) {
      const registro: RegistroOutboxEvento = this.outbox.get(evento.eventId) ?? {
        evento,
        publicadoEn: null,
        intentosPublicacion: 0,
        streamId: null,
      };
      if (await this.publicarEnStream(registro)) publicados += 1;
    }
    return publicados;
  }

  private recortarOutboxEnMemoria(): void {
    const sobrantes = this.outbox.size - MAX_REGISTROS_OUTBOX_EN_MEMORIA;
    if (sobrantes <= 0) return;
    let eliminados = 0;
    for (const [eventId, registro] of this.outbox) {
      if (eliminados >= sobrantes) break;
      if (registro.publicadoEn !== null) {
        this.outbox.delete(eventId);
        eliminados += 1;
      }
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
        if (procesados.size > MAX_IDS_PROCESADOS_POR_GRUPO) {
          const masAntiguo = procesados.values().next().value;
          if (masAntiguo !== undefined) procesados.delete(masAntiguo);
        }
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
    if (this.intervaloReintentos) {
      clearInterval(this.intervaloReintentos);
      this.intervaloReintentos = null;
    }
    if (this.redis) {
      await this.redis.quit().catch(() => undefined);
    }
  }
}
