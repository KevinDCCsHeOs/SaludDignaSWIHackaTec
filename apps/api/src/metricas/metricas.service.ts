import { Injectable, OnModuleInit } from '@nestjs/common';
import type { CanalAtencion, EventoOmnicanal, PrioridadTicket } from '@salud-digna/shared';
import { CANALES_ATENCION, PRIORIDADES_TICKET } from '@salud-digna/shared';
import type { UsuarioAutenticado } from '../auth/guards';
import { PersistenciaService } from '../common/persistencia/persistencia.service';
import { EventBusService } from '../eventos/event-bus.service';
import { IdentityResolverService } from '../identidad/identidad.service';
import { ResultadosService } from '../resultados/resultados.service';
import { ServicioService } from '../servicio/servicio.service';
import { TicketsService } from '../tickets/tickets.service';
import { TimelineService } from '../timeline/timeline.service';
import { TramitesService } from '../tramites/tramites.service';

export interface PasoCanalJourney {
  canal: CanalAtencion;
  hora: string;
  accion: string;
  cambioDeCanal: boolean;
}

export interface ResumenPacienteJourney {
  pacienteId: string;
  nombre: string;
  region: string | null;
  folio: string | null;
  tramiteId: string | null;
  estadoActual: string;
  pasoActual: string;
  ultimoCanal: CanalAtencion;
  canalesRecorridos: PasoCanalJourney[];
  contexto: {
    estudio: string | null;
    clinica: string | null;
    fechaTentativa: string | null;
    pendientes: string[];
  };
  actualizadoEn: string;
}

const REGIONES_OFICIALES = ['Puebla', 'CDMX', 'Monterrey'] as const;

/**
 * Motor de métricas reales (KPIs #28), Patient Journey en tiempo real (#27)
 * y estadísticas personalizadas por rol (#29).
 * Todos los indicadores se calculan a partir de eventos, trámites, tickets y resultados reales.
 */
@Injectable()
export class MetricasService implements OnModuleInit {
  private readonly eventos: EventoOmnicanal[] = [];
  private readonly idsEventos = new Set<string>();

  constructor(
    private readonly eventBus: EventBusService,
    private readonly persistencia: PersistenciaService,
    private readonly tramites: TramitesService,
    private readonly tickets: TicketsService,
    private readonly resultados: ResultadosService,
    private readonly servicio: ServicioService,
    private readonly identidad: IdentityResolverService,
    private readonly timeline: TimelineService,
  ) {
    this.eventBus.suscribir('metricas', (evento) => {
      this.registrarEvento(evento);
    });
  }

  async onModuleInit(): Promise<void> {
    const historial = await this.persistencia.cargarEventos();
    for (const ev of historial ?? []) {
      this.registrarEvento(ev);
    }
  }

  private registrarEvento(evento: EventoOmnicanal): void {
    if (this.idsEventos.has(evento.eventId)) return;
    this.idsEventos.add(evento.eventId);
    this.eventos.push(evento);
  }

  private filtrarEventos(filtros?: { desde?: string; hasta?: string; region?: string }) {
    const desdeMs = filtros?.desde ? Date.parse(filtros.desde) : Number.NaN;
    const hastaMs = filtros?.hasta ? Date.parse(filtros.hasta) : Number.NaN;
    const regionNorm = filtros?.region?.trim().toLowerCase();

    return this.eventos.filter((ev) => {
      const ts = Date.parse(ev.timestamp);
      if (!Number.isNaN(desdeMs) && ts < desdeMs) return false;
      if (!Number.isNaN(hastaMs) && ts > hastaMs) return false;
      if (regionNorm) {
        const datos = ev.datos as Record<string, unknown>;
        if (typeof datos.region === 'string' && datos.region.toLowerCase() !== regionNorm) {
          return false;
        }
      }
      return true;
    });
  }

