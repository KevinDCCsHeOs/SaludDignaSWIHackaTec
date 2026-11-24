import { Injectable, OnModuleInit } from '@nestjs/common';
import type { CanalAtencion, EventoOmnicanal, TipoActor } from '@salud-digna/shared';
import { PersistenciaService } from '../common/persistencia/persistencia.service';
import { EventBusService } from '../eventos/event-bus.service';

export interface EntradaTimeline {
  eventId: string;
  fecha: string;
  canal: CanalAtencion;
  icono: string;
  actor: string;
  actorTipo: TipoActor;
  accion: string;
  tipoEvento: EventoOmnicanal['tipo'] | 'interaccion.registrada';
  tramiteId: string | null;
  estado: string | null;
}

const ICONO_POR_CANAL: Record<CanalAtencion, string> = {
  web: 'globe',
  app: 'smartphone',
  whatsapp: 'message-circle',
  call_center: 'phone',
  email: 'mail',
};

const NOMBRE_ACTOR: Record<TipoActor, string> = {
  paciente: 'Paciente',
  asesor_ia: 'Asistente IA',
  asesor: 'Asesor',
  asesor_pro: 'Asesor Pro',
  medico: 'Médico',
  revisor_tecnico: 'Revisor técnico',
  admin: 'Administrador',
  sistema: 'Sistema',
};

/**
 * Traductor del catálogo de eventos (`dominio.accion`) a descripciones legibles en español (#15).
 */
export function traducirEventoATimeline(evento: EventoOmnicanal): EntradaTimeline {
  let accion: string;
  let estado: string | null = null;

  switch (evento.tipo) {
    case 'paciente.registrado':
      accion = 'Paciente registrado en la plataforma';
      estado = 'registro';
      break;
    case 'identidad.resuelta':
      accion = `Identidad resuelta (${evento.datos.estadoResolucion})`;
      break;
    case 'identidad.vinculada':
      accion = `Vinculó identidad del canal ${evento.datos.canalVinculado}`;
      break;
    case 'identidad.verificada':
      accion = `Identidad verificada en ${evento.datos.canalVerificado}`;
      break;
    case 'consentimiento.otorgado':
      accion = `Aceptó aviso de privacidad (${evento.datos.versionAviso})`;
      break;
    case 'cotizacion.iniciada':
      accion = `Inició cotización (${evento.datos.folio})`;
      estado = 'cotizacion';
      break;
    case 'estudio.seleccionado':
      accion = `Seleccionó estudio ${evento.datos.estudioNombre}`;
      estado = 'cotizacion';
      break;
    case 'clinica.seleccionada':
      accion = `Seleccionó clínica ${evento.datos.clinicaNombre ?? evento.datos.clinicaId}`;
      estado = 'seleccion_clinica';
      break;
    case 'tramite.pausado':
      accion = `Trámite pausado en ${evento.datos.pasoActual}`;
      estado = 'pausado';
      break;
    case 'tramite.retomado':
      accion = `Trámite retomado en ${evento.datos.canalActual} desde ${evento.datos.pasoActual}`;
      estado = evento.datos.estadoRestaurado;
      break;
    case 'tramite.avanzado':
      accion = `Trámite avanzó de ${evento.datos.estadoAnterior} a ${evento.datos.estadoNuevo}`;
      estado = evento.datos.estadoNuevo;
      break;
    case 'tramite.cancelado':
      accion = evento.datos.citaCancelada
        ? `Trámite ${evento.datos.folio} cancelado (cita cancelada)`
        : `Trámite ${evento.datos.folio} cancelado`;
      estado = 'cancelado';
      break;
    case 'canal.cambiado':
      accion = `Cambió de canal: ${evento.datos.canalAnterior} → ${evento.datos.canalNuevo}`;
      estado = evento.datos.pasoActual ?? null;
      break;
    case 'cita.agendada':
      accion = `Agendó cita (${evento.datos.fechaHora})`;
      estado = 'cita_agendada';
      break;
    case 'cita.confirmada':
      accion = `Cita confirmada por ${evento.datos.confirmadaPorCanal}`;
      estado = 'cita_confirmada';
      break;
    case 'ticket.creado':
      accion = `Abrió ticket ${evento.datos.folio} (${evento.datos.tipo}, prioridad ${evento.datos.prioridad})`;
      break;
    case 'ticket.escalado':
      accion = `Ticket ${evento.datos.folio} escalado: ${evento.datos.nivelAnterior} → ${evento.datos.nivelNuevo}`;
      break;
    case 'ticket.asignado':
      accion = `Ticket ${evento.datos.folio} asignado a ${evento.datos.asignadoAId}`;
      break;
    case 'ticket.sla_vencido':
      accion = `Alerta SLA vencido en ticket ${evento.datos.folio}`;
      break;
    case 'ticket.cerrado':
      accion = `Ticket ${evento.datos.folio} cerrado: ${evento.datos.resolucion}`;
      break;
    case 'resultado.liberado':
      accion = `Resultado liberado y notificado por ${evento.datos.canalNotificacion}`;
      estado = 'resultados_liberados';
      break;
  }

  return {
    eventId: evento.eventId,
    fecha: evento.timestamp,
    canal: evento.canal,
    icono: ICONO_POR_CANAL[evento.canal],
    actor: NOMBRE_ACTOR[evento.actor.tipo],
    actorTipo: evento.actor.tipo,
    accion,
    tipoEvento: evento.tipo,
    tramiteId: evento.tramiteId,
    estado,
  };
}

