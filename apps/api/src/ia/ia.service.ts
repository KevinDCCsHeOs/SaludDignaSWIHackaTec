import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  CanalAtencion,
  IdiomaPaciente,
  PrioridadTicket,
  TipoTicket,
} from '@salud-digna/shared';
import {
  CANALES_ATENCION,
  IDIOMAS_PACIENTE,
  evaluarRutaPorRiesgo,
  type IdSolicitudRiesgo,
  type RutaAtencion,
} from '@salud-digna/shared';
import { z } from 'zod';
import type { UsuarioAutenticado } from '../auth/guards';
import { CanalesService } from '../canales/canales.service';
import { CatalogosService } from '../catalogos/catalogos.service';
import { EventPublisherService } from '../common/eventos/event-publisher.service';
import { ContextoService } from '../contexto/contexto.service';
import { IdentityResolverService } from '../identidad/identidad.service';
import { AccesoPacienteService } from '../otp/acceso-paciente.service';
import { ServicioService } from '../servicio/servicio.service';
import { TicketsService } from '../tickets/tickets.service';
import {
  clasificarMensajeNlp,
  type EntidadesIa,
  type IntencionIa,
  type TipoGuardrailIa,
} from './clasificador-nlp';
import { buscarEnGlosario, explicarPreparacionSencilla } from './glosario';
import { ProveedorLlmService, type ProveedorLlmTipo } from './proveedor-llm';
import {
  generarResumenParaAsesor,
  type ContextoMinimoPacienteIa,
  type TurnoConversacionIa,
} from './resumen-conversacion';

export const ConsultaIaSchema = z.object({
  mensaje: z.string().min(1).max(1200),
  canal: z.enum(CANALES_ATENCION).default('web'),
  pacienteId: z.string().min(1).max(36).nullable().optional(),
  sesionId: z.string().min(1).max(80).optional(),
  idioma: z.enum(IDIOMAS_PACIENTE).optional(),
  modoSencillo: z.boolean().default(false),
  region: z.string().min(1).max(60).optional(),
});

export interface ResultadoEscalamientoIa {
  requerido: boolean;
  motivo: string;
  prioridad: PrioridadTicket;
  tiempoEsperaMinutos: number;
  ticketId: string | null;
  ticketFolio: string | null;
  resumenIa: string;
}

export interface RespuestaAsistenteIa {
  intencion: IntencionIa;
  confianza: number;
  entidades: EntidadesIa;
  idioma: IdiomaPaciente;
  respuesta: string;
  mostrarMenu: boolean;
  guardrailActivado: TipoGuardrailIa;
  proveedorLlm: ProveedorLlmTipo;
  escalamiento: ResultadoEscalamientoIa | null;
}

interface EstadoConversacionIa {
  fallosConsecutivosConfianza: number;
  historial: TurnoConversacionIa[];
  idiomaPreferido: IdiomaPaciente;
}

const UMBRAL_CONFIANZA_MENU = 0.6;
const MAX_HISTORIAL_TURNOS = 10;

const RESPUESTA_911: Record<IdiomaPaciente, string> = {
  es: 'ALERTA DE EMERGENCIA: Si presentas síntomas de alarma (dolor de pecho, dificultad para respirar, sangrado intenso o desmayo), llama de inmediato al 911 o acude al servicio de urgencias más cercano. También abrimos un aviso con prioridad crítica para nuestro equipo.',
  en: 'EMERGENCY ALERT: If you have warning symptoms (chest pain, difficulty breathing, heavy bleeding, or fainting), call 911 immediately or go to the nearest emergency room. We also alerted our team with critical priority.',
  nah: 'TLAHTOLTEQUIPACHOLISTLI (EMERGENCIA): Tla timococoa chicahuac (dolor de pecho, amo tihueli tihiyotia noso tlahuel ezzotl), xitlanotza niman 911. Noihqui otictitlanqueh tlahcuilolli itech se tlapalehuiani.',
};

