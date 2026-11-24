import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { validarEventoOmnicanalSeguro, type EventoOmnicanal } from '@salud-digna/shared';
import type { TicketRegistro } from '../../tickets/tickets.service';
import type {
  CitaTramiteRegistro,
  ContextoTramite,
  TramiteRegistro,
} from '../../tramites/tramites.service';
import { PrismaService } from '../prisma/prisma.service';

type ClientePrisma = NonNullable<PrismaService['client']>;

const MAX_EVENTOS_A_CARGAR = 20_000;

function comoJson(valor: unknown): Prisma.InputJsonValue {
  return valor as Prisma.InputJsonValue;
}

function aFecha(valor: string | null): Date | null {
  return valor ? new Date(valor) : null;
}

function aIso(valor: Date | null): string | null {
  return valor ? valor.toISOString() : null;
}

/** Describe un error de Prisma sin incluir valores de los registros (LFPDPPP: nada de datos en logs). */
function describirError(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return `${error.code}${error.meta?.target ? ` (${String(error.meta.target)})` : ''}`;
  }
  return error instanceof Error ? error.name : 'error desconocido';
}

function esErrorDeLlaveForanea(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003';
}

/**
 * Persistencia write-through en MySQL (fuente de verdad, ADR 0002 y 0003) para el motor de contexto.
 *
 * - Los servicios de dominio mantienen su estado en memoria para responder rápido y llaman aquí
 *   después de cada cambio; al arrancar, recargan su estado desde MySQL (#12, #13, #15, #16).
 * - Si `DATABASE_URL` no está configurada (pruebas unitarias, desarrollo sin BD) todo es no-op.
 * - Un fallo de BD no tumba la petición: se registra en el log (sin datos personales) y el estado
 *   en memoria sigue funcionando.
 */
@Injectable()
export class PersistenciaService {
  private readonly logger = new Logger('Persistencia');

  constructor(private readonly prisma: PrismaService) {}

  estaActiva(): boolean {
    return this.prisma.estaConfigurado();
  }

  private async intentar<T>(
    operacion: string,
    fn: (db: ClientePrisma) => Promise<T>,
  ): Promise<T | null> {
    const db = this.prisma.client;
    if (!db) return null;
    try {
      return await fn(db);
    } catch (error) {
      this.logger.warn(`No se pudo ${operacion}: ${describirError(error)}`);
      return null;
    }
  }

  // --------------------------------------------------------------------------
  // Trámites, pasos y citas (#12, #13)
  // --------------------------------------------------------------------------

  async guardarTramite(t: TramiteRegistro): Promise<boolean> {
    const ok = await this.intentar('guardar el trámite', async (db) => {
      const datos = {
        folio: t.folio,
        pacienteId: t.pacienteId,
        estudioId: t.estudioId,
        clinicaId: t.clinicaId,
        tipo: t.tipo,
        estado: t.estado,
        estadoAnterior: t.estadoAnterior,
        pasoActual: t.pasoActual,
        contexto: comoJson(t.contexto),
        canalOrigen: t.canalOrigen,
        ultimoCanal: t.ultimoCanal,
        region: t.region,
        esDemo: t.esDemo,
      };

      await db.$transaction(async (tx) => {
        await tx.tramite.upsert({
          where: { id: t.id },
          create: { id: t.id, creadoEn: new Date(t.creadoEn), ...datos },
          update: datos,
        });

        for (const paso of t.pasos) {
          const datosPaso = paso.datos === null ? Prisma.JsonNull : comoJson(paso.datos);
          await tx.pasoTramite.upsert({
            where: { tramiteId_orden: { tramiteId: t.id, orden: paso.orden } },
            create: {
              id: paso.id,
              tramiteId: t.id,
              orden: paso.orden,
              clavePaso: paso.clavePaso,
              estatus: paso.estatus,
              canal: paso.canal,
              datos: datosPaso,
              iniciadoEn: new Date(paso.iniciadoEn),
              completadoEn: aFecha(paso.completadoEn),
            },
            update: {
              clavePaso: paso.clavePaso,
              estatus: paso.estatus,
              canal: paso.canal,
              datos: datosPaso,
              completadoEn: aFecha(paso.completadoEn),
            },
          });
        }

        if (t.cita) {
          const cita = t.cita;
          const canceladaEn = cita.estatus === 'cancelada' ? new Date(t.actualizadoEn) : null;
          await tx.cita.upsert({
            where: { id: cita.id },
            create: {
              id: cita.id,
              tramiteId: t.id,
              clinicaId: cita.clinicaId,
              fechaHora: new Date(cita.fechaHora),
              estatus: cita.estatus,
              canalAgendamiento: cita.canalAgendamiento,
              codigoConfirmacion: cita.codigoConfirmacion,
              confirmadaEn: aFecha(cita.confirmadaEn),
              canceladaEn,
              esDemo: t.esDemo,
            },
            update: {
              clinicaId: cita.clinicaId,
              fechaHora: new Date(cita.fechaHora),
              estatus: cita.estatus,
              confirmadaEn: aFecha(cita.confirmadaEn),
              canceladaEn,
            },
          });
        }
      });
      return true;
    });
    return ok === true;
  }