@Injectable()
export class TimelineService implements OnModuleInit {
  private readonly porPaciente = new Map<string, EntradaTimeline[]>();
  private readonly idsRegistrados = new Set<string>();

  constructor(
    private readonly eventBus: EventBusService,
    private readonly persistencia: PersistenciaService,
  ) {
    // Consumidor idempotente en el bus de eventos (#14, #15)
    this.eventBus.suscribir('timeline', (evento) => {
      this.registrar(evento);
    });
  }

  /** Reconstruye la línea de tiempo desde la tabla `eventos` al arrancar (sobrevive reinicios, #15). */
  async onModuleInit(): Promise<void> {
    const historial = await this.persistencia.cargarEventos();
    for (const evento of historial ?? []) {
      this.registrar(evento);
    }
  }

  private registrar(evento: EventoOmnicanal): void {
    if (!evento.pacienteId || this.idsRegistrados.has(evento.eventId)) return;
    this.idsRegistrados.add(evento.eventId);
    const lista = this.porPaciente.get(evento.pacienteId) ?? [];
    lista.push(traducirEventoATimeline(evento));
    this.porPaciente.set(evento.pacienteId, lista);
  }

  /**
   * Incorpora una interacción directa de canal (llamada de Call Center o correo simulado, #23)
   * en la línea de tiempo unificada con su ícono correspondiente.
   */
  registrarInteraccion(entrada: {
    id: string;
    pacienteId: string;
    tramiteId?: string | null;
    canal: CanalAtencion;
    actorTipo: TipoActor;
    resumen: string;
    fecha?: string;
  }): EntradaTimeline | null {
    if (!entrada.pacienteId || this.idsRegistrados.has(entrada.id)) return null;
    this.idsRegistrados.add(entrada.id);
    const item: EntradaTimeline = {
      eventId: entrada.id,
      fecha: entrada.fecha ?? new Date().toISOString(),
      canal: entrada.canal,
      icono: ICONO_POR_CANAL[entrada.canal],
      actor: NOMBRE_ACTOR[entrada.actorTipo],
      actorTipo: entrada.actorTipo,
      accion: entrada.resumen,
      tipoEvento: 'interaccion.registrada',
      tramiteId: entrada.tramiteId ?? null,
      estado: null,
    };
    const lista = this.porPaciente.get(entrada.pacienteId) ?? [];
    lista.push(item);
    this.porPaciente.set(entrada.pacienteId, lista);
    return item;
  }

  consultar(
    pacienteId: string,
    opciones?: {
      limit?: number;
      cursor?: string;
      canal?: CanalAtencion;
      tramiteId?: string;
    },
  ): {
    pacienteId: string;
    total: number;
    nextCursor: string | null;
    items: EntradaTimeline[];
  } {
    const limiteSolicitado = Number(opciones?.limit ?? 50);
    const limit = Number.isFinite(limiteSolicitado)
      ? Math.min(Math.max(Math.trunc(limiteSolicitado), 1), 200)
      : 50;
    const todos = [...(this.porPaciente.get(pacienteId) ?? [])].sort(
      (a, b) => Date.parse(a.fecha) - Date.parse(b.fecha),
    );

    const filtrados = todos.filter((item) => {
      if (opciones?.canal && item.canal !== opciones.canal) return false;
      if (opciones?.tramiteId && item.tramiteId !== opciones.tramiteId) return false;
      return true;
    });

    let inicio = 0;
    if (opciones?.cursor) {
      const idx = filtrados.findIndex((x) => x.eventId === opciones.cursor);
      if (idx >= 0) inicio = idx + 1;
    }

    const pagina = filtrados.slice(inicio, inicio + limit);
    const hayMas = inicio + limit < filtrados.length;
    const nextCursor = hayMas ? (pagina.at(-1)?.eventId ?? null) : null;

    return {
      pacienteId,
      total: filtrados.length,
      nextCursor,
      items: pagina,
    };
  }
}
