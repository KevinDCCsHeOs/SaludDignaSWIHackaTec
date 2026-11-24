import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  CanalAtencion,
  EstatusTicket,
  NivelEscalamiento,
  PrioridadTicket,
  TipoActor,
  TipoTicket,
} from '@salud-digna/shared';
import {
  CANALES_ATENCION,
  PRIORIDADES_TICKET,
  SLA_MINUTOS_POR_PRIORIDAD,
  TIPOS_TICKET,
} from '@salud-digna/shared';
import { z } from 'zod';
import { EventBusService } from '../eventos/event-bus.service';

export interface TicketRegistro {
  id: string;
  folio: string;
  pacienteId: string;
  tramiteId: string | null;
  canalOrigen: CanalAtencion;
  tipo: TipoTicket;
  prioridad: PrioridadTicket;
  estatus: EstatusTicket;
  nivelEscalamiento: NivelEscalamiento;
  region: string;
  asignadoAId: string | null;
  resumenIa: string | null;
  motivoEscalamiento: string | null;
  slaVenceEn: string;
  slaVencido: boolean;
  resolucion: string | null;
  resueltoEn: string | null;
  esDemo: boolean;
  creadoEn: string;
  actualizadoEn: string;
}

export const CrearTicketSchema = z.object({
  pacienteId: z.string().min(1).max(36),
  tramiteId: z.string().min(1).max(36).nullable().optional(),
  canalOrigen: z.enum(CANALES_ATENCION),
  tipo: z.enum(TIPOS_TICKET),
  prioridad: z.enum(PRIORIDADES_TICKET).optional(),
  region: z.string().min(1).max(60),
  resumenIa: z.string().max(1000).optional(),
  asignarAutomaticamente: z.boolean().default(true),
  esDemo: z.boolean().default(true),
});

export const EscalarTicketSchema = z.object({
  motivo: z.string().min(3).max(255),
  resumenIa: z.string().max(1000).optional(),
  asignadoAId: z.string().min(1).max(36).optional(),
});

export const ResolverTicketSchema = z.object({
  resolucion: z.string().min(3).max(255),
  cerrar: z.boolean().default(true),
});

interface AsesorRegional {
  id: string;
  rol: 'asesor' | 'asesor_pro';
  region: string;
}

const ASESORES_DISPONIBLES_DEMO: readonly AsesorRegional[] = [
  { id: 'usr_asesor_01', rol: 'asesor', region: 'Puebla' },
  { id: 'usr_asesor_02', rol: 'asesor', region: 'Puebla' },
  { id: 'usr_asesor_pro_01', rol: 'asesor_pro', region: 'Puebla' },
  { id: 'usr_asesor_cdmx_01', rol: 'asesor', region: 'CDMX' },
  { id: 'usr_asesor_pro_cdmx_01', rol: 'asesor_pro', region: 'CDMX' },
  { id: 'usr_asesor_mty_01', rol: 'asesor', region: 'Monterrey' },
  { id: 'usr_asesor_pro_mty_01', rol: 'asesor_pro', region: 'Monterrey' },
];

@Injectable()
export class TicketsService implements OnModuleInit, OnModuleDestroy {
  private readonly tickets = new Map<string, TicketRegistro>();
  private secuenciaFolio = 1;
  private intervaloSla: NodeJS.Timeout | null = null;

  constructor(private readonly eventBus: EventBusService) {}

  onModuleInit(): void {
    // Job cada minuto en ejecución normal (desactivado en test para control determinista)
    if (process.env.NODE_ENV !== 'test') {
      this.intervaloSla = setInterval(() => {
        void this.verificarSlasVencidos();
      }, 60_000);
      this.intervaloSla.unref();
    }
  }

  onModuleDestroy(): void {
    if (this.intervaloSla) {
      clearInterval(this.intervaloSla);
      this.intervaloSla = null;
    }
  }

  private generarFolio(): string {
    return `TK-2026-${String(this.secuenciaFolio++).padStart(6, '0')}`;
  }

  private calcularPrioridadPorDefecto(tipo: TipoTicket): PrioridadTicket {
    if (tipo === 'urgencia') return 'critica';
    if (tipo === 'queja' || tipo === 'error_servicio') return 'alta';
    if (tipo === 'acceso_cuenta' || tipo === 'informacion_incorrecta') return 'media';
    return 'baja';
  }

  private contarCargaActiva(asesorId: string): number {
    let carga = 0;
    for (const t of this.tickets.values()) {
      if (
        t.asignadoAId === asesorId &&
        (t.estatus === 'abierto' || t.estatus === 'en_atencion' || t.estatus === 'escalado')
      ) {
        carga += 1;
      }
    }
    return carga;
  }