const RESPUESTA_NO_DIAGNOSTICO: Record<IdiomaPaciente, string> = {
  es: 'Como asistente virtual no puedo emitir diagnósticos médicos, recetar medicamentos ni interpretar resultados clínicos. Te recomiendo consultar con un médico o profesional de la salud; si necesitas cotizar un estudio, agendar cita o hablar con un asesor, con gusto te ayudo.',
  en: 'As a virtual assistant, I cannot provide medical diagnoses, prescribe medication, or interpret clinical results. Please consult a qualified physician; I can happily help you quote an exam, schedule an appointment, or connect you with an advisor.',
  nah: 'Amo nihueli nimitzilhuis tlen cocolistli ticpia, amo nihueli nimitzmacas pahtli. Ximotlahtolti ihuan se tepahtiani (médico). Nihueli nimitzpalehuis ica cita noso estudio.',
};

const SALUDO_NAHUATL =
  '¡Niltze! Cualli tonalli. Nitlahtoa Salud Digna tlapalehuiani. Tlen timonequi axcan? (1) Cotizar estudio, (2) Cita, (3) Clínica, (4) Asesor humano. Tihueli tiquihcuilos "asesor" tla ticnequi tlapalehuilistli.';

/**
 * Servicio central de Inteligencia Artificial Omnicanal (#24, #25, #26).
 * Reutilizable desde WhatsApp (`apps/whatsapp-bot`) y Chat Web (`apps/web`).
 */
/** Intención del asistente → solicitud del catálogo de riesgo (traspaso v2). */
const SOLICITUD_POR_INTENCION: Partial<Record<IntencionIa, IdSolicitudRiesgo>> = {
  cotizar: 'cot',
  agendar: 'age',
  resultados: 'ree',
  ubicacion: 'info',
  queja: 'que',
  acceso: 'acc',
  estatus: 'ret',
  urgencia: 'eme',
};

/** Prioridad del ticket según la ruta: la persona debe intervenir dentro del compromiso. */
const PRIORIDAD_POR_RUTA: Record<RutaAtencion, PrioridadTicket | null> = {
  Aceptar: null,
  Reducir: null,
  Compartir: 'media',
  Escalar: 'alta',
  Evitar: 'critica',
};

@Injectable()
export class IaService {
  private readonly conversaciones = new Map<string, EstadoConversacionIa>();

  constructor(
    private readonly proveedorLlm: ProveedorLlmService,
    private readonly catalogos: CatalogosService,
    private readonly contexto: ContextoService,
    private readonly identidad: IdentityResolverService,
    private readonly accesoPaciente: AccesoPacienteService,
    private readonly tickets: TicketsService,
    private readonly canales: CanalesService,
    private readonly servicio: ServicioService,
    private readonly eventos: EventPublisherService,
  ) {}

