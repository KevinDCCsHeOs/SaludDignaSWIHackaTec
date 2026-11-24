export type PasoDialogoWa =
  | 'inicio'
  | 'esperando_otp'
  | 'ofreciendo_retomar'
  | 'eligiendo_horario'
  | 'menu_principal'
  | 'recuperacion_otp';

export interface SesionDialogoWa {
  telefono: string;
  pacienteId: string | null;
  nombrePaciente: string | null;
  tramiteId: string | null;
  clinicaId: string | null;
  paso: PasoDialogoWa;
  pasoInterrumpido: PasoDialogoWa | null;
  idioma: 'es' | 'en';
  ultimoMensajeEn: string;
}

const TTL_SESION_WA_MS = 24 * 60 * 60 * 1000; // Ventana de servicio 24 h (#21)

/**
 * Almacén de sesiones `wa:sesion:{telefono}` (TTL 24 h) y deduplicación por `message.id` (#20, #21).
 * Mantiene los estados de entrega reportados por Meta (`sent`, `delivered`, `read`).
 */
export class SesionWaStore {
  private readonly sesiones = new Map<string, { datos: SesionDialogoWa; expiraEn: number }>();
  private readonly mensajesProcesados = new Set<string>();
  private readonly estadosEntrega = new Map<string, string>();

  claveSesion(telefono: string): string {
    return `wa:sesion:${telefono}`;
  }

  obtener(telefono: string): SesionDialogoWa | null {
    const clave = this.claveSesion(telefono);
    const entrada = this.sesiones.get(clave);
    if (!entrada) return null;
    if (Date.now() >= entrada.expiraEn) {
      this.sesiones.delete(clave);
      return null;
    }
    return entrada.datos;
  }

  guardar(sesion: SesionDialogoWa): void {
    const clave = this.claveSesion(sesion.telefono);
    this.sesiones.set(clave, {
      datos: sesion,
      expiraEn: Date.now() + TTL_SESION_WA_MS,
    });
  }

  yaFueProcesado(messageId: string): boolean {
    return this.mensajesProcesados.has(messageId);
  }

  marcarProcesado(messageId: string): void {
    this.mensajesProcesados.add(messageId);
  }

  registrarEstadoEntrega(messageId: string, estado: string): void {
    this.estadosEntrega.set(messageId, estado);
  }

  obtenerEstadoEntrega(messageId: string): string | undefined {
    return this.estadosEntrega.get(messageId);
  }

  expiroVentana24h(sesion: SesionDialogoWa, ahoraMs = Date.now()): boolean {
    return ahoraMs - Date.parse(sesion.ultimoMensajeEn) > TTL_SESION_WA_MS;
  }
}