  async cargarTramites(): Promise<TramiteRegistro[] | null> {
    return this.intentar('cargar los trámites', async (db) => {
      const filas = await db.tramite.findMany({
        include: {
          pasos: { orderBy: { orden: 'asc' } },
          citas: { orderBy: { creadoEn: 'desc' }, take: 1 },
        },
      });

      return filas.map((f): TramiteRegistro => {
        const ultimaCita = f.citas[0];
        const cita: CitaTramiteRegistro | null = ultimaCita
          ? {
              id: ultimaCita.id,
              clinicaId: ultimaCita.clinicaId,
              fechaHora: ultimaCita.fechaHora.toISOString(),
              estatus:
                ultimaCita.estatus === 'confirmada' || ultimaCita.estatus === 'cancelada'
                  ? ultimaCita.estatus
                  : 'agendada',
              canalAgendamiento: ultimaCita.canalAgendamiento,
              codigoConfirmacion: ultimaCita.codigoConfirmacion ?? '',
              confirmadaEn: aIso(ultimaCita.confirmadaEn),
            }
          : null;

        return {
          id: f.id,
          folio: f.folio,
          pacienteId: f.pacienteId,
          estudioId: f.estudioId,
          clinicaId: f.clinicaId,
          tipo: f.tipo,
          estado: f.estado,
          estadoAnterior: f.estadoAnterior,
          pasoActual: f.pasoActual,
          contexto: f.contexto as unknown as ContextoTramite,
          canalOrigen: f.canalOrigen,
          ultimoCanal: f.ultimoCanal,
          region: f.region,
          cita,
          pasos: f.pasos.map((p) => ({
            id: p.id,
            orden: p.orden,
            clavePaso: p.clavePaso,
            estatus: p.estatus,
            canal: p.canal,
            datos: (p.datos as Record<string, unknown> | null) ?? null,
            iniciadoEn: p.iniciadoEn.toISOString(),
            completadoEn: aIso(p.completadoEn),
          })),
          esDemo: f.esDemo,
          creadoEn: f.creadoEn.toISOString(),
          actualizadoEn: f.actualizadoEn.toISOString(),
        };
      });
    });
  }

  // --------------------------------------------------------------------------
  // Tickets (#16)
  // --------------------------------------------------------------------------

  async guardarTicket(t: TicketRegistro): Promise<boolean> {
    const ok = await this.intentar('guardar el ticket', async (db) => {
      const datos = {
        folio: t.folio,
        pacienteId: t.pacienteId,
        tramiteId: t.tramiteId,
        canalOrigen: t.canalOrigen,
        tipo: t.tipo,
        prioridad: t.prioridad,
        estatus: t.estatus,
        nivelEscalamiento: t.nivelEscalamiento,
        region: t.region,
        asignadoAId: t.asignadoAId,
        resumenIa: t.resumenIa,
        motivoEscalamiento: t.motivoEscalamiento,
        resolucion: t.resolucion,
        slaVenceEn: new Date(t.slaVenceEn),
        slaVencido: t.slaVencido,
        resueltoEn: aFecha(t.resueltoEn),
        esDemo: t.esDemo,
      };
      await db.ticket.upsert({
        where: { id: t.id },
        create: { id: t.id, creadoEn: new Date(t.creadoEn), ...datos },
        update: datos,
      });
      return true;
    });
    return ok === true;
  }