  async procesarMensaje(
    entrada: z.input<typeof ConsultaIaSchema>,
    usuario?: UsuarioAutenticado,
  ): Promise<RespuestaAsistenteIa> {
    const parsed = ConsultaIaSchema.safeParse(entrada);
    if (!parsed.success) {
      throw new BadRequestException({
        mensaje: 'Solicitud inválida para el asistente IA',
        errores: parsed.error.flatten().fieldErrors,
      });
    }

    const d = parsed.data;
    const pacienteIdEfectivo = this.resolverPacienteAutorizado(d.pacienteId ?? null, usuario);
    const claveConv = pacienteIdEfectivo ?? d.sesionId ?? `anon:${d.canal}`;
    const estadoConv = this.obtenerEstadoConversacion(claveConv, d.idioma ?? 'es');

    // Cargar contexto mínimo y preferencia de idioma solo si la identidad está autorizada/verificada (#8, #24)
    const { contextoMinimo, tramiteId, idiomaGuardado } = await this.cargarContextoMinimoSeguro(
      pacienteIdEfectivo,
      d.canal,
      usuario,
    );

    const idiomaBase: IdiomaPaciente = d.idioma ?? idiomaGuardado ?? estadoConv.idiomaPreferido;

    // 1. Clasificación determinista local + guardrails obligatorios (#24, #25)
    const clasificacion = clasificarMensajeNlp(d.mensaje, idiomaBase);
    const idiomaFinal = clasificacion.idiomaDetectado ? clasificacion.idioma : idiomaBase;
    estadoConv.idiomaPreferido = idiomaFinal;

    // Guardar preferencia de idioma en el paciente cuando se detecta con certeza (#26)
    if (pacienteIdEfectivo && clasificacion.idiomaDetectado && idiomaGuardado !== idiomaFinal) {
      this.identidad.actualizarIdiomaPaciente(pacienteIdEfectivo, idiomaFinal);
    }

    // Registrar turno del paciente en historial acotado (máx 10 turnos)
    this.agregarTurno(estadoConv, {
      emisor: 'paciente',
      texto: d.mensaje,
      intencion: clasificacion.intencion,
      confianza: clasificacion.confianza,
      en: new Date().toISOString(),
    });

    // 2. Guardrail duro #1: Síntomas de alarma -> 911 inmediato + ticket prioridad crítica (#25)
    if (clasificacion.esUrgenciaAlarma) {
      estadoConv.fallosConsecutivosConfianza = 0;
      const escalamiento = await this.crearEscalamiento({
        pacienteId: pacienteIdEfectivo,
        tramiteId,
        canal: d.canal,
        tipoTicket: 'urgencia',
        prioridad: 'critica',
        motivo: 'Síntomas de alarma detectados por IA (derivación 911)',
        intencion: 'urgencia',
        entidades: clasificacion.entidades,
        contextoMinimo,
        region: d.region ?? contextoMinimo?.region ?? 'Puebla',
        historial: estadoConv.historial,
      });

      const respuesta = RESPUESTA_911[idiomaFinal];
      this.agregarTurno(estadoConv, {
        emisor: 'ia',
        texto: respuesta,
        intencion: 'urgencia',
        confianza: clasificacion.confianza,
        en: new Date().toISOString(),
      });
      await this.registrarAuditoriaInteraccion(
        pacienteIdEfectivo,
        tramiteId,
        d.canal,
        'urgencia',
        clasificacion.confianza,
        idiomaFinal,
        'urgencia_911',
        'none',
      );

      return {
        intencion: 'urgencia',
        confianza: clasificacion.confianza,
        entidades: clasificacion.entidades,
        idioma: idiomaFinal,
        respuesta,
        mostrarMenu: false,
        guardrailActivado: 'urgencia_911',
        proveedorLlm: 'none',
        escalamiento,
      };
    }

    // 3. Guardrail duro #2: Nunca diagnosticar, recetar ni interpretar resultados clínicos (#24)
    if (clasificacion.guardrail === 'no_diagnostico') {
      estadoConv.fallosConsecutivosConfianza = 0;
      const respuesta = RESPUESTA_NO_DIAGNOSTICO[idiomaFinal];
      this.agregarTurno(estadoConv, {
        emisor: 'ia',
        texto: respuesta,
        intencion: clasificacion.intencion,
        confianza: clasificacion.confianza,
        en: new Date().toISOString(),
      });
      await this.registrarAuditoriaInteraccion(
        pacienteIdEfectivo,
        tramiteId,
        d.canal,
        clasificacion.intencion,
        clasificacion.confianza,
        idiomaFinal,
        'no_diagnostico',
        'none',
      );

      return {
        intencion: clasificacion.intencion,
        confianza: clasificacion.confianza,
        entidades: clasificacion.entidades,
        idioma: idiomaFinal,
        respuesta,
        mostrarMenu: false,
        guardrailActivado: 'no_diagnostico',
        proveedorLlm: 'none',
        escalamiento: null,
      };
    }

    // 4. Consulta opcional a LLM externo (si está configurado) con minimización de datos (#24)
    let intencionFinal = clasificacion.intencion;
    let confianzaFinal = clasificacion.confianza;
    const entidadesFinal: EntidadesIa = { ...clasificacion.entidades };
    let respuestaLlm: string | null = null;
    let proveedorUsado: ProveedorLlmTipo = 'none';

    const proveedorActivo = this.proveedorLlm.obtenerProveedorActivo();
    if (proveedorActivo !== 'none') {
      const llm = await this.proveedorLlm.consultarEstructurado({
        mensaje: d.mensaje,
        idioma: idiomaFinal,
        modoSencillo: d.modoSencillo || intencionFinal === 'explicame_facil',
        contextoMinimo,
      });
      if (llm) {
        proveedorUsado = proveedorActivo;
        // Post-filtro de seguridad: si el LLM intenta recetar/diagnosticar se descarta
        if (!/\b(te\s+receto|toma\s+\d+\s*mg|tu\s+diagn[oó]stico\s+es)\b/i.test(llm.respuesta)) {
          if (intencionFinal === 'desconocida' || llm.confianza > confianzaFinal) {
            intencionFinal = llm.intencion;
            confianzaFinal = Number(llm.confianza.toFixed(2));
          }
          respuestaLlm = llm.respuesta;
        }
      }
    }

    // 5. Reglas de escalamiento automático (#25):
    //    a) Pide asesor/humano
    //    b) Intención `queja`
    //    c) 2 respuestas seguidas de baja confianza (< 0.6)
    const bajaConfianza = confianzaFinal < UMBRAL_CONFIANZA_MENU;
    if (bajaConfianza) {
      estadoConv.fallosConsecutivosConfianza += 1;
    } else {
      estadoConv.fallosConsecutivosConfianza = 0;
    }

    let escalamiento: ResultadoEscalamientoIa | null = null;
    if (
      intencionFinal === 'asesor' ||
      intencionFinal === 'queja' ||
      estadoConv.fallosConsecutivosConfianza >= 2
    ) {
      const esQueja = intencionFinal === 'queja';
      const esPorBajaConfianza = estadoConv.fallosConsecutivosConfianza >= 2;
      const motivo = esQueja
        ? 'Queja o inconformidad detectada por asistente IA'
        : esPorBajaConfianza
          ? 'Dos respuestas consecutivas con confianza baja (< 0.6)'
          : 'El paciente solicitó hablar con un asesor humano';
      const tipoTicket: TipoTicket = esQueja ? 'queja' : 'duda';
      const prioridad: PrioridadTicket = esQueja ? 'alta' : 'media';

      escalamiento = await this.crearEscalamiento({
        pacienteId: pacienteIdEfectivo,
        tramiteId,
        canal: d.canal,
        tipoTicket,
        prioridad,
        motivo,
        intencion: intencionFinal,
        entidades: entidadesFinal,
        contextoMinimo,
        region: d.region ?? contextoMinimo?.region ?? 'Puebla',
        historial: estadoConv.historial,
      });

      if (esPorBajaConfianza) {
        estadoConv.fallosConsecutivosConfianza = 0;
      }
    }

    // 6. Construir respuesta final con contexto y/o modo lenguaje sencillo (#24, #26)
    const respuesta =
      escalamiento !== null
        ? this.construirRespuestaEscalamiento(escalamiento, idiomaFinal)
        : (respuestaLlm ??
          this.construirRespuestaContextual({
            intencion: intencionFinal,
            entidades: entidadesFinal,
            idioma: idiomaFinal,
            modoSencillo: d.modoSencillo || intencionFinal === 'explicame_facil',
            contextoMinimo,
            mostrarMenu: bajaConfianza,
          }));

    this.agregarTurno(estadoConv, {
      emisor: 'ia',
      texto: respuesta,
      intencion: intencionFinal,
      confianza: confianzaFinal,
      en: new Date().toISOString(),
    });

    await this.registrarAuditoriaInteraccion(
      pacienteIdEfectivo,
      tramiteId,
      d.canal,
      intencionFinal,
      confianzaFinal,
      idiomaFinal,
      'ninguno',
      proveedorUsado,
    );

    return {
      intencion: intencionFinal,
      confianza: confianzaFinal,
      entidades: entidadesFinal,
      idioma: idiomaFinal,
      respuesta,
      mostrarMenu: bajaConfianza && escalamiento === null,
      guardrailActivado: 'ninguno',
      proveedorLlm: proveedorUsado,
      escalamiento,
    };
  }