  /**
   * Selecciona al asesor (o asesor_pro) con menos tickets activos en la región (#16).
   */
  seleccionarAsesorConMenorCarga(
    region: string,
    rol: 'asesor' | 'asesor_pro' = 'asesor',
  ): string | null {
    const candidatos = ASESORES_DISPONIBLES_DEMO.filter(
      (a) => a.rol === rol && a.region.toLowerCase() === region.toLowerCase(),
    );
    const lista =
      candidatos.length > 0 ? candidatos : ASESORES_DISPONIBLES_DEMO.filter((a) => a.rol === rol);

    if (lista.length === 0) return null;

    let elegido = lista[0];
    let menorCarga = this.contarCargaActiva(elegido.id);
    for (const cand of lista.slice(1)) {
      const carga = this.contarCargaActiva(cand.id);
      if (carga < menorCarga) {
        menorCarga = carga;
        elegido = cand;
      }
    }
    return elegido.id;
  }

  obtenerPorIdOFolio(idOFolio: string): TicketRegistro {
    const directo = this.tickets.get(idOFolio);
    if (directo) return directo;
    for (const t of this.tickets.values()) {
      if (t.folio === idOFolio) return t;
    }
    throw new NotFoundException(`Ticket ${idOFolio} no encontrado`);
  }

  listar(filtros?: {
    region?: string;
    estatus?: EstatusTicket;
    prioridad?: PrioridadTicket;
    pacienteId?: string;
  }): TicketRegistro[] {
    return [...this.tickets.values()]
      .filter((t) => {
        if (filtros?.region && t.region.toLowerCase() !== filtros.region.toLowerCase()) {
          return false;
        }
        if (filtros?.estatus && t.estatus !== filtros.estatus) return false;
        if (filtros?.prioridad && t.prioridad !== filtros.prioridad) return false;
        if (filtros?.pacienteId && t.pacienteId !== filtros.pacienteId) return false;
        return true;
      })
      .sort((a, b) => Date.parse(b.creadoEn) - Date.parse(a.creadoEn));
  }

  async crear(
    entrada: z.input<typeof CrearTicketSchema>,
    actor: { tipo: TipoActor; id: string },
  ): Promise<TicketRegistro> {
    const parsed = CrearTicketSchema.safeParse(entrada);
    if (!parsed.success) {
      throw new BadRequestException({
        mensaje: 'Datos inválidos para crear ticket',
        errores: parsed.error.flatten().fieldErrors,
      });
    }

    const data = parsed.data;
    const prioridad = data.prioridad ?? this.calcularPrioridadPorDefecto(data.tipo);
    const slaMinutos = SLA_MINUTOS_POR_PRIORIDAD[prioridad];
    const ahora = new Date();
    const slaVenceEn = new Date(ahora.getTime() + slaMinutos * 60_000).toISOString();

    const asignadoAId = data.asignarAutomaticamente
      ? this.seleccionarAsesorConMenorCarga(data.region, 'asesor')
      : null;

    const ticket: TicketRegistro = {
      id: `tkt_${randomUUID().slice(0, 10)}`,
      folio: this.generarFolio(),
      pacienteId: data.pacienteId,
      tramiteId: data.tramiteId ?? null,
      canalOrigen: data.canalOrigen,
      tipo: data.tipo,
      prioridad,
      estatus: asignadoAId ? 'en_atencion' : 'abierto',
      nivelEscalamiento: asignadoAId ? 'asesor' : 'ia',
      region: data.region,
      asignadoAId,
      resumenIa: data.resumenIa ?? null,
      motivoEscalamiento: null,
      slaVenceEn,
      slaVencido: false,
      resolucion: null,
      resueltoEn: null,
      esDemo: data.esDemo,
      creadoEn: ahora.toISOString(),
      actualizadoEn: ahora.toISOString(),
    };

    this.tickets.set(ticket.id, ticket);

    await this.eventBus.publish({
      tipo: 'ticket.creado',
      version: 1,
      pacienteId: ticket.pacienteId,
      tramiteId: ticket.tramiteId,
      canal: ticket.canalOrigen,
      actor,
      datos: {
        ticketId: ticket.id,
        folio: ticket.folio,
        tipo: ticket.tipo,
        prioridad: ticket.prioridad,
        region: ticket.region,
        slaVenceEn: ticket.slaVenceEn,
      },
    });

    return ticket;
  }

  asignar(idOFolio: string, asesorId?: string): TicketRegistro {
    const ticket = this.obtenerPorIdOFolio(idOFolio);
    const elegido =
      asesorId ??
      this.seleccionarAsesorConMenorCarga(
        ticket.region,
        ticket.nivelEscalamiento === 'asesor_pro' ? 'asesor_pro' : 'asesor',
      );
    if (!elegido) {
      throw new BadRequestException('No hay asesores disponibles para asignar');
    }
    ticket.asignadoAId = elegido;
    if (ticket.estatus === 'abierto') {
      ticket.estatus = 'en_atencion';
    }
    if (ticket.nivelEscalamiento === 'ia') {
      ticket.nivelEscalamiento = 'asesor';
    }
    ticket.actualizadoEn = new Date().toISOString();
    return ticket;
  }