  async cargarTickets(): Promise<TicketRegistro[] | null> {
    return this.intentar('cargar los tickets', async (db) => {
      const filas = await db.ticket.findMany();
      return filas.map(
        (f): TicketRegistro => ({
          id: f.id,
          folio: f.folio,
          pacienteId: f.pacienteId,
          tramiteId: f.tramiteId,
          canalOrigen: f.canalOrigen,
          tipo: f.tipo,
          prioridad: f.prioridad,
          estatus: f.estatus,
          nivelEscalamiento: f.nivelEscalamiento,
          region: f.region,
          asignadoAId: f.asignadoAId,
          resumenIa: f.resumenIa,
          motivoEscalamiento: f.motivoEscalamiento,
          slaVenceEn: f.slaVenceEn.toISOString(),
          slaVencido: f.slaVencido,
          resolucion: f.resolucion,
          resueltoEn: aIso(f.resueltoEn),
          esDemo: f.esDemo,
          creadoEn: f.creadoEn.toISOString(),
          actualizadoEn: f.actualizadoEn.toISOString(),
        }),
      );
    });
  }

  // --------------------------------------------------------------------------
  // Eventos: outbox (#14, ADR 0003) y reconstrucción del timeline (#15)
  // --------------------------------------------------------------------------

  /**
   * Guarda el evento en la tabla `eventos` (outbox). Es idempotente por `eventId`.
   * Si el paciente o el trámite aún no existen en MySQL, conserva el evento sin las llaves
   * foráneas: el `payload` completo sigue teniendo los identificadores para el timeline.
   */
  async guardarEvento(evento: EventoOmnicanal): Promise<boolean> {
    const db = this.prisma.client;
    if (!db) return false;

    const base = {
      id: evento.eventId,
      tipo: evento.tipo,
      version: evento.version,
      canal: evento.canal,
      actorTipo: evento.actor.tipo,
      actorId: evento.actor.id,
      payload: comoJson(evento),
      creadoEn: new Date(evento.timestamp),
    };

    try {
      await db.evento.upsert({
        where: { id: evento.eventId },
        create: { ...base, pacienteId: evento.pacienteId, tramiteId: evento.tramiteId },
        update: {},
      });
      return true;
    } catch (error) {
      if (!esErrorDeLlaveForanea(error)) {
        this.logger.warn(`No se pudo guardar el evento ${evento.tipo}: ${describirError(error)}`);
        return false;
      }
    }

    const ok = await this.intentar(`guardar el evento ${evento.tipo} sin llaves foráneas`, (cli) =>
      cli.evento.upsert({
        where: { id: evento.eventId },
        create: { ...base, pacienteId: null, tramiteId: null },
        update: {},
      }),
    );
    return ok !== null;
  }

  async marcarEventoPublicado(eventId: string): Promise<void> {
    await this.intentar('marcar el evento como publicado', (db) =>
      db.evento.updateMany({
        where: { id: eventId },
        data: { publicadoEn: new Date(), intentosPublicacion: { increment: 1 } },
      }),
    );
  }

  async registrarIntentoFallido(eventId: string): Promise<void> {
    await this.intentar('registrar el intento de publicación', (db) =>
      db.evento.updateMany({
        where: { id: eventId },
        data: { intentosPublicacion: { increment: 1 } },
      }),
    );
  }

  async eventosPendientesDePublicar(limite = 100): Promise<EventoOmnicanal[]> {
    const filas = await this.intentar('leer eventos pendientes de publicar', (db) =>
      db.evento.findMany({
        where: { publicadoEn: null },
        orderBy: { creadoEn: 'asc' },
        take: limite,
      }),
    );
    return this.payloadsValidos(filas ?? []);
  }

  async cargarEventos(): Promise<EventoOmnicanal[] | null> {
    const filas = await this.intentar('cargar el historial de eventos', (db) =>
      db.evento.findMany({ orderBy: { creadoEn: 'asc' }, take: MAX_EVENTOS_A_CARGAR }),
    );
    return filas ? this.payloadsValidos(filas) : null;
  }

  private payloadsValidos(filas: Array<{ payload: Prisma.JsonValue }>): EventoOmnicanal[] {
    const eventos: EventoOmnicanal[] = [];
    for (const fila of filas) {
      const resultado = validarEventoOmnicanalSeguro(fila.payload);
      if (resultado.success) eventos.push(resultado.data);
    }
    return eventos;
  }
}
