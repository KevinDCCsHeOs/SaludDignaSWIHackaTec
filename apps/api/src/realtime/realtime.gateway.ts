import { Injectable, OnModuleDestroy } from '@nestjs/common';
import type { Server as HttpServer } from 'node:http';
import type { EventoOmnicanal } from '@salud-digna/shared';
import jwt from 'jsonwebtoken';
import { Server, Socket } from 'socket.io';
import { obtenerSecretoJwtAcceso, PayloadJwtAcceso } from '../auth/guards';
import { EventBusService } from '../eventos/event-bus.service';

interface SocketAutenticado extends Socket {
  data: {
    usuario?: PayloadJwtAcceso;
  };
}

/**
 * Gateway de tiempo real con Socket.IO (#14, ADR 0004):
 * - Autentica cada conexión usando el mismo JWT del API.
 * - Asigna salas automáticas `paciente:{id}`, `rol:asesor` y `rol:admin`.
 * - Consume el `EventBusService` bajo el grupo `realtime` (idempotente por `eventId`).
 */
@Injectable()
export class RealtimeGatewayService implements OnModuleDestroy {
  private io: Server | null = null;
  private eventosTransmitidos = 0;

  constructor(private readonly eventBus: EventBusService) {
    this.eventBus.suscribir('realtime', (evento) => {
      this.difundirEvento(evento);
    });
  }

  adjuntarAServidorHttp(httpServer: HttpServer): Server {
    if (this.io) return this.io;

    this.io = new Server(httpServer, {
      cors: {
        origin: process.env.WEB_BASE_URL ?? true,
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });

    // Autenticación del socket con el mismo JWT del API (#14)
    this.io.use((socket: SocketAutenticado, next) => {
      const tokenAuth = socket.handshake.auth?.token as string | undefined;
      const headerAuth = socket.handshake.headers.authorization;
      const tokenHeader = headerAuth?.startsWith('Bearer ')
        ? headerAuth.slice('Bearer '.length).trim()
        : undefined;
      const token = tokenAuth ?? tokenHeader;

      if (!token) {
        return next(new Error('Token JWT requerido para conexión en tiempo real'));
      }

      try {
        const payload = jwt.verify(token, obtenerSecretoJwtAcceso()) as PayloadJwtAcceso;
        if (payload.tipo !== 'access') {
          return next(new Error('Tipo de token inválido'));
        }
        socket.data.usuario = payload;
        return next();
      } catch {
        return next(new Error('Token JWT inválido o expirado'));
      }
    });

    this.io.on('connection', (socket: SocketAutenticado) => {
      const usuario = socket.data.usuario;
      if (!usuario) {
        socket.disconnect(true);
        return;
      }

      // Salas automáticas por rol y por paciente (#14)
      if (usuario.rol === 'paciente' && usuario.pacienteId) {
        void socket.join(`paciente:${usuario.pacienteId}`);
      }
      if (usuario.rol === 'asesor' || usuario.rol === 'asesor_pro') {
        void socket.join('rol:asesor');
      }
      if (usuario.rol === 'admin') {
        void socket.join('rol:admin');
        void socket.join('rol:asesor');
      }
      if (usuario.rol === 'medico' || usuario.rol === 'revisor_tecnico') {
        void socket.join(`rol:${usuario.rol}`);
      }

      // Permite a asesores/admin suscribirse al canal de un paciente específico
      socket.on('suscribir:paciente', (pacienteId: string) => {
        if (
          typeof pacienteId === 'string' &&
          pacienteId.length > 0 &&
          (usuario.rol === 'asesor' ||
            usuario.rol === 'asesor_pro' ||
            usuario.rol === 'admin' ||
            usuario.pacienteId === pacienteId)
        ) {
          void socket.join(`paciente:${pacienteId}`);
        }
      });
    });

    return this.io;
  }

  difundirEvento(evento: EventoOmnicanal): void {
    this.eventosTransmitidos += 1;
    if (!this.io) return;

    const salas = new Set<string>(['rol:asesor', 'rol:admin']);
    if (evento.pacienteId) {
      salas.add(`paciente:${evento.pacienteId}`);
    }

    let emisor = this.io.to([...salas][0]);
    for (const sala of [...salas].slice(1)) {
      emisor = emisor.to(sala);
    }
    emisor.emit('evento:omnicanal', evento);
  }

  obtenerTotalTransmitidos(): number {
    return this.eventosTransmitidos;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.io) {
      await new Promise<void>((resolve) => {
        this.io?.close(() => resolve());
      });
      this.io = null;
    }
  }
}
