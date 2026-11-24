import type { CanalAtencion, EstadoTramite, RolUsuario, TipoActor } from '@salud-digna/shared';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? API_URL;

export interface UsuarioSesion {
  id: string;
  email: string;
  nombre: string;
  rol: RolUsuario;
  region: string | null;
  pacienteId: string | null;
  permisos: string[];
}

export interface EstudioDto {
  id: string;
  codigo: string;
  nombre: string;
  categoria: string;
  precio: number;
  preparacion: string;
  duracionMinutos: number;
}

export interface ClinicaDto {
  id: string;
  codigo: string;
  nombre: string;
  direccion: string;
  lat: number;
  lng: number;
  region: string;
  telefono: string;
  estatus: 'operando' | 'retraso' | 'fuera_de_servicio';
  mensajeEstatus: string | null;
}

export interface TramiteDto {
  id: string;
  folio: string;
  pacienteId: string;
  estudioId: string | null;
  clinicaId: string | null;
  estado: EstadoTramite;
  pasoActual: string;
  ultimoCanal: CanalAtencion;
  contexto: {
    pasoActual: string;
    estudio: { id: string; nombre: string; precio: number } | null;
    clinica: { id: string; nombre: string; region?: string } | null;
    fechaTentativa: string | null;
    pendientes: string[];
    ultimoCanal: CanalAtencion;
    actualizadoEn: string;
  };
  cita: {
    id: string;
    clinicaId: string;
    fechaHora: string;
    estatus: string;
    codigoConfirmacion: string;
  } | null;
  actualizadoEn: string;
}

export interface EntradaTimelineDto {
  eventId: string;
  fecha: string;
  canal: CanalAtencion;
  icono: string;
  actor: string;
  actorTipo: TipoActor;
  accion: string;
  estado: string | null;
}

export interface TicketDto {
  id: string;
  folio: string;
  pacienteId: string;
  tramiteId: string | null;
  canalOrigen: CanalAtencion;
  tipo: string;
  prioridad: string;
  estatus: string;
  nivelEscalamiento: string;
  region: string;
  asignadoAId: string | null;
  resumenIa: string | null;
  slaVenceEn: string;
  slaVencido: boolean;
}

export interface PacienteResumenDto {
  id: string;
  nombre: string;
  apellidos: string;
  email: string | null;
  telefonoE164: string | null;
  curp: string | null;
  fechaNacimiento: string | null;
  canalPreferido: CanalAtencion;
  idioma: string;
  region: string | null;
  folioCoincidente?: string;
}

