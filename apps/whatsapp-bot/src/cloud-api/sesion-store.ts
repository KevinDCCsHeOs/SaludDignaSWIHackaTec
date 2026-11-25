import { createHash } from 'node:crypto';

export type PasoDialogoWa =
  | 'inicio'
  | 'esperando_otp'
  | 'ofreciendo_retomar'
  | 'eligiendo_horario'
  | 'menu_principal'
  | 'recuperacion_otp';

export type IdiomaBotWa = 'es' | 'en' | 'nah';

export interface SesionDialogoWa {
  telefono: string;
  pacienteId: string | null;
  nombrePaciente: string | null;
  tramiteId: string | null;
  clinicaId: string | null;
  paso: PasoDialogoWa;
  pasoInterrumpido: PasoDialogoWa | null;
  idioma: IdiomaBotWa;
  ultimoMensajeEn: string;
}

const TTL_SESION_WA_MS = 24 * 60 * 60 * 1000; // Ventana de servicio 24 h (#21)

/** Persistencia externa de la conversación (el API, que la guarda en Redis con TTL de 24 h). */
export interface PersistenciaSesionWa {
  obtener(clave: string): Promise<SesionDialogoWa | null>;
  guardar(clave: string, sesion: SesionDialogoWa): Promise<void>;
}

/** Límite de IDs recordados para deduplicar reintentos de Meta sin crecer sin fin. */
const MAX_MENSAJES_PROCESADOS = 5000;

/**
 * Almacén de sesiones `wa:sesion:{telefono}` (TTL 24 h) y deduplicación por `message.id` (#20, #21).
 * Mantiene los estados de entrega reportados por Meta (`sent`, `delivered`, `read`).
 *
 * La memoria es la caché caliente; si hay `persistencia`, cada cambio se escribe también en el API
 * y una conversación que no está en memoria (bot reiniciado o redeploy) se recupera de ahí (#39).
 */
export class SesionWaStore {
  private readonly sesiones = new Map<string, { datos: SesionDialogoWa; expiraEn: number }>();
  private readonly mensajesProcesados = new Set<string>();
  private readonly estadosEntrega = new Map<string, string>();
  private readonly escrituras = new Map<string, Promise<void>>();

  constructor(private readonly persistencia?: PersistenciaSesionWa) {}

  /** Clave externa: SHA-256 del teléfono, para que el número nunca quede en claves de Redis. */
  static claveExterna(telefono: string): string {
    return createHash('sha256').update(telefono).digest('hex');
  }

  /** Trae la conversación del API si no está en memoria. Si el API falla, se continúa sin ella. */
  async hidratar(telefono: string): Promise<void> {
    if (!this.persistencia || this.obtener(telefono)) return;
    try {
      const sesion = await this.persistencia.obtener(SesionWaStore.claveExterna(telefono));
      if (sesion && sesion.telefono === telefono && !this.expiroVentana24h(sesion)) {
        this.sesiones.set(this.claveSesion(telefono), {
          datos: sesion,
          expiraEn: Date.parse(sesion.ultimoMensajeEn) + TTL_SESION_WA_MS,
        });
      }
    } catch (error) {
      console.error(
        `[whatsapp-bot] No se pudo recuperar la conversación: ${(error as Error).message}`,
      );
    }
  }

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
    if (this.persistencia) {
      this.persistirEnOrden(sesion);
    }
  }

  /**
   * Las escrituras de un mismo teléfono se encadenan para que una respuesta lenta del API
   * no sobrescriba un estado más nuevo con uno viejo.
   */
  private persistirEnOrden(sesion: SesionDialogoWa): void {
    const persistencia = this.persistencia!;
    const clave = SesionWaStore.claveExterna(sesion.telefono);
    const copia = { ...sesion };
    const anterior = this.escrituras.get(clave) ?? Promise.resolve();
    const actual = anterior
      .then(() => persistencia.guardar(clave, copia))
      .catch((error: unknown) => {
        console.error(
          `[whatsapp-bot] No se pudo guardar la conversación: ${(error as Error).message}`,
        );
      });
    this.escrituras.set(clave, actual);
    void actual.finally(() => {
      if (this.escrituras.get(clave) === actual) this.escrituras.delete(clave);
    });
  }

  /** Espera a que terminen las escrituras pendientes (pruebas y apagado ordenado). */
  async esperarEscrituras(): Promise<void> {
    await Promise.allSettled([...this.escrituras.values()]);
  }

  yaFueProcesado(messageId: string): boolean {
    return this.mensajesProcesados.has(messageId);
  }

  marcarProcesado(messageId: string): void {
    this.mensajesProcesados.add(messageId);
    if (this.mensajesProcesados.size > MAX_MENSAJES_PROCESADOS) {
      // Set conserva el orden de inserción: se descarta el más antiguo
      const masAntiguo = this.mensajesProcesados.values().next().value;
      if (masAntiguo !== undefined) this.mensajesProcesados.delete(masAntiguo);
    }
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