  /**
   * Calcula los KPIs operativos reales desde los eventos, trámites y tickets del sistema (#28).
   */
  calcularMetricasAdmin(filtros?: { desde?: string; hasta?: string; region?: string }) {
    const eventosFiltrados = this.filtrarEventos(filtros);
    const regionFiltro = filtros?.region?.trim() || undefined;
    const desdeMs = filtros?.desde ? Date.parse(filtros.desde) : Number.NaN;
    const hastaMs = filtros?.hasta ? Date.parse(filtros.hasta) : Number.NaN;

    const tickets = this.tickets
      .listar(regionFiltro ? { region: regionFiltro } : undefined)
      .filter((t) => {
        const ts = Date.parse(t.creadoEn);
        if (!Number.isNaN(desdeMs) && ts < desdeMs) return false;
        if (!Number.isNaN(hastaMs) && ts > hastaMs) return false;
        return true;
      });

    const tramitesActivos = this.tramites.listarTodosActivos().filter((t) => {
      if (regionFiltro && t.region?.toLowerCase() !== regionFiltro.toLowerCase()) return false;
      const ts = Date.parse(t.creadoEn);
      if (!Number.isNaN(desdeMs) && ts < desdeMs) return false;
      if (!Number.isNaN(hastaMs) && ts > hastaMs) return false;
      return true;
    });

    // % de trámites retomados o continuados en otro canal (indicador estrella del reto #28)
    const tramitesConCambioCanal = new Set<string>();
    const tramitesTotales = new Set<string>(tramitesActivos.map((t) => t.id));
    let cambiosDeCanalTotal = 0;

    for (const ev of eventosFiltrados) {
      if (ev.tramiteId) tramitesTotales.add(ev.tramiteId);
      if (ev.tipo === 'canal.cambiado') {
        cambiosDeCanalTotal += 1;
        if (ev.tramiteId) tramitesConCambioCanal.add(ev.tramiteId);
      }
      if (ev.tipo === 'tramite.retomado' && ev.tramiteId) {
        const datos = ev.datos as { canalAnterior?: string; canalActual?: string };
        if (datos.canalAnterior && datos.canalActual && datos.canalAnterior !== datos.canalActual) {
          tramitesConCambioCanal.add(ev.tramiteId);
        }
      }
    }
    for (const t of tramitesActivos) {
      if (t.canalOrigen !== t.ultimoCanal) {
        tramitesConCambioCanal.add(t.id);
      }
    }

    const totalTramitesConsiderados = tramitesTotales.size;
    const tramitesRetomadosOtroCanalPct =
      totalTramitesConsiderados > 0
        ? Number(((tramitesConCambioCanal.size / totalTramitesConsiderados) * 100).toFixed(1))
        : 0;

    // Tiempos de atención y primera respuesta calculados desde tickets reales
    const ticketsCerrados = tickets.filter((t) => t.resueltoEn !== null);
    const sumaMinutosResolucion = ticketsCerrados.reduce((acc, t) => {
      const diff = Math.max(0, (Date.parse(t.resueltoEn!) - Date.parse(t.creadoEn)) / 60_000);
      return acc + diff;
    }, 0);
    const tiempoPromedioAtencionMinutos =
      ticketsCerrados.length > 0
        ? Number((sumaMinutosResolucion / ticketsCerrados.length).toFixed(1))
        : 0;

    const tiemposPrimeraResp: number[] = [];
    const primerContactoPorTicket = new Map<string, number>();
    for (const ev of eventosFiltrados) {
      if (ev.tipo === 'ticket.creado') {
        primerContactoPorTicket.set(ev.datos.ticketId, Date.parse(ev.timestamp));
      } else if (ev.tipo === 'ticket.asignado') {
        const inicio = primerContactoPorTicket.get(ev.datos.ticketId);
        if (inicio !== undefined) {
          tiemposPrimeraResp.push(Math.max(0, (Date.parse(ev.timestamp) - inicio) / 60_000));
        }
      }
    }
    const tiempoPromedioPrimeraRespuestaMinutos =
      tiemposPrimeraResp.length > 0
        ? Number(
            (tiemposPrimeraResp.reduce((a, b) => a + b, 0) / tiemposPrimeraResp.length).toFixed(1),
          )
        : 0;

    // Resolución en primer contacto (% de tickets resueltos sin escalar a asesor_pro)
    const resueltosPrimerContacto = ticketsCerrados.filter(
      (t) => t.nivelEscalamiento !== 'asesor_pro' && !t.motivoEscalamiento,
    ).length;
    const resolucionPrimerContactoPct =
      ticketsCerrados.length > 0
        ? Number(((resueltosPrimerContacto / ticketsCerrados.length) * 100).toFixed(1))
        : 0;

    // Tickets por región
    const regiones = regionFiltro ? [regionFiltro] : [...REGIONES_OFICIALES];
    const ticketsPorRegion = regiones.map((reg) => {
      const deRegion = tickets.filter((t) => t.region.toLowerCase() === reg.toLowerCase());
      return {
        region: reg,
        abiertos: deRegion.filter((t) => t.estatus === 'abierto').length,
        enAtencion: deRegion.filter((t) => t.estatus === 'en_atencion').length,
        escalados: deRegion.filter((t) => t.estatus === 'escalado').length,
        cerrados: deRegion.filter((t) => t.estatus === 'resuelto' || t.estatus === 'cerrado')
          .length,
        total: deRegion.length,
      };
    });

    // Tickets por prioridad
    const ticketsPorPrioridad = PRIORIDADES_TICKET.map((prioridad: PrioridadTicket) => ({
      prioridad,
      total: tickets.filter((t) => t.prioridad === prioridad).length,
    }));

    // Distribución de interacciones/eventos por canal
    const conteoCanal = new Map<CanalAtencion, number>();
    for (const c of CANALES_ATENCION) conteoCanal.set(c, 0);
    for (const ev of eventosFiltrados) {
      conteoCanal.set(ev.canal, (conteoCanal.get(ev.canal) ?? 0) + 1);
    }
    const interaccionesPorCanal = CANALES_ATENCION.map((canal) => ({
      canal,
      total: conteoCanal.get(canal) ?? 0,
    }));

    const estatusServicio = this.servicio.obtenerEstatusGeneral(regionFiltro);

    return {
      generadoEn: new Date().toISOString(),
      filtros: {
        desde: filtros?.desde ?? null,
        hasta: filtros?.hasta ?? null,
        region: regionFiltro ?? 'todas',
      },
      kpis: {
        tramitesTotales: totalTramitesConsiderados,
        tramitesRetomadosOtroCanal: tramitesConCambioCanal.size,
        tramitesRetomadosOtroCanalPct,
        cambiosDeCanalTotal,
        tiempoPromedioAtencionMinutos,
        tiempoPromedioPrimeraRespuestaMinutos,
        resolucionPrimerContactoPct,
        ticketsAbiertos: tickets.filter(
          (t) => t.estatus === 'abierto' || t.estatus === 'en_atencion' || t.estatus === 'escalado',
        ).length,
        ticketsTotales: tickets.length,
        eventosRegistrados: eventosFiltrados.length,
      },
      ticketsPorRegion,
      ticketsPorPrioridad,
      interaccionesPorCanal,
      estatusClinicas: estatusServicio.resumen,
      incidenciasClinicas: estatusServicio.incidencias,
    };
  }

