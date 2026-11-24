import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

interface EntradaMemoria {
  valor: string;
  expiraEn: number | null;
}

/**
 * Almacén clave-valor con TTL respaldado por Redis en ejecución real
 * y respaldo determinista en memoria para pruebas unitarias o desarrollo sin Redis.
 */
@Injectable()
export class KeyValueStoreService implements OnModuleDestroy {
  private redis: Redis | null = null;
  private readonly memoria = new Map<string, EntradaMemoria>();

  constructor() {
    const usarRedis = process.env.NODE_ENV !== 'test' && Boolean(process.env.REDIS_URL);
    if (usarRedis && process.env.REDIS_URL) {
      this.redis = new Redis(process.env.REDIS_URL, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      });
      this.redis.on('error', () => {
        // Fallback silencioso a memoria si Redis no está disponible en desarrollo local
      });
    }
  }

  private limpiarSiExpiro(clave: string): EntradaMemoria | undefined {
    const entrada = this.memoria.get(clave);
    if (!entrada) return undefined;
    if (entrada.expiraEn !== null && Date.now() >= entrada.expiraEn) {
      this.memoria.delete(clave);
      return undefined;
    }
    return entrada;
  }

  async get(clave: string): Promise<string | null> {
    if (this.redis) {
      try {
        if (this.redis.status === 'wait') await this.redis.connect();
        return await this.redis.get(clave);
      } catch {
        // Fallback a memoria
      }
    }
    return this.limpiarSiExpiro(clave)?.valor ?? null;
  }

  async set(clave: string, valor: string, ttlSegundos?: number): Promise<void> {
    if (this.redis) {
      try {
        if (this.redis.status === 'wait') await this.redis.connect();
        if (ttlSegundos && ttlSegundos > 0) {
          await this.redis.set(clave, valor, 'EX', ttlSegundos);
        } else {
          await this.redis.set(clave, valor);
        }
        return;
      } catch {
        // Fallback a memoria
      }
    }
    const expiraEn = ttlSegundos && ttlSegundos > 0 ? Date.now() + ttlSegundos * 1000 : null;
    this.memoria.set(clave, { valor, expiraEn });
  }

  async del(clave: string): Promise<void> {
    if (this.redis) {
      try {
        if (this.redis.status === 'wait') await this.redis.connect();
        await this.redis.del(clave);
        return;
      } catch {
        // Fallback a memoria
      }
    }
    this.memoria.delete(clave);
  }

  async incr(clave: string, ttlSegundos: number): Promise<number> {
    if (this.redis) {
      try {
        if (this.redis.status === 'wait') await this.redis.connect();
        const nuevo = await this.redis.incr(clave);
        if (nuevo === 1 && ttlSegundos > 0) {
          await this.redis.expire(clave, ttlSegundos);
        }
        return nuevo;
      } catch {
        // Fallback a memoria
      }
    }
    const actual = this.limpiarSiExpiro(clave);
    const siguiente = actual ? Number(actual.valor) + 1 : 1;
    const expiraEn = actual?.expiraEn ?? Date.now() + ttlSegundos * 1000;
    this.memoria.set(clave, { valor: String(siguiente), expiraEn });
    return siguiente;
  }

  async ttl(clave: string): Promise<number> {
    if (this.redis) {
      try {
        if (this.redis.status === 'wait') await this.redis.connect();
        return await this.redis.ttl(clave);
      } catch {
        // Fallback a memoria
      }
    }
    const entrada = this.limpiarSiExpiro(clave);
    if (!entrada) return -2;
    if (entrada.expiraEn === null) return -1;
    return Math.max(0, Math.ceil((entrada.expiraEn - Date.now()) / 1000));
  }

  limpiarMemoriaParaPruebas(): void {
    this.memoria.clear();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      await this.redis.quit().catch(() => undefined);
    }
  }
}
