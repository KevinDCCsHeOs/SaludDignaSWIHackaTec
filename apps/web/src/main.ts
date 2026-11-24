import http from 'node:http';
import type { CanalAtencion } from '@salud-digna/shared';
import { ROLES_USUARIO } from '@salud-digna/shared';
import { META_CANAL_VISUAL } from '@salud-digna/ui';

export const CANAL_WEB: CanalAtencion = 'web';

export function crearEstadoSaludWeb() {
  return {
    servicio: 'web',
    canal: CANAL_WEB,
    icono: META_CANAL_VISUAL[CANAL_WEB].icono,
    rolesSoportados: ROLES_USUARIO,
    estado: 'ok',
    timestamp: new Date().toISOString(),
  };
}

export function crearServidorWeb(): http.Server {
  return http.createServer((req, res) => {
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(crearEstadoSaludWeb()));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        aplicacion: 'salud-digna-web',
        canal: CANAL_WEB,
        mensaje: 'Base del portal web lista para Next.js (#18)',
      }),
    );
  });
}

if (require.main === module) {
  const puerto = Number(process.env.PORT ?? 3002);
  const servidor = crearServidorWeb();
  servidor.listen(puerto, () => {
    console.log(`[web] Escuchando en http://localhost:${puerto} (GET /health)`);
  });
}