  exportarMetricasCsv(filtros?: { desde?: string; hasta?: string; region?: string }): string {
    const data = this.calcularMetricasAdmin(filtros);
    const filas: string[] = [
      'seccion,indicador,valor',
      `kpi,tramites_totales,${data.kpis.tramitesTotales}`,
      `kpi,tramites_retomados_otro_canal_pct,${data.kpis.tramitesRetomadosOtroCanalPct}`,
      `kpi,cambios_de_canal_total,${data.kpis.cambiosDeCanalTotal}`,
      `kpi,tiempo_promedio_atencion_min,${data.kpis.tiempoPromedioAtencionMinutos}`,
      `kpi,tiempo_promedio_primera_respuesta_min,${data.kpis.tiempoPromedioPrimeraRespuestaMinutos}`,
      `kpi,resolucion_primer_contacto_pct,${data.kpis.resolucionPrimerContactoPct}`,
      `kpi,tickets_abiertos,${data.kpis.ticketsAbiertos}`,
      `kpi,eventos_registrados,${data.kpis.eventosRegistrados}`,
      ...data.ticketsPorRegion.map((r) => `tickets_region,${r.region},${r.total}`),
      ...data.interaccionesPorCanal.map((c) => `canal,${c.canal},${c.total}`),
    ];
    return filas.join('\n');
  }

