import mensajesEn from '../i18n/en.json';
import mensajesEs from '../i18n/es.json';
import mensajesNah from '../i18n/nah.json';
import type { ClienteApiOmnicanal } from '../cloud-api/cliente-api';
import type { ClienteMetaCloudApi } from '../cloud-api/cliente-meta';
import type { IdiomaBotWa, SesionDialogoWa, SesionWaStore } from '../cloud-api/sesion-store';
import { obtenerPlazos, perfilPlazosDesdeEntorno } from '@salud-digna/shared';
import {
  esIntencionRecuperacionAcceso,
  manejarRecuperacionAccesoWhatsapp,
} from './recuperacion-acceso';

export interface MensajeEntranteWa {
  messageId: string;
  telefono: string;
  texto: string;
  botonId?: string;
}

const REGEX_URGENCIA_BOT =
  /\b(dolor\s+(?:fuerte\s+)?(?:en\s+el\s+|de\s+)?pecho|chest\s+pain|no\s+puedo\s+respirar|can'?t\s+breathe|sangrado\s+(?:intenso|abundante)|heavy\s+bleeding|desmayo|fainted|infarto|convulsi[oó]n|hemorragia|call\s+911)\b/i;

const REGEX_NAHUATL_BOT =
  /\b(niltze|pialli|cualli\s+tonalli|kuali\s+tonali|tlazohcamati|n[aá]huatl|macehualli)\b/i;

const REGEX_INGLES_BOT =
  /\b(hello|hi\b|how\s+much|quote|schedule|appointment|results?|location|clinic|password|complaint|advisor|human|explain|fasting|please|thanks|chest\s+pain|can'?t\s+breathe)\b/i;

function detectarIdiomaBot(texto: string, actual: IdiomaBotWa): IdiomaBotWa {
  if (!texto || /^\d+$/.test(texto.trim())) return actual;
  if (REGEX_NAHUATL_BOT.test(texto)) return 'nah';
  if (REGEX_INGLES_BOT.test(texto) && !/[¿¡ñáéíóú]/i.test(texto)) return 'en';
  if (
    /\b(hola|buenos|buenas|cita|tr[aá]mite|estudio|cl[ií]nica|asesor|gracias|ayuno)\b/i.test(texto)
  ) {
    return 'es';
  }
  return actual;
}

function interpolar(plantilla: string, vars: Record<string, string>): string {
  return plantilla.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? '');
}

function textosDe(idioma: IdiomaBotWa) {
  if (idioma === 'en') return mensajesEn;
  if (idioma === 'nah') return mensajesNah;
  return mensajesEs;
}

/**
 * Máquina conversacional de WhatsApp (#21):
 * - Valida identidad con OTP antes de revelar el trámite pendiente.
 * - Ofrece continuar el trámite exactamente donde quedó (recorrido de Ana).
 * - Soporta menú completo, envío de `location` de clínica, interrupciones, recuperación (#9) y comando `asesor`.
 */
export class MaquinaDialogoWhatsapp {
  constructor(
    private readonly api: ClienteApiOmnicanal,
    private readonly meta: ClienteMetaCloudApi,
    private readonly sesiones: SesionWaStore,
  ) {}

  /**
   * Temporizadores de la conversación (traspaso v2, sección 5):
   * - Aviso: un solo mensaje que ya anuncia el cierre y cómo retomar.
   * - Cierre: sin mensaje; el núcleo pausa el trámite conservando todo.
   * Los eventos se registran con la hora del umbral, no con la de detección.
   */
  async revisarInactividad(ahora = Date.now()): Promise<number> {
    const perfil = perfilPlazosDesdeEntorno(process.env.PLAZOS_PERFIL);
    const plazos = obtenerPlazos(perfil);
    let acciones = 0;
    for (const sesion of this.sesiones.listar()) {
      // Conversaciones sin empezar, cerradas o atendidas por teléfono no cuentan
      if (sesion.paso === 'inicio' || sesion.cerradaEn || sesion.avisoAtencionTelefonicaEn)
        continue;
      const ultimo = Date.parse(sesion.ultimoMensajeEn);
      const inactivo = (ahora - ultimo) / 1000;

      if (inactivo >= plazos.cierre) {
        const umbral = new Date(ultimo + plazos.cierre * 1000).toISOString();
        sesion.cerradaEn = umbral;
        this.sesiones.guardar(sesion);
        acciones++;
        if (sesion.pacienteId && this.api.reportarInactividad) {
          await this.api
            .reportarInactividad({
              pacienteId: sesion.pacienteId,
              tipo: 'cierre',
              ocurridoEn: umbral,
              inactivoSegundos: plazos.cierre,
              cierreEnSegundos: 0,
              perfilPlazos: perfil,
            })
            .catch((error: unknown) => {
              console.error(
                `[whatsapp-bot] No se pudo reportar el cierre: ${(error as Error).message}`,
              );
            });
        }
        continue;
      }

      if (inactivo >= plazos.aviso && !sesion.avisoInactividadEn) {
        const umbral = new Date(ultimo + plazos.aviso * 1000).toISOString();
        sesion.avisoInactividadEn = umbral;
        this.sesiones.guardar(sesion);
        acciones++;
        const restante = plazos.cierre - plazos.aviso;
        const minutos = restante >= 60 ? `${Math.round(restante / 60)} min` : `${restante} s`;
        await this.meta.enviarTexto(
          sesion.telefono,
          interpolar(textosDe(sesion.idioma).sesion.avisoInactividad, { minutos }),
        );
        if (sesion.pacienteId && this.api.reportarInactividad) {
          await this.api
            .reportarInactividad({
              pacienteId: sesion.pacienteId,
              tipo: 'aviso',
              ocurridoEn: umbral,
              inactivoSegundos: plazos.aviso,
              cierreEnSegundos: restante,
              perfilPlazos: perfil,
            })
            .catch((error: unknown) => {
              console.error(
                `[whatsapp-bot] No se pudo reportar el aviso: ${(error as Error).message}`,
              );
            });
        }
      }
    }
    return acciones;
  }

  async procesarMensajeEntrante(msg: MensajeEntranteWa): Promise<SesionDialogoWa> {
    const ahora = new Date().toISOString();
    const texto = (msg.botonId ?? msg.texto).trim();
    const textoLower = texto.toLowerCase();

    await this.sesiones.hidratar(msg.telefono);
    const sesion = this.sesiones.obtener(msg.telefono) ?? {
      telefono: msg.telefono,
      pacienteId: null,
      nombrePaciente: null,
      tramiteId: null,
      clinicaId: null,
      paso: 'inicio',
      pasoInterrumpido: null,
      idioma: 'es',
      ultimoMensajeEn: ahora,
    };
    sesion.ultimoMensajeEn = ahora;
    // Mensaje nuevo: el reloj de inactividad vuelve a empezar (v2)
    sesion.avisoInactividadEn = null;
    if (sesion.cerradaEn) {
      // Se cierra la conversación, no el trámite: al volver se valida identidad y se retoma
      sesion.cerradaEn = null;
      sesion.paso = 'inicio';
      sesion.pasoInterrumpido = null;
    }
    const idiomaDetectado = detectarIdiomaBot(texto, sesion.idioma);
    const cambioIdioma = idiomaDetectado !== sesion.idioma;
    sesion.idioma = idiomaDetectado;
    if (cambioIdioma && sesion.pacienteId && this.api.actualizarIdiomaPaciente) {
      await this.api
        .actualizarIdiomaPaciente(sesion.pacienteId, sesion.idioma)
        .catch(() => undefined);
    }

    const i18n = textosDe(sesion.idioma);

    // 0. Prioridad absoluta: síntomas de alarma -> 911 inmediato sin bloquear por OTP (#25)
    if (REGEX_URGENCIA_BOT.test(texto)) {
      let pacienteId = sesion.pacienteId;
      if (!pacienteId) {
        const res = await this.api.resolverIdentidad('whatsapp', msg.telefono).catch(() => null);
        pacienteId = res?.pacienteId ?? 'pac_ana_demo';
      }
      const ticket = await this.api.crearTicketEscalamiento({
        pacienteId,
        tramiteId: sesion.tramiteId,
        region: 'Puebla',
        tipo: 'urgencia',
        prioridad: 'critica',
        resumenIa: `URGENCIA detectada en WhatsApp: "${texto.slice(0, 140)}". Se indicó llamar al 911 de inmediato.`,
      });
      await this.meta.enviarTexto(
        msg.telefono,
        interpolar(i18n.flujo.urgencia911, { folio: ticket.folio }),
      );
      this.sesiones.guardar(sesion);
      return sesion;
    }

    // 0.5 Canal propietario (v2): si el Call Center atiende el trámite, el bot no escribe.
    //     Avisa una sola vez y guarda silencio para no cruzar mensajes ni generar costo.
    if (sesion.pacienteId && sesion.paso !== 'inicio' && sesion.paso !== 'esperando_otp') {
      const ctx = await this.api.obtenerContexto(sesion.pacienteId).catch(() => null);
      const propietario = ctx?.contexto?.propietario;
      const enLlamada =
        propietario &&
        propietario.exclusivo &&
        propietario.canal !== 'whatsapp' &&
        Date.parse(propietario.hasta) > Date.now();
      if (enLlamada) {
        if (!sesion.avisoAtencionTelefonicaEn) {
          sesion.avisoAtencionTelefonicaEn = ahora;
          await this.meta.enviarTexto(msg.telefono, i18n.sesion.atencionTelefonica);
        }
        this.sesiones.guardar(sesion);
        return sesion;
      }
      sesion.avisoAtencionTelefonicaEn = null;
    }

    // 1. Comando global "asesor" / "humano" en cualquier momento (#21, #25)
    if (
      textoLower === 'asesor' ||
      textoLower === 'btn_asesor' ||
      /\b(hablar con asesor|asesor|humano|advisor|talk to a human|representative)\b/i.test(texto)
    ) {
      let pacienteId = sesion.pacienteId;
      if (!pacienteId) {
        const res = await this.api.resolverIdentidad('whatsapp', msg.telefono);
        pacienteId = res.pacienteId ?? 'pac_ana_demo';
      }
      const ticket = await this.api.crearTicketEscalamiento({
        pacienteId,
        tramiteId: sesion.tramiteId,
        region: 'Puebla',
        resumenIa: `El paciente solicitó atención humana desde WhatsApp en paso '${sesion.paso}'.`,
      });
      await this.meta.enviarTexto(
        msg.telefono,
        interpolar(i18n.flujo.escaladoAsesor, { folio: ticket.folio }),
      );
      this.sesiones.guardar(sesion);
      return sesion;
    }

    // 2. Opción "No puedo entrar a mi cuenta" (#9)
    if (esIntencionRecuperacionAcceso(texto) || textoLower === 'opt_recuperar') {
      const r = await manejarRecuperacionAccesoWhatsapp(
        { telefono: msg.telefono, mensaje: texto },
        this.api,
      );
      if (r.paso === 'esperando_otp' && r.pacienteId) {
        sesion.pacienteId = r.pacienteId;
        sesion.paso = 'recuperacion_otp';
      }
      await this.meta.enviarTexto(msg.telefono, r.respuesta);
      this.sesiones.guardar(sesion);
      return sesion;
    }

    if (sesion.paso === 'recuperacion_otp' && /^\d{6}$/.test(texto) && sesion.pacienteId) {
      const r = await manejarRecuperacionAccesoWhatsapp(
        {
          telefono: msg.telefono,
          mensaje: texto,
          codigoOtp: texto,
          pacienteId: sesion.pacienteId,
        },
        this.api,
      );
      await this.meta.enviarTexto(msg.telefono, r.respuesta);
      if (r.paso === 'enlace_enviado') {
        sesion.paso = 'menu_principal';
      }
      this.sesiones.guardar(sesion);
      return sesion;
    }

    // 3. Estado inicial: resolver identidad y pedir OTP antes de revelar cualquier trámite (#7, #8, #21)
    if (sesion.paso === 'inicio') {
      const resolucion = await this.api.resolverIdentidad('whatsapp', msg.telefono);
      if (resolucion.estado === 'ambiguo') {
        await this.meta.enviarTexto(msg.telefono, i18n.saludo.ambiguo);
        this.sesiones.guardar(sesion);
        return sesion;
      }

      if (resolucion.estado === 'nuevo' || !resolucion.pacienteId) {
        await this.enviarMenuPrincipal(msg.telefono, sesion.idioma);
        sesion.paso = 'menu_principal';
        this.sesiones.guardar(sesion);
        return sesion;
      }

      sesion.pacienteId = resolucion.pacienteId;
      await this.registrarInteraccionSegura(
        sesion.pacienteId,
        null,
        'Mensaje recibido en WhatsApp',
        msg.messageId,
      );

      // Si requiere verificación o no tiene OTP activo, pedir OTP antes de revelar nada
      await this.api.solicitarOtp(sesion.pacienteId, 'whatsapp');
      await this.meta.enviarTexto(msg.telefono, i18n.saludo.pedirOtp);
      sesion.paso = 'esperando_otp';
      this.sesiones.guardar(sesion);
      return sesion;
    }

    // 4. Esperando código OTP de 6 dígitos
    if (sesion.paso === 'esperando_otp' && sesion.pacienteId) {
      if (!/^\d{6}$/.test(texto)) {
        if (/nuevo|reenviar|new/i.test(texto)) {
          await this.api.solicitarOtp(sesion.pacienteId, 'whatsapp');
          await this.meta.enviarTexto(msg.telefono, i18n.saludo.pedirOtp);
        } else {
          await this.meta.enviarTexto(msg.telefono, i18n.saludo.otpInvalido);
        }
        this.sesiones.guardar(sesion);
        return sesion;
      }

      try {
        await this.api.verificarOtp(sesion.pacienteId, 'whatsapp', texto);
        await this.api
          .vincularIdentidad(sesion.pacienteId, 'whatsapp', msg.telefono)
          .catch(() => undefined);
      } catch {
        await this.meta.enviarTexto(msg.telefono, i18n.saludo.otpInvalido);
        this.sesiones.guardar(sesion);
        return sesion;
      }

      const perfil = await this.api
        .obtenerPerfilVerificado(sesion.pacienteId)
        .catch(() => ({ nombre: 'Paciente', idioma: 'es' }));
      sesion.nombrePaciente = perfil.nombre;
      if (perfil.idioma === 'en' || perfil.idioma === 'nah') {
        sesion.idioma = perfil.idioma;
      }

      const ctx = await this.api.obtenerContexto(sesion.pacienteId);
      const t = textosDe(sesion.idioma);

      if (ctx) {
        sesion.tramiteId = ctx.tramiteId;
        sesion.clinicaId = ctx.contexto.clinica?.id ?? null;
        sesion.paso = 'ofreciendo_retomar';

        await this.meta.enviarBotonesInteractivos(
          msg.telefono,
          interpolar(t.saludo.retomarTramite, {
            nombre: sesion.nombrePaciente,
            estudio: ctx.contexto.estudio?.nombre ?? 'tu estudio',
            clinica: ctx.contexto.clinica?.nombre ?? 'tu clínica',
          }),
          [
            { id: 'btn_continuar', titulo: t.botones.siContinuar },
            { id: 'btn_menu', titulo: t.botones.otraCosa },
            { id: 'btn_asesor', titulo: t.botones.hablarAsesor },
          ],
        );
      } else {
        sesion.paso = 'menu_principal';
        await this.meta.enviarTexto(
          msg.telefono,
          interpolar(t.saludo.sinTramiteActivo, { nombre: sesion.nombrePaciente }),
        );
        await this.enviarMenuPrincipal(msg.telefono, sesion.idioma);
      }

      this.sesiones.guardar(sesion);
      return sesion;
    }

    // 5. Manejo de interrupciones (ej. pide ubicación o estatus en medio de agendar) (#21)
    if (
      textoLower === 'opt_ubicacion' ||
      /\b(ubicaci[oó]n|direcci[oó]n|d[oó]nde est[aá]|mapa|location)\b/i.test(texto)
    ) {
      if (sesion.paso === 'ofreciendo_retomar' || sesion.paso === 'eligiendo_horario') {
        sesion.pasoInterrumpido = sesion.paso;
      }
      const clinica = await this.api.obtenerClinica(sesion.clinicaId ?? 'cli_09');
      if (clinica) {
        await this.meta.enviarUbicacionClinica(msg.telefono, clinica);
        await this.meta.enviarTexto(
          msg.telefono,
          interpolar(i18n.flujo.ubicacionEnviada, {
            clinica: clinica.nombre,
            direccion: clinica.direccion,
          }),
        );
      }
      if (sesion.pasoInterrumpido) {
        await this.meta.enviarBotonesInteractivos(msg.telefono, i18n.flujo.interrupcionRetorno, [
          { id: 'btn_volver_tramite', titulo: i18n.botones.volverTramite },
          { id: 'btn_menu', titulo: i18n.botones.verMenu },
        ]);
      }
      this.sesiones.guardar(sesion);
      return sesion;
    }

    // Volver tras interrupción
    if (textoLower === 'btn_volver_tramite' && sesion.pasoInterrumpido) {
      sesion.paso = sesion.pasoInterrumpido;
      sesion.pasoInterrumpido = null;
      if (sesion.paso === 'eligiendo_horario') {
        await this.ofrecerHorarios(msg.telefono, sesion.idioma);
        this.sesiones.guardar(sesion);
        return sesion;
      }
    }

    // 6. Continuar trámite pendiente -> ofrecer horarios
    if (
      sesion.paso === 'ofreciendo_retomar' &&
      (textoLower === 'btn_continuar' || /^(s[ií]|continuar|yes)/i.test(texto))
    ) {
      if (sesion.tramiteId) {
        await this.api.retomarTramite(sesion.tramiteId, 'whatsapp').catch(() => undefined);
      }
      sesion.paso = 'eligiendo_horario';
      await this.ofrecerHorarios(msg.telefono, sesion.idioma);
      this.sesiones.guardar(sesion);
      return sesion;
    }

    // 7. Elegir horario -> agendar cita vía API
    if (
      sesion.paso === 'eligiendo_horario' &&
      sesion.tramiteId &&
      (textoLower === 'btn_manana_9' ||
        textoLower === 'btn_manana_1130' ||
        /9:00|11:30|ma[nñ]ana/i.test(texto))
    ) {
      const es1130 = textoLower === 'btn_manana_1130' || /11:30/.test(texto);
      const fechaIso = es1130 ? '2026-11-26T11:30:00Z' : '2026-11-26T09:00:00Z';
      const fechaLegible = es1130 ? 'Mañana 11:30' : 'Mañana 9:00';

      const agendada = await this.api.agendarCita(
        sesion.tramiteId,
        fechaIso,
        sesion.clinicaId ?? undefined,
      );
      const clinica = sesion.clinicaId ? await this.api.obtenerClinica(sesion.clinicaId) : null;

      await this.meta.enviarTexto(
        msg.telefono,
        interpolar(i18n.flujo.citaAgendada, {
          fecha: fechaLegible,
          clinica: clinica?.nombre ?? 'tu clínica',
          folio: agendada.folio,
          codigo: agendada.cita?.codigoConfirmacion ?? 'SD-OK',
        }),
      );
      sesion.paso = 'menu_principal';
      this.sesiones.guardar(sesion);
      return sesion;
    }

    // 8. Menú, facturación simulada (#33), consultas rápidas y asistente IA reutilizable (#21, #24, #25, #26, #31)
    if (/\b(factura|facturar|facturaci[oó]n|invoice)\b/i.test(texto) && sesion.pacienteId) {
      if (this.api.solicitarFactura) {
        const tf = textosDe(sesion.idioma).factura;
        let factura: { id: string; folioFiscalSimulado: string } | null = null;
        try {
          const ctx = await this.api.obtenerContexto(sesion.pacienteId);
          const tramiteId = sesion.tramiteId ?? ctx?.tramiteId;
          if (!tramiteId) {
            await this.meta.enviarTexto(msg.telefono, tf.sinTramite);
          } else {
            const resFac = await this.api.solicitarFactura({
              tramiteId,
              pacienteId: sesion.pacienteId,
            });
            factura = resFac.factura;
          }
        } catch {
          await this.meta.enviarTexto(msg.telefono, tf.faltanDatos);
        }

        if (factura) {
          const folio = factura.folioFiscalSimulado;
          try {
            if (!this.api.descargarPdfFactura) {
              throw new Error('El cliente del API no soporta la descarga del PDF');
            }
            const pdf = await this.api.descargarPdfFactura(factura.id);
            await this.meta.enviarDocumentoPdf(
              msg.telefono,
              pdf,
              `factura-${folio}.pdf`,
              interpolar(tf.leyendaPdf, { folio }),
            );
          } catch (error) {
            console.error(
              `[whatsapp-bot] No se pudo adjuntar la factura: ${(error as Error).message}`,
            );
            await this.meta.enviarTexto(msg.telefono, interpolar(tf.descargaEnApp, { folio }));
          }
        }
        this.sesiones.guardar(sesion);
        return sesion;
      }
    }

    if (
      textoLower === 'opt_estatus' ||
      /\b(estatus|estado|c[oó]mo va mi (?:estudio|tr[aá]mite)|c[oó]mo va)\b/i.test(texto)
    ) {
      const ctx = sesion.pacienteId ? await this.api.obtenerContexto(sesion.pacienteId) : null;
      let resumenFinal = ctx
        ? interpolar(i18n.flujo.estatusResumen, { resumen: ctx.resumen })
        : i18n.flujo.estatusSinTramite;
      if (ctx && this.api.obtenerProcesoDiagnostico) {
        const proc = await this.api.obtenerProcesoDiagnostico(ctx.folio).catch(() => null);
        if (proc) {
          resumenFinal += ` Etapa diagnóstica: ${proc.etiquetaEtapa} (${proc.progresoPct}%).`;
          if (proc.clinica?.tieneIncidencia && proc.clinica.mensajeEstatus) {
            resumenFinal += ` Aviso de clínica (${proc.clinica.nombre}): ${proc.clinica.mensajeEstatus}`;
          }
        }
      }
      await this.meta.enviarTexto(msg.telefono, resumenFinal);
    } else if (textoLower === 'opt_resultados' || /\bresultados?\b/i.test(texto)) {
      await this.meta.enviarTexto(msg.telefono, i18n.flujo.resultadosInfo);
    } else if (textoLower === 'opt_cotizar' || textoLower === 'cotizar') {
      await this.meta.enviarTexto(msg.telefono, i18n.flujo.cotizarGuia);
    } else if (this.api.consultarAsistenteIa && textoLower !== 'btn_menu') {
      const iaRes = await this.api
        .consultarAsistenteIa({
          mensaje: texto,
          pacienteId: sesion.pacienteId,
          sesionId: `wa:${msg.telefono}`,
          idioma: sesion.idioma,
          modoSencillo: /f[aá]cil|no entiendo|simple|plain/i.test(texto),
        })
        .catch(() => null);

      if (iaRes) {
        sesion.idioma = iaRes.idioma;
        await this.meta.enviarTexto(msg.telefono, iaRes.respuesta);
        if (iaRes.mostrarMenu) {
          await this.enviarMenuPrincipal(msg.telefono, sesion.idioma);
        }
        sesion.paso = 'menu_principal';
      } else {
        await this.enviarMenuPrincipal(msg.telefono, sesion.idioma);
        sesion.paso = 'menu_principal';
      }
    } else {
      await this.enviarMenuPrincipal(msg.telefono, sesion.idioma);
      sesion.paso = 'menu_principal';
    }

    this.sesiones.guardar(sesion);
    return sesion;
  }

  /**
   * Envía recordatorio mediante plantilla aprobada cuando pasaron más de 24 h sin respuesta (#21).
   */
  async enviarRecordatorioSiExpiroVentana24h(telefono: string, folio: string): Promise<boolean> {
    await this.sesiones.hidratar(telefono);
    const sesion = this.sesiones.obtener(telefono);
    if (!sesion || !this.sesiones.expiroVentana24h(sesion)) {
      return false;
    }
    const plantillaIdioma = sesion.idioma === 'en' ? 'en' : 'es';
    await this.meta.enviarPlantilla(telefono, 'sd_tramite_pendiente', plantillaIdioma, [
      sesion.nombrePaciente ?? 'Paciente',
      folio,
    ]);
    return true;
  }

  private ofrecerHorarios(telefono: string, idioma: IdiomaBotWa) {
    const t = textosDe(idioma);
    return this.meta.enviarBotonesInteractivos(telefono, t.flujo.elegirHorario, [
      { id: 'btn_manana_9', titulo: t.botones.manana9 },
      { id: 'btn_manana_1130', titulo: t.botones.manana1130 },
      { id: 'btn_asesor', titulo: t.botones.hablarAsesor },
    ]);
  }

  private enviarMenuPrincipal(telefono: string, idioma: IdiomaBotWa) {
    const t = textosDe(idioma);
    return this.meta.enviarListaInteractiva(telefono, t.menu.cuerpo, t.menu.botonLista, [
      { id: 'opt_cotizar', titulo: t.menu.opciones.cotizar },
      { id: 'btn_continuar', titulo: t.menu.opciones.agendar },
      { id: 'opt_estatus', titulo: t.menu.opciones.estatus },
      { id: 'opt_resultados', titulo: t.menu.opciones.resultados },
      { id: 'opt_ubicacion', titulo: t.menu.opciones.ubicacion },
      { id: 'opt_recuperar', titulo: t.menu.opciones.recuperar },
      { id: 'btn_asesor', titulo: t.menu.opciones.asesor },
    ]);
  }

  private async registrarInteraccionSegura(
    pacienteId: string,
    tramiteId: string | null,
    resumen: string,
    referenciaExterna: string,
  ): Promise<void> {
    await this.api
      .registrarInteraccion({ pacienteId, tramiteId, resumen, referenciaExterna })
      .catch(() => undefined);
  }
}