  private resolverPacienteAutorizado(
    pacienteIdSolicitado: string | null,
    usuario?: UsuarioAutenticado,
  ): string | null {
    if (!usuario) return null;
    if (usuario.rol === 'paciente') {
      return usuario.pacienteId;
    }
    return pacienteIdSolicitado;
  }

  private async cargarContextoMinimoSeguro(
    pacienteId: string | null,
    canal: CanalAtencion,
    usuario?: UsuarioAutenticado,
  ): Promise<{
    contextoMinimo: ContextoMinimoPacienteIa | null;
    tramiteId: string | null;
    idiomaGuardado: IdiomaPaciente | null;
  }> {
    if (!pacienteId || !usuario) {
      return { contextoMinimo: null, tramiteId: null, idiomaGuardado: null };
    }

    // Verificar OTP cuando quien llama es `asesor_ia` (regla: verificar antes de revelar, #8)
    try {
      await this.accesoPaciente.verificar(usuario, pacienteId, canal);
    } catch {
      return { contextoMinimo: null, tramiteId: null, idiomaGuardado: null };
    }

    let primerNombre: string | undefined;
    let idiomaGuardado: IdiomaPaciente | null = null;
    let region: string | undefined;
    try {
      const perfil = this.identidad.obtenerPerfilMinimizado(pacienteId, usuario.rol);
      if (typeof perfil.nombre === 'string') {
        primerNombre = perfil.nombre.split(/\s+/)[0];
      }
      if (perfil.idioma === 'es' || perfil.idioma === 'en' || perfil.idioma === 'nah') {
        idiomaGuardado = perfil.idioma;
      }
      if (typeof perfil.region === 'string') {
        region = perfil.region;
      }
    } catch {
      // Perfil opcional
    }

    try {
      const ctx = await this.contexto.obtenerPorPaciente(pacienteId);
      return {
        tramiteId: ctx.tramiteId,
        idiomaGuardado,
        contextoMinimo: {
          primerNombre,
          folio: ctx.folio,
          estadoTramite: ctx.estado,
          pasoActual: ctx.contexto.pasoActual,
          estudioNombre: ctx.contexto.estudio?.nombre,
          clinicaNombre: ctx.contexto.clinica?.nombre,
          region: ctx.contexto.clinica?.region ?? region,
        },
      };
    } catch {
      return {
        tramiteId: null,
        idiomaGuardado,
        contextoMinimo: primerNombre ? { primerNombre, region } : null,
      };
    }
  }

