import mensajesEn from '../i18n/en.json';
import mensajesEs from '../i18n/es.json';
import type { ClienteApiOmnicanal } from '../cloud-api/cliente-api';
import type { ClienteMetaCloudApi } from '../cloud-api/cliente-meta';
import type { SesionDialogoWa, SesionWaStore } from '../cloud-api/sesion-store';
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

function interpolar(plantilla: string, vars: Record<string, string>): string {
  return plantilla.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? '');
}

function textosDe(idioma: 'es' | 'en') {
  return idioma === 'en' ? mensajesEn : mensajesEs;
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

  async procesarMensajeEntrante(msg: MensajeEntranteWa): Promise<SesionDialogoWa> {
    const ahora = new Date().toISOString();
    const texto = (msg.botonId ?? msg.texto).trim();
    const textoLower = texto.toLowerCase();

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

    const i18n = textosDe(sesion.idioma);

    // 1. Comando global "asesor" / "humano" en cualquier momento (#21, #25)
    if (
      textoLower === 'asesor' ||
      textoLower === 'btn_asesor' ||
      /\b(hablar con asesor|asesor|humano)\b/i.test(texto)
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
      if (perfil.idioma === 'en') sesion.idioma = 'en';

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

    // 8. Menú y consultas rápidas (estatus, resultados, cotizar)
    if (textoLower === 'opt_estatus' || /\b(estatus|estado|c[oó]mo va)\b/i.test(texto)) {
      const ctx = sesion.pacienteId ? await this.api.obtenerContexto(sesion.pacienteId) : null;
      await this.meta.enviarTexto(
        msg.telefono,
        ctx
          ? interpolar(i18n.flujo.estatusResumen, { resumen: ctx.resumen })
          : i18n.flujo.estatusSinTramite,
      );
    } else if (textoLower === 'opt_resultados' || /\bresultados?\b/i.test(texto)) {
      await this.meta.enviarTexto(msg.telefono, i18n.flujo.resultadosInfo);
    } else if (textoLower === 'opt_cotizar' || /\bcotizar\b/i.test(texto)) {
      await this.meta.enviarTexto(msg.telefono, i18n.flujo.cotizarGuia);
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
    const sesion = this.sesiones.obtener(telefono);
    if (!sesion || !this.sesiones.expiroVentana24h(sesion)) {
      return false;
    }
    await this.meta.enviarPlantilla(telefono, 'sd_tramite_pendiente', sesion.idioma, [
      sesion.nombrePaciente ?? 'Paciente',
      folio,
    ]);
    return true;
  }

  private ofrecerHorarios(telefono: string, idioma: 'es' | 'en') {
    const t = textosDe(idioma);
    return this.meta.enviarBotonesInteractivos(telefono, t.flujo.elegirHorario, [
      { id: 'btn_manana_9', titulo: t.botones.manana9 },
      { id: 'btn_manana_1130', titulo: t.botones.manana1130 },
      { id: 'btn_asesor', titulo: t.botones.hablarAsesor },
    ]);
  }

  private enviarMenuPrincipal(telefono: string, idioma: 'es' | 'en') {
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