  /**
   * Lista de pacientes activos con su estado y mapa de canales para `/journey` (#27).
   */
  listarPacientesJourney(filtros?: {
    region?: string;
    estado?: string;
    canal?: CanalAtencion;
    q?: string;
  }): ResumenPacienteJourney[] {
    const activos = this.tramites.listarTodosActivos();
    const porPaciente = new Map<string, ResumenPacienteJourney>();

    for (const trm of activos) {
      if (porPaciente.has(trm.pacienteId)) continue;
      porPaciente.set(trm.pacienteId, this.construirResumenJourney(trm.pacienteId));
    }

    // Asegurar al menos a Ana López demo si aún no ha creado trámites en una instancia limpia
    if (!porPaciente.has('pac_ana_demo')) {
      porPaciente.set('pac_ana_demo', this.construirResumenJourney('pac_ana_demo'));
    }

    const q = filtros?.q?.trim().toLowerCase();
    return [...porPaciente.values()]
      .filter((item) => {
        if (filtros?.region && item.region?.toLowerCase() !== filtros.region.toLowerCase()) {
          return false;
        }
        if (filtros?.estado && item.estadoActual !== filtros.estado) return false;
        if (filtros?.canal && item.ultimoCanal !== filtros.canal) return false;
        if (
          q &&
          !item.nombre.toLowerCase().includes(q) &&
          !(item.folio?.toLowerCase().includes(q) ?? false) &&
          !item.pacienteId.toLowerCase().includes(q)
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => Date.parse(b.actualizadoEn) - Date.parse(a.actualizadoEn));
  }

  obtenerDetalleJourney(pacienteId: string) {
    const resumen = this.construirResumenJourney(pacienteId);
    const tl = this.timeline.consultar(pacienteId, { limit: 100 });
    const procesoDiagnostico = resumen.folio
      ? this.servicio.obtenerProcesoDiagnostico(resumen.folio)
      : null;

    return {
      ...resumen,
      procesoDiagnostico,
      timeline: tl.items,
    };
  }

  private construirResumenJourney(pacienteId: string): ResumenPacienteJourney {
    const activo = this.tramites.obtenerActivoDePaciente(pacienteId);
    const tl = this.timeline.consultar(pacienteId, { limit: 100 });

    let nombre = pacienteId;
    let region: string | null = activo?.region ?? null;
    try {
      const perfil = this.identidad.obtenerPerfilMinimizado(pacienteId, 'asesor');
      if (typeof perfil.nombre === 'string') {
        const apellidos = typeof perfil.apellidos === 'string' ? ` ${perfil.apellidos}` : '';
        nombre = `${perfil.nombre}${apellidos}`;
      }
      if (!region && typeof perfil.region === 'string') region = perfil.region;
    } catch {
      // Mantiene ID si no hay perfil
    }

    const canalesRecorridos: PasoCanalJourney[] = [];
    let canalPrevio: CanalAtencion | null = null;
    for (const item of tl.items) {
      if (canalPrevio !== item.canal) {
        canalesRecorridos.push({
          canal: item.canal,
          hora: item.fecha,
          accion: item.accion,
          cambioDeCanal: canalPrevio !== null,
        });
        canalPrevio = item.canal;
      }
    }

    if (canalesRecorridos.length === 0 && activo) {
      canalesRecorridos.push({
        canal: activo.canalOrigen,
        hora: activo.creadoEn,
        accion: 'Inicio de trámite',
        cambioDeCanal: false,
      });
      if (activo.ultimoCanal !== activo.canalOrigen) {
        canalesRecorridos.push({
          canal: activo.ultimoCanal,
          hora: activo.actualizadoEn,
          accion: `Continuado en ${activo.ultimoCanal}`,
          cambioDeCanal: true,
        });
      }
    }

    return {
      pacienteId,
      nombre,
      region,
      folio: activo?.folio ?? null,
      tramiteId: activo?.id ?? null,
      estadoActual: activo?.estado ?? 'cotizacion',
      pasoActual: activo?.pasoActual ?? 'sin_tramite',
      ultimoCanal: activo?.ultimoCanal ?? canalesRecorridos.at(-1)?.canal ?? 'web',
      canalesRecorridos,
      contexto: {
        estudio: activo?.contexto.estudio?.nombre ?? null,
        clinica: activo?.contexto.clinica?.nombre ?? null,
        fechaTentativa: activo?.contexto.fechaTentativa ?? activo?.cita?.fechaHora ?? null,
        pendientes: activo?.contexto.pendientes ?? [],
      },
      actualizadoEn: activo?.actualizadoEn ?? tl.items.at(-1)?.fecha ?? new Date().toISOString(),
    };
  }

  /**
   * Widget "Mis estadísticas" diferenciado por rol (#29).
   */
  obtenerEstadisticasPorRol(usuario: UsuarioAutenticado) {
    if (usuario.rol === 'paciente') {
      const pacienteId = usuario.pacienteId ?? '';
      const tramites = pacienteId ? this.tramites.listarPorPaciente(pacienteId) : [];
      const citas = tramites.filter((t) => t.cita !== null);
      const resultados = this.resultados.listarPorUsuario(usuario);
      const cambiosCanal = tramites.filter((t) => t.canalOrigen !== t.ultimoCanal).length;
      return {
        rol: usuario.rol,
        tarjetas: [
          {
            clave: 'tramites_activos',
            etiqueta: 'Trámites activos',
            valor: tramites.filter((t) => t.estado !== 'cerrado' && t.estado !== 'cancelado')
              .length,
          },
          { clave: 'citas', etiqueta: 'Citas registradas', valor: citas.length },
          {
            clave: 'resultados_liberados',
            etiqueta: 'Resultados disponibles',
            valor: resultados.length,
          },
          {
            clave: 'continuaciones_omnicanal',
            etiqueta: 'Continuaciones sin repetir datos',
            valor: cambiosCanal,
          },
        ],
      };
    }

    if (usuario.rol === 'asesor' || usuario.rol === 'asesor_pro') {
      const todos = this.tickets.listar(usuario.region ? { region: usuario.region } : undefined);
      const mios = todos.filter((t) => t.asignadoAId === usuario.id);
      const resueltos = mios.filter((t) => t.resueltoEn !== null);
      const promedioMin =
        resueltos.length > 0
          ? Number(
              (
                resueltos.reduce(
                  (acc, t) =>
                    acc +
                    Math.max(0, (Date.parse(t.resueltoEn!) - Date.parse(t.creadoEn)) / 60_000),
                  0,
                ) / resueltos.length
              ).toFixed(1),
            )
          : 0;
      return {
        rol: usuario.rol,
        tarjetas: [
          { clave: 'tickets_asignados', etiqueta: 'Tickets asignados', valor: mios.length },
          { clave: 'tickets_resueltos', etiqueta: 'Tickets resueltos', valor: resueltos.length },
          { clave: 'tiempo_promedio_min', etiqueta: 'Tiempo promedio (min)', valor: promedioMin },
          {
            clave: 'cola_regional',
            etiqueta: `Cola activa (${usuario.region ?? 'todas'})`,
            valor: todos.filter(
              (t) =>
                t.estatus === 'abierto' || t.estatus === 'en_atencion' || t.estatus === 'escalado',
            ).length,
          },
        ],
      };
    }

    if (usuario.rol === 'medico') {
      const todos = this.resultados.listarTodosInterno();
      const porValidar = todos.filter((r) => r.estado === 'revision_tecnica').length;
      const listosLiberar = todos.filter((r) => r.estado === 'validacion_medica').length;
      const liberados = todos.filter((r) => r.estado === 'liberado').length;
      const mensajesPendientes = this.resultados.contarMensajesPendientesDeMedico();
      return {
        rol: usuario.rol,
        tarjetas: [
          { clave: 'por_validar', etiqueta: 'Resultados por validar', valor: porValidar },
          { clave: 'por_liberar', etiqueta: 'Validados por liberar', valor: listosLiberar },
          { clave: 'liberados', etiqueta: 'Resultados liberados', valor: liberados },
          {
            clave: 'mensajes_pacientes',
            etiqueta: 'Mensajes pendientes',
            valor: mensajesPendientes,
          },
        ],
      };
    }

    if (usuario.rol === 'revisor_tecnico') {
      const todos = this.resultados.listarTodosInterno();
      return {
        rol: usuario.rol,
        tarjetas: [
          {
            clave: 'por_revisar',
            etiqueta: 'Estudios en captura',
            valor: todos.filter((r) => r.estado === 'captura').length,
          },
          {
            clave: 'revisados',
            etiqueta: 'Aprobados técnicamente',
            valor: todos.filter((r) => r.revisadoPorId !== null && r.estado !== 'rechazado').length,
          },
          {
            clave: 'rechazados',
            etiqueta: 'Rechazados para reproceso',
            valor: todos.filter((r) => r.estado === 'rechazado').length,
          },
        ],
      };
    }

    // Admin (global)
    const admin = this.calcularMetricasAdmin();
    return {
      rol: usuario.rol,
      tarjetas: [
        {
          clave: 'retomados_pct',
          etiqueta: '% Retomados en otro canal',
          valor: `${admin.kpis.tramitesRetomadosOtroCanalPct}%`,
        },
        {
          clave: 'tickets_abiertos',
          etiqueta: 'Tickets abiertos',
          valor: admin.kpis.ticketsAbiertos,
        },
        {
          clave: 'clinicas_incidencia',
          etiqueta: 'Clínicas con incidencia',
          valor: admin.incidenciasClinicas.length,
        },
        {
          clave: 'eventos_totales',
          etiqueta: 'Eventos omnicanal',
          valor: admin.kpis.eventosRegistrados,
        },
      ],
    };
  }
}
