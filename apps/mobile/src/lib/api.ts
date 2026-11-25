import type { CanalAtencion, EstadoTramite, TipoActor } from '@salud-digna/shared';

export const API_URL_MOBILE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export interface TramiteMobileDto {
  id: string;
  folio: string;
  pacienteId: string;
  estado: EstadoTramite;
  ultimoCanal: CanalAtencion;
  contexto: {
    pasoActual: string;
    estudio: { id: string; nombre: string; precio: number } | null;
    clinica: { id: string; nombre: string } | null;
    pendientes: string[];
  };
  cita: {
    id: string;
    fechaHora: string;
    estatus: string;
    codigoConfirmacion: string;
  } | null;
}

export interface TimelineMobileDto {
  eventId: string;
  fecha: string;
  canal: CanalAtencion;
  actor: string;
  actorTipo: TipoActor;
  accion: string;
  estado: string | null;
}

async function pedir<T>(
  ruta: string,
  opts: { method?: string; token?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-canal': 'app',
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

  const res = await fetch(`${API_URL_MOBILE}${ruta}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data?.message === 'string' ? data.message : `HTTP ${res.status}`);
  }
  return data as T;
}

export const apiMobile = {
  login: (email: string, contrasena: string) =>
    pedir<{
      accessToken: string;
      refreshToken: string;
      usuario: {
        id: string;
        email: string;
        nombre: string;
        rol: string;
        pacienteId: string | null;
      };
    }>('/auth/login', { method: 'POST', body: { email, contrasena } }),

  solicitarOtp: (token: string, pacienteId: string) =>
    pedir('/otp/solicitar', { method: 'POST', token, body: { pacienteId, canal: 'app' } }),

  verificarOtp: (token: string, pacienteId: string, codigo: string) =>
    pedir('/otp/verificar', { method: 'POST', token, body: { pacienteId, canal: 'app', codigo } }),

  listarTramites: (token: string, pacienteId: string) =>
    pedir<{ total: number; tramites: TramiteMobileDto[] }>(`/pacientes/${pacienteId}/tramites`, {
      token,
    }),

  obtenerTramite: (token: string, folio: string) =>
    pedir<TramiteMobileDto>(`/tramites/${encodeURIComponent(folio)}`, { token }),

  obtenerTimeline: (token: string, pacienteId: string, tramiteId?: string) => {
    const qs = tramiteId ? `?tramiteId=${encodeURIComponent(tramiteId)}` : '';
    return pedir<{ items: TimelineMobileDto[] }>(`/pacientes/${pacienteId}/timeline${qs}`, {
      token,
    });
  },

  registrarPushToken: (
    token: string,
    body: { pacienteId: string; expoPushToken: string; plataforma: 'android' | 'ios' },
  ) => pedir('/canales/push-tokens', { method: 'POST', token, body }),

  obtenerEstatusServicio: (region?: string) => {
    const qs = region ? `?region=${encodeURIComponent(region)}` : '';
    return pedir<{
      incidencias: Array<{
        clinicaId: string;
        nombre: string;
        estatus: string;
        mensaje: string;
      }>;
    }>(`/servicio/estatus${qs}`);
  },
};