  private calcularTiempoEsperaMinutos(prioridad: PrioridadTicket, region: string): number {
    const base: Record<PrioridadTicket, number> = {
      critica: 1,
      alta: 3,
      media: 5,
      baja: 8,
    };
    const activosEnRegion = this.tickets
      .listar({ region })
      .filter(
        (t) => t.estatus === 'abierto' || t.estatus === 'en_atencion' || t.estatus === 'escalado',
      ).length;
    return base[prioridad] + Math.min(10, Math.floor(activosEnRegion / 2));
  }

  private async crearEscalamiento(params: {
    pacienteId: string | null;
    tramiteId: string | null;
    canal: CanalAtencion;
    tipoTicket: TipoTicket;
    prioridad: PrioridadTicket;
    motivo: string;
    intencion: IntencionIa;
    entidades: EntidadesIa;
    contextoMinimo: ContextoMinimoPacienteIa | null;
    region: string;
    historial: readonly TurnoConversacionIa[];
  }): Promise<ResultadoEscalamientoIa> {
    const resumenIa = generarResumenParaAsesor({
      canal: params.canal,
      motivo: params.motivo,
      intencion: params.intencion,
      entidades: params.entidades,
      contexto: params.contextoMinimo,
      historialReciente: params.historial,
    });
    // Ruta por riesgo (traspaso v2): si la solicitud exige una persona, fija prioridad y compromiso
    const solicitud = SOLICITUD_POR_INTENCION[params.intencion];
    const decision = solicitud ? evaluarRutaPorRiesgo({ solicitud }) : null;
    const porRuta = decision?.atiendePersona ? PRIORIDAD_POR_RUTA[decision.ruta] : null;
    const prioridad = porRuta ?? params.prioridad;
    const tiempoEsperaMinutos = this.calcularTiempoEsperaMinutos(prioridad, params.region);

    let ticketId: string | null = null;
    let ticketFolio: string | null = null;
    if (params.pacienteId) {
      const ticket = await this.tickets.crear(
        {
          pacienteId: params.pacienteId,
          tramiteId: params.tramiteId,
          canalOrigen: params.canal,
          tipo: params.tipoTicket,
          prioridad,
          region: params.region,
          resumenIa,
          ...(decision?.atiendePersona && decision.compromisoSegundos
            ? {
                slaMinutos: Math.max(1, Math.round(decision.compromisoSegundos / 60)),
                motivoEscalamiento:
                  `Ruta ${decision.ruta} (riesgo ${decision.riesgo})${decision.motivos.length ? `: ${decision.motivos.join('; ')}` : ''}`.slice(
                    0,
                    255,
                  ),
              }
            : {}),
        },
        { tipo: 'asesor_ia', id: 'asistente-ia' },
      );
      ticketId = ticket.id;
      ticketFolio = ticket.folio;
      if (decision?.atiendePersona) {
        await this.eventos.publicar({
          tipo: 'enrutamiento.escalado',
          version: 1,
          pacienteId: params.pacienteId,
          tramiteId: params.tramiteId,
          canal: params.canal,
          actor: { tipo: 'asesor_ia', id: 'asistente-ia' },
          rolActor: 'bot',
          datos: {
            solicitud: decision.solicitud,
            riesgo: decision.riesgo,
            ruta: decision.ruta,
            motivos: decision.motivos,
            compromisoSegundos: decision.compromisoSegundos,
          },
        });
      }
    }

    return {
      requerido: true,
      motivo: params.motivo,
      prioridad,
      tiempoEsperaMinutos,
      ticketId,
      ticketFolio,
      resumenIa,
    };
  }