async function pedirApi<T>(
  ruta: string,
  opciones: { method?: string; token?: string | null; body?: unknown; canal?: CanalAtencion } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-canal': opciones.canal ?? 'web',
  };
  if (opciones.token) {
    headers.Authorization = `Bearer ${opciones.token}`;
  }

  const res = await fetch(`${API_URL}${ruta}`, {
    method: opciones.method ?? 'GET',
    headers,
    body: opciones.body !== undefined ? JSON.stringify(opciones.body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const mensaje =
      typeof data?.message === 'string'
        ? data.message
        : Array.isArray(data?.message)
          ? data.message.join(', ')
          : `Error HTTP ${res.status}`;
    throw new Error(mensaje);
  }
  return data as T;
}

export const apiWeb = {
  login: (email: string, contrasena: string) =>
    pedirApi<{ accessToken: string; refreshToken: string; usuario: UsuarioSesion }>('/auth/login', {
      method: 'POST',
      body: { email, contrasena },
    }),

  listarEstudios: (categoria?: string, q?: string) => {
    const params = new URLSearchParams();
    if (categoria) params.set('categoria', categoria);
    if (q) params.set('q', q);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return pedirApi<{ total: number; estudios: EstudioDto[] }>(`/catalogos/estudios${qs}`);
  },

  listarClinicas: (region?: string) => {
    const qs = region ? `?region=${encodeURIComponent(region)}` : '';
    return pedirApi<{ total: number; clinicas: ClinicaDto[] }>(`/catalogos/clinicas${qs}`);
  },

  crearTramite: (
    token: string,
    body: { pacienteId: string; canal: CanalAtencion; estudioId?: string },
  ) => pedirApi<TramiteDto>('/tramites', { method: 'POST', token, body }),

  listarTramitesPaciente: (token: string, pacienteId: string, soloActivos = false) =>
    pedirApi<{ total: number; tramites: TramiteDto[] }>(
      `/pacientes/${pacienteId}/tramites${soloActivos ? '?activo=true' : ''}`,
      { token },
    ),

  obtenerTramite: (token: string, idOFolio: string) =>
    pedirApi<TramiteDto>(`/tramites/${encodeURIComponent(idOFolio)}`, { token }),

  autoguardarContexto: (
    token: string,
    tramiteId: string,
    body: {
      canal: CanalAtencion;
      estudioId?: string;
      clinicaId?: string;
      fechaTentativa?: string | null;
      pendientes?: string[];
    },
  ) =>
    pedirApi<{ tramite: TramiteDto; resumen: string }>(`/tramites/${tramiteId}/contexto`, {
      method: 'PATCH',
      token,
      body,
    }),

  obtenerContextoPaciente: (token: string, pacienteId: string) =>
    pedirApi<{
      tramiteId: string;
      folio: string;
      estado: EstadoTramite;
      contexto: TramiteDto['contexto'];
      resumen: string;
    }>(`/pacientes/${pacienteId}/contexto`, { token }),

  avanzarTramite: (
    token: string,
    tramiteId: string,
    body: {
      estadoDestino: EstadoTramite;
      canal: CanalAtencion;
      clinicaId?: string;
      fechaHora?: string;
    },
  ) => pedirApi<TramiteDto>(`/tramites/${tramiteId}/avanzar`, { method: 'POST', token, body }),

  retomarTramite: (token: string, tramiteId: string, canal: CanalAtencion) =>
    pedirApi<TramiteDto>(`/tramites/${tramiteId}/retomar`, {
      method: 'POST',
      token,
      body: { canal },
    }),

  obtenerTimeline: (token: string, pacienteId: string, tramiteId?: string) => {
    const qs = tramiteId ? `?tramiteId=${encodeURIComponent(tramiteId)}` : '';
    return pedirApi<{ total: number; items: EntradaTimelineDto[] }>(
      `/pacientes/${pacienteId}/timeline${qs}`,
      { token },
    );
  },

  buscarPacientes: (token: string, q: string) =>
    pedirApi<{ total: number; pacientes: PacienteResumenDto[] }>(
      `/identidad/pacientes/buscar?q=${encodeURIComponent(q)}`,
      { token, canal: 'call_center' },
    ),

  verificarCallCenter: (
    token: string,
    body: { pacienteId: string; fechaNacimiento: string; ultimosDigitosTelefono: string },
  ) =>
    pedirApi<{ verificado: true; sesionValidaHasta: string }>('/otp/verificar-call-center', {
      method: 'POST',
      token,
      canal: 'call_center',
      body,
    }),

  listarTickets: (token: string, region?: string) => {
    const qs = region ? `?region=${encodeURIComponent(region)}` : '';
    return pedirApi<{ total: number; tickets: TicketDto[] }>(`/tickets${qs}`, {
      token,
      canal: 'call_center',
    });
  },

  crearTicket: (
    token: string,
    body: {
      pacienteId: string;
      tramiteId?: string | null;
      canalOrigen: CanalAtencion;
      tipo: string;
      region: string;
      resumenIa?: string;
    },
  ) => pedirApi<TicketDto>('/tickets', { method: 'POST', token, body }),

  resolverTicket: (token: string, ticketId: string, resolucion: string) =>
    pedirApi<TicketDto>(`/tickets/${ticketId}/resolver`, {
      method: 'POST',
      token,
      canal: 'call_center',
      body: { resolucion },
    }),

  escalarTicket: (token: string, ticketId: string, motivo: string) =>
    pedirApi<TicketDto>(`/tickets/${ticketId}/escalar`, {
      method: 'POST',
      token,
      canal: 'call_center',
      body: { motivo },
    }),

  registrarLlamada: (
    token: string,
    body: {
      pacienteId: string;
      tramiteId?: string | null;
      motivo: string;
      notas: string;
      resultado: string;
      duracionSegundos: number;
    },
  ) =>
    pedirApi('/canales/llamadas', {
      method: 'POST',
      token,
      canal: 'call_center',
      body,
    }),

  simularCorreoEntrante: (body: {
    remitente: string;
    asunto: string;
    cuerpo: string;
    region?: string;
  }) =>
    pedirApi<{
      pacienteId: string;
      ticket: TicketDto;
      acuseAutomatico: { asunto: string; cuerpo: string };
    }>('/canales/email/entrante', {
      method: 'POST',
      canal: 'email',
      body,
    }),

  asistirRecuperacion: (token: string, pacienteId: string, canal: CanalAtencion = 'email') =>
    pedirApi<{ enviado: true; mensaje: string }>('/auth/asistir-recuperacion', {
      method: 'POST',
      token,
      canal: 'call_center',
      body: { pacienteId, canal },
    }),
};
