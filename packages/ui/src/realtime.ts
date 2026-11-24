/**
 * Configuración compartida de reconexión automática para clientes Socket.IO en web y app (#14).
 */
export const OPCIONES_RECONEXION_SOCKET = {
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 10000,
  randomizationFactor: 0.3,
  transports: ['websocket', 'polling'] as const,
};

export function crearConfigSocketCliente(url: string, accessToken: string) {
  return {
    url,
    options: {
      ...OPCIONES_RECONEXION_SOCKET,
      auth: { token: accessToken },
    },
  };
}