  /**
   * Escalamiento jerárquico del Contact Center: `ia -> asesor -> asesor_pro` (#16).
   */
  async escalar(
    idOFolio: string,
    entrada: z.input<typeof EscalarTicketSchema>,
    actor: { tipo: TipoActor; id: string },
  ): Promise<TicketRegistro> {
    const parsed = EscalarTicketSchema.safeParse(entrada);
    if (!parsed.success) {
      throw new BadRequestException('Motivo de escalamiento requerido');
    }

    const ticket = this.obtenerPorIdOFolio(idOFolio);
    const nivelAnterior = ticket.nivelEscalamiento;
    const nivelNuevo: NivelEscalamiento = nivelAnterior === 'ia' ? 'asesor' : 'asesor_pro';

    const nuevoAsignado =
      parsed.data.asignadoAId ??
      this.seleccionarAsesorConMenorCarga(
        ticket.region,
        nivelNuevo === 'asesor_pro' ? 'asesor_pro' : 'asesor',
      );

    ticket.nivelEscalamiento = nivelNuevo;
    ticket.estatus = 'escalado';
    ticket.asignadoAId = nuevoAsignado;
    ticket.motivoEscalamiento = parsed.data.motivo;
    if (parsed.data.resumenIa) {
      ticket.resumenIa = parsed.data.resumenIa;
    }
    ticket.actualizadoEn = new Date().toISOString();

    await this.eventBus.publish({
      tipo: 'ticket.escalado',
      version: 1,
      pacienteId: ticket.pacienteId,
      tramiteId: ticket.tramiteId,
      canal: ticket.canalOrigen,
      actor,
      datos: {
        ticketId: ticket.id,
        folio: ticket.folio,
        nivelAnterior,
        nivelNuevo,
        motivo: parsed.data.motivo,
        asignadoAId: ticket.asignadoAId,
      },
    });

    return ticket;
  }

  async resolver(
    idOFolio: string,
    entrada: z.input<typeof ResolverTicketSchema>,
    actor: { tipo: TipoActor; id: string },
  ): Promise<TicketRegistro> {
    const parsed = ResolverTicketSchema.safeParse(entrada);
    if (!parsed.success) {
      throw new BadRequestException('Debes indicar una resolución para cerrar el ticket');
    }

    const ticket = this.obtenerPorIdOFolio(idOFolio);
    const ahora = new Date();
    const minutos = Math.max(
      0,
      Math.round((ahora.getTime() - Date.parse(ticket.creadoEn)) / 60_000),
    );

    ticket.resolucion = parsed.data.resolucion;
    ticket.resueltoEn = ahora.toISOString();
    ticket.estatus = parsed.data.cerrar ? 'cerrado' : 'resuelto';
    ticket.actualizadoEn = ahora.toISOString();

    await this.eventBus.publish({
      tipo: 'ticket.cerrado',
      version: 1,
      pacienteId: ticket.pacienteId,
      tramiteId: ticket.tramiteId,
      canal: ticket.canalOrigen,
      actor,
      datos: {
        ticketId: ticket.id,
        folio: ticket.folio,
        resolucion: parsed.data.resolucion,
        tiempoResolucionMinutos: minutos,
      },
    });

    return ticket;
  }

  /**
   * Job periódico que marca SLA vencidos y emite `ticket.sla_vencido` (#16).
   */
  async verificarSlasVencidos(ahoraMs = Date.now()): Promise<TicketRegistro[]> {
    const vencidos: TicketRegistro[] = [];
    for (const ticket of this.tickets.values()) {
      const activo =
        ticket.estatus === 'abierto' ||
        ticket.estatus === 'en_atencion' ||
        ticket.estatus === 'escalado';
      if (activo && !ticket.slaVencido && Date.parse(ticket.slaVenceEn) <= ahoraMs) {
        ticket.slaVencido = true;
        ticket.actualizadoEn = new Date(ahoraMs).toISOString();
        vencidos.push(ticket);

        await this.eventBus.publish({
          tipo: 'ticket.sla_vencido',
          version: 1,
          pacienteId: ticket.pacienteId,
          tramiteId: ticket.tramiteId,
          canal: ticket.canalOrigen,
          actor: { tipo: 'sistema', id: 'sla-monitor' },
          datos: {
            ticketId: ticket.id,
            folio: ticket.folio,
            prioridad: ticket.prioridad,
            region: ticket.region,
            slaVenceEn: ticket.slaVenceEn,
          },
        });
      }
    }
    return vencidos;
  }
}
