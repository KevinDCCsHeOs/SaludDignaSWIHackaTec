export interface BotonInteractivoWa {
  id: string;
  titulo: string;
}

export interface FilaListaWa {
  id: string;
  titulo: string;
  descripcion?: string;
}

export interface MensajeSalienteWa {
  id: string;
  para: string;
  tipo: 'text' | 'interactive_buttons' | 'interactive_list' | 'location' | 'template';
  payload: Record<string, unknown>;
  enviadoEn: string;
  simulado: boolean;
}

/**
 * Meta entrega los números móviles de México en el webhook con el prefijo obsoleto `521`
 * (13 dígitos), pero rechaza enviar a ese formato (error 131030 con números de prueba).
 * Para responder hay que usar `52` + 10 dígitos.
 */
export function telefonoParaEnvioMeta(telefono: string): string {
  const digitos = telefono.replace(/\D/g, '');
  if (digitos.length === 13 && digitos.startsWith('521')) {
    return `52${digitos.slice(3)}`;
  }
  return digitos;
}

interface RespuestaGraphMeta {
  messages?: Array<{ id: string }>;
  error?: {
    code?: number;
    type?: string;
    error_subcode?: number;
    error_data?: { details?: string };
  };
}

export type PlantillaOficialWa =
  'sd_codigo_verificacion' | 'sd_recordatorio_cita' | 'sd_tramite_pendiente';

/**
 * Cliente para Meta WhatsApp Business Platform (Cloud API v21.0, #20).
 * Soporta texto, botones (máx. 3), listas (máx. 10), ubicación (`location`) y plantillas aprobadas.
 * Si no hay token real de Meta en el entorno, opera en modo simulado seguro para pruebas y demo offline.
 */
export class ClienteMetaCloudApi {
  private readonly historial: MensajeSalienteWa[] = [];
  private secuencia = 1;

  constructor(
    private readonly config: {
      phoneNumberId?: string;
      accessToken?: string;
      graphVersion?: string;
    } = {},
  ) {}

  private estaConfiguradoReal(): boolean {
    const token = this.config.accessToken ?? process.env.WA_ACCESS_TOKEN;
    const phoneId = this.config.phoneNumberId ?? process.env.WA_PHONE_NUMBER_ID;
    return Boolean(
      token &&
      phoneId &&
      !token.startsWith('REEMPLAZAR') &&
      !phoneId.startsWith('REEMPLAZAR') &&
      process.env.NODE_ENV !== 'test',
    );
  }

  private async despachar(
    para: string,
    tipo: MensajeSalienteWa['tipo'],
    payload: Record<string, unknown>,
  ): Promise<MensajeSalienteWa> {
    const ahora = new Date().toISOString();
    const idSimulado = `wamid.out.${this.secuencia++}`;

    if (this.estaConfiguradoReal()) {
      const phoneId = this.config.phoneNumberId ?? process.env.WA_PHONE_NUMBER_ID;
      const token = this.config.accessToken ?? process.env.WA_ACCESS_TOKEN;
      const version = this.config.graphVersion ?? 'v21.0';
      const resp = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: telefonoParaEnvioMeta(para),
          ...payload,
        }),
      });
      const json = (await resp.json().catch(() => ({}))) as RespuestaGraphMeta;
      if (!resp.ok || json.error) {
        // Solo códigos de error: nunca el teléfono, el texto del mensaje ni el token (LFPDPPP).
        console.error(
          `[whatsapp-bot] Meta rechazó el envío (${tipo}): HTTP ${resp.status}, ` +
            `código ${json.error?.code ?? 'n/d'}, subcódigo ${json.error?.error_subcode ?? 'n/d'}, ` +
            `tipo ${json.error?.type ?? 'n/d'}`,
        );
      }
      const registro: MensajeSalienteWa = {
        id: json.messages?.[0]?.id ?? idSimulado,
        para,
        tipo,
        payload,
        enviadoEn: ahora,
        simulado: false,
      };
      this.historial.push(registro);
      return registro;
    }

    const registro: MensajeSalienteWa = {
      id: idSimulado,
      para,
      tipo,
      payload,
      enviadoEn: ahora,
      simulado: true,
    };
    this.historial.push(registro);
    return registro;
  }

  enviarTexto(para: string, cuerpo: string): Promise<MensajeSalienteWa> {
    return this.despachar(para, 'text', {
      type: 'text',
      text: { body: cuerpo },
    });
  }

  /** Botones interactivos de WhatsApp Cloud API (máximo 3 botones según especificación de Meta). */
  enviarBotonesInteractivos(
    para: string,
    cuerpo: string,
    botones: readonly BotonInteractivoWa[],
  ): Promise<MensajeSalienteWa> {
    const limitados = botones.slice(0, 3).map((b) => ({
      type: 'reply',
      reply: { id: b.id, title: b.titulo.slice(0, 20) },
    }));
    return this.despachar(para, 'interactive_buttons', {
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: cuerpo },
        action: { buttons: limitados },
      },
    });
  }

  /** Lista interactiva de WhatsApp Cloud API (máximo 10 filas). */
  enviarListaInteractiva(
    para: string,
    cuerpo: string,
    tituloBoton: string,
    filas: readonly FilaListaWa[],
  ): Promise<MensajeSalienteWa> {
    const limitadas = filas.slice(0, 10).map((f) => ({
      id: f.id,
      title: f.titulo.slice(0, 24),
      ...(f.descripcion ? { description: f.descripcion.slice(0, 72) } : {}),
    }));
    return this.despachar(para, 'interactive_list', {
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: cuerpo },
        action: {
          button: tituloBoton.slice(0, 20),
          sections: [{ title: 'Opciones', rows: limitadas }],
        },
      },
    });
  }

  /** Mensaje nativo de ubicación de clínica (`type: 'location'`, #21). */
  enviarUbicacionClinica(
    para: string,
    clinica: { nombre: string; direccion: string; lat: number; lng: number },
  ): Promise<MensajeSalienteWa> {
    return this.despachar(para, 'location', {
      type: 'location',
      location: {
        latitude: clinica.lat,
        longitude: clinica.lng,
        name: clinica.nombre,
        address: clinica.direccion,
      },
    });
  }

  /** Envío de plantillas aprobadas (OTP, recordatorio de cita o seguimiento fuera de ventana 24 h). */
  enviarPlantilla(
    para: string,
    plantilla: PlantillaOficialWa,
    idioma: 'es' | 'en' = 'es',
    parametros: readonly string[] = [],
  ): Promise<MensajeSalienteWa> {
    return this.despachar(para, 'template', {
      type: 'template',
      template: {
        name: plantilla,
        language: { code: idioma === 'en' ? 'en_US' : 'es_MX' },
        components:
          parametros.length > 0
            ? [
                {
                  type: 'body',
                  parameters: parametros.map((text) => ({ type: 'text', text })),
                },
              ]
            : [],
      },
    });
  }

  obtenerHistorial(): readonly MensajeSalienteWa[] {
    return this.historial;
  }

  limpiarHistorial(): void {
    this.historial.length = 0;
  }
}
