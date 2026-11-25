import type { CanalAtencion, EstadoResolucionIdentidad } from '@salud-digna/shared';

export interface ContextoPacienteApi {
  pacienteId: string;
  tramiteId: string;
  folio: string;
  estado: string;
  contexto: {
    pasoActual: string;
    estudio: { id: string; nombre: string; precio: number } | null;
    clinica: { id: string; nombre: string; region?: string } | null;
    pendientes: string[];
  };
  resumen: string;
}

export interface ClinicaApi {
  id: string;
  nombre: string;
  direccion: string;
  lat: number;
  lng: number;
  region: string;
}

export interface RespuestaIaBotApi {
  intencion: string;
  confianza: number;
  idioma: 'es' | 'en' | 'nah';
  respuesta: string;
  mostrarMenu: boolean;
  guardrailActivado: 'ninguno' | 'no_diagnostico' | 'urgencia_911';
  escalamiento: {
    requerido: boolean;
    motivo: string;
    prioridad: string;
    tiempoEsperaMinutos: number;
    ticketFolio: string | null;
  } | null;
}

export interface ClienteApiOmnicanal {
  resolverIdentidad(
    canal: CanalAtencion,
    identificador: string,
  ): Promise<{ estado: EstadoResolucionIdentidad; pacienteId?: string }>;
  solicitarOtp(pacienteId: string, canal: CanalAtencion): Promise<{ enviado: boolean }>;
  verificarOtp(
    pacienteId: string,
    canal: CanalAtencion,
    codigo: string,
  ): Promise<{ verificado: boolean }>;
  vincularIdentidad(
    pacienteId: string,
    canal: CanalAtencion,
    identificador: string,
  ): Promise<unknown>;
  obtenerPerfilVerificado(pacienteId: string): Promise<{ nombre: string; idioma?: string }>;
  obtenerContexto(pacienteId: string): Promise<ContextoPacienteApi | null>;
  retomarTramite(tramiteId: string, canal: CanalAtencion): Promise<unknown>;
  agendarCita(
    tramiteId: string,
    fechaHora: string,
    clinicaId?: string,
  ): Promise<{ folio: string; cita?: { codigoConfirmacion?: string } }>;
  obtenerClinica(clinicaId: string): Promise<ClinicaApi | null>;
  crearTicketEscalamiento(entrada: {
    pacienteId: string;
    tramiteId?: string | null;
    region: string;
    resumenIa: string;
    tipo?: 'duda' | 'queja' | 'urgencia';
    prioridad?: 'baja' | 'media' | 'alta' | 'critica';
  }): Promise<{ folio: string }>;
  consultarAsistenteIa?(entrada: {
    mensaje: string;
    pacienteId?: string | null;
    sesionId?: string;
    idioma?: 'es' | 'en' | 'nah';
    modoSencillo?: boolean;
  }): Promise<RespuestaIaBotApi>;
  actualizarIdiomaPaciente?(pacienteId: string, idioma: 'es' | 'en' | 'nah'): Promise<unknown>;
  registrarInteraccion(entrada: {
    pacienteId: string;
    tramiteId?: string | null;
    resumen: string;
    referenciaExterna?: string;
  }): Promise<unknown>;
  actualizarEstadoEntrega(messageId: string, estado: string): Promise<unknown>;
  solicitarEnlaceRecuperacion(
    telefono: string,
    canal: CanalAtencion,
  ): Promise<{ enviado: boolean }>;
}

/**
 * Cliente HTTP oficial del bot de WhatsApp hacia `apps/api` (ADR 0005).
 * Nunca accede a MySQL: autentica con `x-service-token` y declara `x-canal: whatsapp`.
 */
