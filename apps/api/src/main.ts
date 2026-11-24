import http from 'node:http';
import { CANALES_ATENCION, ESTADOS_TRAMITE, TIPOS_EVENTO } from '@salud-digna/shared';

export interface ApiHealthStatus {
  servicio: 'api';
  estado: 'ok';
  canalesSoportados: readonly string[];
  estadosTramite: number;
  eventosCatalogo: number;
  timestamp: string;
}

export function crearEstadoSaludApi(): ApiHealthStatus {
  return {
    servicio: 'api',
    estado: 'ok',
    canalesSoportados: CANALES_ATENCION,
    estadosTramite: ESTADOS_TRAMITE.length,
    eventosCatalogo: TIPOS_EVENTO.length,
    timestamp: new Date().toISOString(),
  };
}

export function crearServidorApi(): http.Server {
  return http.createServer((req, res) => {
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(crearEstadoSaludApi()));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Ruta no encontrada' }));
  });
}

if (require.main === module) {
  const puerto = Number(process.env.PORT ?? 3000);
  const servidor = crearServidorApi();
  servidor.listen(puerto, () => {
    console.log(`[api] Núcleo escuchando en http://localhost:${puerto} (GET /health)`);
  });
}