  private construirRespuestaEscalamiento(
    esc: ResultadoEscalamientoIa,
    idioma: IdiomaPaciente,
  ): string {
    const folioTxt = esc.ticketFolio ? ` (folio ${esc.ticketFolio})` : '';
    if (idioma === 'en') {
      return `I am connecting you with a human advisor${folioTxt}. Estimated wait time: ~${esc.tiempoEsperaMinutos} min. I already shared a summary of your conversation so you will not need to repeat anything.`;
    }
    if (idioma === 'nah') {
      return `Nimitzpalehuia ihuan se tlapalehuiani (asesor humano)${folioTxt}. Tiempo estimado: ~${esc.tiempoEsperaMinutos} min. Amo monequi tiquilnamiquis moamox.`;
    }
    return `Te conecto con un asesor humano${folioTxt}. Tiempo estimado de espera: ~${esc.tiempoEsperaMinutos} min. Ya compartí el resumen de tu contexto para que no tengas que repetir tus datos.`;
  }

  private construirRespuestaContextual(params: {
    intencion: IntencionIa;
    entidades: EntidadesIa;
    idioma: IdiomaPaciente;
    modoSencillo: boolean;
    contextoMinimo: ContextoMinimoPacienteIa | null;
    mostrarMenu: boolean;
  }): string {
    const { intencion, entidades, idioma, modoSencillo, contextoMinimo, mostrarMenu } = params;
    const saludoNombre = contextoMinimo?.primerNombre ? `${contextoMinimo.primerNombre}, ` : '';

    if (idioma === 'nah') {
      return SALUDO_NAHUATL;
    }

    // Modo "explícame fácil" / términos médicos / preparación sencilla (#26)
    if (intencion === 'explicame_facil' || (modoSencillo && entidades.estudioId)) {
      if (entidades.estudioId) {
        const est = this.catalogos.obtenerEstudioPorId(entidades.estudioId);
        return explicarPreparacionSencilla(est, idioma);
      }
      if (entidades.terminoMedico) {
        const item = buscarEnGlosario(entidades.terminoMedico);
        if (item) {
          return idioma === 'en' ? item.explicacionSencillaEn : item.explicacionSencillaEs;
        }
      }
      if (contextoMinimo?.estudioNombre) {
        const est = this.catalogos
          .listarEstudios()
          .find((e) => e.nombre === contextoMinimo.estudioNombre);
        if (est) return explicarPreparacionSencilla(est, idioma);
      }
      return idioma === 'en'
        ? 'Tell me which medical term or exam preparation you want me to explain in plain language (for example: fasting, abdominal ultrasound, blood chemistry, or MRI).'
        : 'Dime qué término médico o preparación de estudio quieres que te explique en palabras sencillas (por ejemplo: ayuno, ultrasonido abdominal, química sanguínea o resonancia).';
    }

    if (mostrarMenu) {
      return idioma === 'en'
        ? `${saludoNombre}I want to make sure I help you accurately. Please pick an option from the menu: Quote an exam, Schedule/resume appointment, Check status, Results, Clinic location, or Talk to an advisor.`
        : `${saludoNombre}Quiero asegurarme de ayudarte bien. Elige una opción del menú: Cotizar estudio, Agendar o retomar cita, Estatus de trámite, Resultados, Ubicación de clínica o Hablar con un asesor.`;
    }

    if (intencion === 'cotizar') {
      if (entidades.estudioId) {
        const est = this.catalogos.obtenerEstudioPorId(entidades.estudioId);
        const prep = modoSencillo ? explicarPreparacionSencilla(est, idioma) : est.preparacion;
        return idioma === 'en'
          ? `${saludoNombre}${est.nombre} has an approximate cost of $${est.precio} MXN (${est.duracionMinutos} min). Preparation: ${prep}`
          : `${saludoNombre}El estudio ${est.nombre} tiene un costo aproximado de $${est.precio} MXN (duración ${est.duracionMinutos} min). Preparación: ${prep}`;
      }
      return idioma === 'en'
        ? `${saludoNombre}I can quote over 30 exams (ultrasound, lab tests, X-rays, mammograms, ECG). Which exam are you looking for?`
        : `${saludoNombre}Puedo cotizar más de 30 estudios (ultrasonido, laboratorio, rayos X, mastografía, electrocardiograma). ¿Qué estudio necesitas?`;
    }

    if (intencion === 'agendar') {
      if (contextoMinimo?.folio) {
        const fechaTxt = entidades.fecha ? ` para ${entidades.fecha}` : '';
        return idioma === 'en'
          ? `${saludoNombre}you have an active process (${contextoMinimo.folio}) for ${contextoMinimo.estudioNombre ?? 'your exam'} at ${contextoMinimo.clinicaNombre ?? 'your clinic'}. Would you like to confirm your appointment time?`
          : `${saludoNombre}ya tienes el trámite ${contextoMinimo.folio} de ${contextoMinimo.estudioNombre ?? 'tu estudio'} en ${contextoMinimo.clinicaNombre ?? 'tu clínica'}. Podemos agendar tu horario${fechaTxt} sin repetir tus datos.`;
      }
      const detalleEst = entidades.estudioNombre ? ` para ${entidades.estudioNombre}` : '';
      const detalleFecha = entidades.fecha ? ` (${entidades.fecha})` : '';
      return idioma === 'en'
        ? `${saludoNombre}we can schedule your appointment${entidades.estudioNombre ? ` for ${entidades.estudioNombre}` : ''}${detalleFecha}. Choose your preferred clinic and time slot.`
        : `${saludoNombre}con gusto agendamos tu cita${detalleEst}${detalleFecha}. Indícame tu clínica preferida o elige un horario disponible.`;
    }

    if (intencion === 'estatus') {
      if (contextoMinimo?.folio) {
        let detalleDiagnostico = '';
        let avisoClinica = '';
        try {
          const proc = this.servicio.obtenerProcesoDiagnostico(contextoMinimo.folio);
          detalleDiagnostico =
            idioma === 'en'
              ? ` Diagnostic stage: ${proc.etiquetaEtapa} (${proc.progresoPct}%).`
              : ` Etapa diagnóstica: ${proc.etiquetaEtapa} (${proc.progresoPct}%, estimado: ${proc.horaEstimadaEntrega.slice(11, 16)} h).`;
          if (proc.clinica?.tieneIncidencia && proc.clinica.mensajeEstatus) {
            avisoClinica =
              idioma === 'en'
                ? ` Clinic notice: ${proc.clinica.mensajeEstatus}`
                : ` Aviso de clínica: ${proc.clinica.mensajeEstatus}`;
          }
        } catch {
          // Opcional si el folio aún no tiene detalle diagnóstico
        }
        return idioma === 'en'
          ? `${saludoNombre}your active process ${contextoMinimo.folio} (${contextoMinimo.estudioNombre ?? 'exam'}) is currently at step "${contextoMinimo.pasoActual ?? contextoMinimo.estadoTramite}" in ${contextoMinimo.clinicaNombre ?? 'your chosen clinic'}.${detalleDiagnostico}${avisoClinica}`
          : `${saludoNombre}tu trámite ${contextoMinimo.folio} (${contextoMinimo.estudioNombre ?? 'estudio'}) va en el paso "${contextoMinimo.pasoActual ?? contextoMinimo.estadoTramite}" en ${contextoMinimo.clinicaNombre ?? 'tu clínica'}.${detalleDiagnostico}${avisoClinica}`;
      }
      return idioma === 'en'
        ? `${saludoNombre}I do not see an active process right now. If you have a folio (SD-2026-...) or want to start a quote, let me know.`
        : `${saludoNombre}no veo un trámite activo en este momento. Si deseas iniciar una cotización o verificar tu identidad, dime cómo prefieres continuar.`;
    }

    if (intencion === 'resultados') {
      return idioma === 'en'
        ? `${saludoNombre}clinical results go through technical review and medical validation before release. Once released, you can view them in the Web Portal or Mobile App—we also notify you automatically.`
        : `${saludoNombre}tus resultados pasan por revisión técnica y validación médica antes de liberarse. En cuanto estén listos te avisaremos por WhatsApp y la app móvil para que los consultes de forma segura.`;
    }

    if (intencion === 'ubicacion') {
      const cliId = entidades.clinicaId ?? 'cli_09';
      const cli = this.catalogos.obtenerClinicaPorId(cliId);
      return idioma === 'en'
        ? `${cli.nombre} is located at ${cli.direccion}. Hours Mon–Fri: ${cli.horario.lunes_viernes} (status: ${cli.estatus}).`
        : `${cli.nombre} está ubicada en ${cli.direccion}. Horario lunes a viernes: ${cli.horario.lunes_viernes} (estatus: ${cli.estatus}).`;
    }

    if (intencion === 'acceso') {
      return idioma === 'en'
        ? 'To recover access to your account safely, we verify your identity with a one-time 6-digit OTP code and send a 30-minute reset link. You can start recovery from the Login screen or here in WhatsApp.'
        : 'Para recuperar el acceso a tu cuenta de forma segura, verificamos tu identidad con un código OTP de 6 dígitos y enviamos un enlace temporal de 30 minutos. Nadie del equipo verá tu contraseña.';
    }

    return idioma === 'en'
      ? `${saludoNombre}how can I help you today? You can ask for quotes, appointment scheduling, clinic locations, plain-language preparation guides, or type "advisor".`
      : `${saludoNombre}¿en qué puedo ayudarte hoy? Puedes cotizar estudios, agendar o retomar tu cita, pedir preparación en lenguaje sencillo o escribir "asesor".`;
  }

