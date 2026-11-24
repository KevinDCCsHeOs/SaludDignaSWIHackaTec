import http from 'node:http';
import type { CanalAtencion } from '@salud-digna/shared';
import { TIPOS_EVENTO } from '@salud-digna/shared';

export const CANAL_BOT: CanalAtencion = 'whatsapp';

export function crearEstadoSaludBot() {
  return {
    servicio: 'whatsapp-bot',
    canal: CANAL_BOT,
    estado: 'ok',
    eventosConocidos: TIPOS_EVENTO.length,
    timestamp: new Date().toISOString(),
  };
}

export function crearServidorBot(): http.Server {
  return http.createServer((req, res) => {
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(crearEstadoSaludBot()));
      return;
    }

    // Regla de resiliencia: el webhook de Meta responde 200 de inmediato y procesa en cola (#20)
    if (req.url?.startsWith('/webhook') && req.method === 'POST') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ recibido: true, canal: CANAL_BOT }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Ruta no encontrada' }));
  });
}

if (require.main === module) {
  const puerto = Number(process.env.PORT ?? 3001);
  const servidor = crearServidorBot();
  servidor.listen(puerto, () => {
    console.log(`[whatsapp-bot] Escuchando en http://localhost:${puerto} (GET /health)`);
  });
}
