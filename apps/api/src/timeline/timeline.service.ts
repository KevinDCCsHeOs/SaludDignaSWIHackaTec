import { Injectable } from '@nestjs/common';
import type { CanalAtencion, EventoOmnicanal, TipoActor } from '@salud-digna/shared';
import { EventBusService } from '../eventos/event-bus.service';

export interface EntradaTimeline {
  eventId: string;
  fecha: string;
  canal: CanalAtencion;
  icono: string;
  actor: string;
  actorTipo: TipoActor;
  accion: string;
  tipoEvento: EventoOmnicanal['tipo'];
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
export class TimelineService {
  private readonly porPaciente = new Map<string, EntradaTimeline[]>();

  constructor(private readonly eventBus: EventBusService) {
    // Consumidor idempotente en el bus de eventos (#14, #15)
    this.eventBus.suscribir('timeline', (evento) => {
      if (!evento.pacienteId) return;
      const lista = this.porPaciente.get(evento.pacienteId) ?? [];
      if (lista.some((e) => e.eventId === evento.eventId)) return;
      lista.push(traducirEventoATimeline(evento));
      this.porPaciente.set(evento.pacienteId, lista);
    });
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
    const limit = Math.min(Math.max(Number(opciones?.limit ?? 50), 1), 200);
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