export class ClienteHttpApiBot implements ClienteApiOmnicanal {
  constructor(
    private readonly baseUrl = process.env.API_BASE_URL ?? 'http://localhost:3000',
    private readonly serviceToken = process.env.API_SERVICE_TOKEN ??
      'dev-api-service-token-not-for-prod',
  ) {}

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-service-token': this.serviceToken,
      'x-canal': 'whatsapp',
    };
  }

  private async pedir<T>(ruta: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${ruta}`, {
      ...init,
      headers: { ...this.headers(), ...(init?.headers ?? {}) },
    });
    if (!res.ok) {
      throw new Error(`API ${ruta} respondió ${res.status}`);
    }
    return (await res.json()) as T;
  }

  resolverIdentidad(canal: CanalAtencion, identificador: string) {
    return this.pedir<{ estado: EstadoResolucionIdentidad; pacienteId?: string }>(
      '/identidad/resolver',
      { method: 'POST', body: JSON.stringify({ canal, identificador }) },
    );
  }

  solicitarOtp(pacienteId: string, canal: CanalAtencion) {
    return this.pedir<{ enviado: boolean }>('/otp/solicitar', {
      method: 'POST',
      body: JSON.stringify({ pacienteId, canal }),
    });
  }

  verificarOtp(pacienteId: string, canal: CanalAtencion, codigo: string) {
    return this.pedir<{ verificado: boolean }>('/otp/verificar', {
      method: 'POST',
      body: JSON.stringify({ pacienteId, canal, codigo }),
    });
  }

  vincularIdentidad(pacienteId: string, canal: CanalAtencion, identificador: string) {
    return this.pedir('/identidad/vincular', {
      method: 'POST',
      body: JSON.stringify({
        pacienteId,
        canal,
        identificador,
        metodoVerificacion: 'otp_whatsapp',
      }),
    });
  }

  obtenerPerfilVerificado(pacienteId: string) {
    return this.pedir<{ nombre: string; idioma?: string }>(
      `/identidad/pacientes/${pacienteId}/contexto-seguro`,
    );
  }

  async obtenerContexto(pacienteId: string): Promise<ContextoPacienteApi | null> {
    try {
      return await this.pedir<ContextoPacienteApi>(`/pacientes/${pacienteId}/contexto`);
    } catch {
      return null;
    }
  }

  retomarTramite(tramiteId: string, canal: CanalAtencion) {
    return this.pedir(`/tramites/${tramiteId}/retomar`, {
      method: 'POST',
      body: JSON.stringify({ canal }),
    });
  }

  agendarCita(tramiteId: string, fechaHora: string, clinicaId?: string) {
    return this.pedir<{ folio: string; cita?: { codigoConfirmacion?: string } }>(
      `/tramites/${tramiteId}/avanzar`,
      {
        method: 'POST',
        body: JSON.stringify({
          estadoDestino: 'cita_agendada',
          canal: 'whatsapp',
          fechaHora,
          ...(clinicaId ? { clinicaId } : {}),
        }),
      },
    );
  }

  async obtenerClinica(clinicaId: string): Promise<ClinicaApi | null> {
    try {
      return await this.pedir<ClinicaApi>(`/catalogos/clinicas/${clinicaId}`);
    } catch {
      return null;
    }
  }

  crearTicketEscalamiento(entrada: {
    pacienteId: string;
    tramiteId?: string | null;
    region: string;
    resumenIa: string;
    tipo?: 'duda' | 'queja' | 'urgencia';
    prioridad?: 'baja' | 'media' | 'alta' | 'critica';
  }) {
    return this.pedir<{ folio: string }>('/tickets', {
      method: 'POST',
      body: JSON.stringify({
        pacienteId: entrada.pacienteId,
        tramiteId: entrada.tramiteId ?? null,
        canalOrigen: 'whatsapp',
        tipo: entrada.tipo ?? 'duda',
        prioridad: entrada.prioridad ?? 'alta',
        region: entrada.region,
        resumenIa: entrada.resumenIa,
      }),
    });
  }

  consultarAsistenteIa(entrada: {
    mensaje: string;
    pacienteId?: string | null;
    sesionId?: string;
    idioma?: 'es' | 'en' | 'nah';
    modoSencillo?: boolean;
  }) {
    return this.pedir<RespuestaIaBotApi>('/ia/mensaje', {
      method: 'POST',
      body: JSON.stringify({
        mensaje: entrada.mensaje,
        canal: 'whatsapp',
        pacienteId: entrada.pacienteId ?? null,
        sesionId: entrada.sesionId,
        idioma: entrada.idioma,
        modoSencillo: entrada.modoSencillo ?? false,
      }),
    });
  }

  actualizarIdiomaPaciente(pacienteId: string, idioma: 'es' | 'en' | 'nah') {
    return this.pedir(`/identidad/pacientes/${pacienteId}/idioma`, {
      method: 'PATCH',
      body: JSON.stringify({ idioma }),
    });
  }

  registrarInteraccion(entrada: {
    pacienteId: string;
    tramiteId?: string | null;
    resumen: string;
    referenciaExterna?: string;
  }) {
    return this.pedir('/canales/interacciones', {
      method: 'POST',
      body: JSON.stringify({
        pacienteId: entrada.pacienteId,
        tramiteId: entrada.tramiteId ?? null,
        canal: 'whatsapp',
        actorTipo: 'paciente',
        actorId: entrada.pacienteId,
        resumen: entrada.resumen,
        referenciaExterna: entrada.referenciaExterna ?? null,
      }),
    });
  }

  actualizarEstadoEntrega(messageId: string, estado: string) {
    return this.pedir('/canales/interacciones/estado-entrega', {
      method: 'POST',
      body: JSON.stringify({ canal: 'whatsapp', referenciaExterna: messageId, estado }),
    });
  }

  solicitarEnlaceRecuperacion(telefono: string, canal: CanalAtencion) {
    return this.pedir<{ enviado: boolean }>('/auth/recuperar', {
      method: 'POST',
      body: JSON.stringify({ telefono, canal }),
    });
  }
}