  private obtenerEstadoConversacion(clave: string, idiomaInicial: IdiomaPaciente) {
    let estado = this.conversaciones.get(clave);
    if (!estado) {
      estado = {
        fallosConsecutivosConfianza: 0,
        historial: [],
        idiomaPreferido: idiomaInicial,
      };
      this.conversaciones.set(clave, estado);
    }
    return estado;
  }

  private agregarTurno(estado: EstadoConversacionIa, turno: TurnoConversacionIa): void {
    estado.historial.push(turno);
    if (estado.historial.length > MAX_HISTORIAL_TURNOS) {
      estado.historial.splice(0, estado.historial.length - MAX_HISTORIAL_TURNOS);
    }
  }

  private async registrarAuditoriaInteraccion(
    pacienteId: string | null,
    tramiteId: string | null,
    canal: CanalAtencion,
    intencion: IntencionIa,
    confianza: number,
    idioma: IdiomaPaciente,
    guardrailActivado: TipoGuardrailIa,
    proveedorLlm: ProveedorLlmTipo,
  ): Promise<void> {
    if (!pacienteId) return;
    await this.canales
      .registrarInteraccionCanal({
        pacienteId,
        tramiteId,
        canal,
        actorTipo: 'asesor_ia',
        actorId: 'asistente-ia',
        resumen: `Respuesta IA [${intencion}] (confianza ${Math.round(confianza * 100)}%, idioma ${idioma})`,
        metadatos: {
          intencion,
          confianza,
          idioma,
          guardrailActivado,
          proveedorLlm,
        },
      })
      .catch(() => undefined);
  }
}
