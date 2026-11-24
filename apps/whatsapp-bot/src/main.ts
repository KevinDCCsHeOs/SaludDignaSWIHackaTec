import http from 'node:http';
import type { CanalAtencion } from '@salud-digna/shared';
import { TIPOS_EVENTO } from '@salud-digna/shared';
import { ClienteApiOmnicanal, ClienteHttpApiBot } from './cloud-api/cliente-api';
import { ClienteMetaCloudApi } from './cloud-api/cliente-meta';
import { verificarFirmaMeta, verificarHandshakeWebhook } from './cloud-api/firma';
import { SesionWaStore } from './cloud-api/sesion-store';
import { MaquinaDialogoWhatsapp, MensajeEntranteWa } from './flujos/maquina-dialogo';
import {
  esIntencionRecuperacionAcceso,
  manejarRecuperacionAccesoWhatsapp,
} from './flujos/recuperacion-acceso';

export const CANAL_BOT: CanalAtencion = 'whatsapp';
export {
  ClienteHttpApiBot,
  ClienteMetaCloudApi,
  MaquinaDialogoWhatsapp,
  SesionWaStore,
  esIntencionRecuperacionAcceso,
  manejarRecuperacionAccesoWhatsapp,
  verificarFirmaMeta,
  verificarHandshakeWebhook,
};

interface PayloadWebhookMeta {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          id: string;
          from: string;
          type: string;
          text?: { body?: string };
          interactive?: {
            button_reply?: { id: string; title: string };
            list_reply?: { id: string; title: string };
          };
        }>;
        statuses?: Array<{
          id: string;
          status: string;
        }>;
      };
    }>;
  }>;
}

export function crearEstadoSaludBot() {
  return {
    servicio: 'whatsapp-bot',
    canal: CANAL_BOT,
    estado: 'ok',
    eventosConocidos: TIPOS_EVENTO.length,
    flujosHabilitados: ['webhook_cloud_api', 'dialogo_omnicanal', 'recuperacion_acceso'],
    timestamp: new Date().toISOString(),
  };
}

export interface OpcionesServidorBot {
  api?: ClienteApiOmnicanal;
  meta?: ClienteMetaCloudApi;
  sesiones?: SesionWaStore;
  verifyToken?: string;
  appSecret?: string;
}

function leerCuerpo(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export function extraerEventosWebhookMeta(payload: PayloadWebhookMeta): {
  mensajes: MensajeEntranteWa[];
  estados: Array<{ id: string; status: string }>;
} {
  const mensajes: MensajeEntranteWa[] = [];
  const estados: Array<{ id: string; status: string }> = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      for (const m of value?.messages ?? []) {
        const botonId =
          m.interactive?.button_reply?.id ?? m.interactive?.list_reply?.id ?? undefined;
        const texto =
          m.text?.body ??
          m.interactive?.button_reply?.title ??
          m.interactive?.list_reply?.title ??
          '';
        mensajes.push({
          messageId: m.id,
          telefono: m.from,
          texto,
          botonId,
        });
      }
      for (const s of value?.statuses ?? []) {
        estados.push({ id: s.id, status: s.status });
      }
    }
  }
  return { mensajes, estados };
}

export function crearServidorBot(opciones: OpcionesServidorBot = {}) {
  const api = opciones.api ?? new ClienteHttpApiBot();
  const meta = opciones.meta ?? new ClienteMetaCloudApi();
  const sesiones = opciones.sesiones ?? new SesionWaStore();
  const dialogo = new MaquinaDialogoWhatsapp(api, meta, sesiones);
  const verifyToken = opciones.verifyToken ?? process.env.WA_VERIFY_TOKEN ?? 'dev-wa-verify-token';
  const appSecret = opciones.appSecret ?? process.env.WA_APP_SECRET;

  const pendientesCola: Promise<void>[] = [];

  const server = http.createServer(async (req, res) => {
    const urlObj = new URL(req.url ?? '/', 'http://localhost');

    if (urlObj.pathname === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(crearEstadoSaludBot()));
      return;
    }

    // 1. Verificación GET del webhook de Meta Cloud API (#20)
    if (urlObj.pathname === '/webhook' && req.method === 'GET') {
      const handshake = verificarHandshakeWebhook(urlObj.searchParams, verifyToken);
      if (handshake.ok) {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(handshake.challenge);
        return;
      }
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Token de verificación inválido' }));
      return;
    }

    // 2. Recepción POST de mensajes/estados: valida firma, responde 200 al instante y encola (#20)
    if (urlObj.pathname === '/webhook' && req.method === 'POST') {
      const rawBody = await leerCuerpo(req);
      const firma = req.headers['x-hub-signature-256'] as string | undefined;

      if (!verificarFirmaMeta(rawBody, firma, appSecret)) {
        res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Firma X-Hub-Signature-256 inválida' }));
        return;
      }

      // Responder 200 OK de inmediato para que Meta no reintente (ADR 0005, #20)
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ recibido: true, canal: CANAL_BOT }));

      // Procesar en cola asíncrona con deduplicación por message.id
      const tarea = (async () => {
        try {
          const payload = JSON.parse(rawBody.toString('utf8')) as PayloadWebhookMeta;
          const { mensajes, estados } = extraerEventosWebhookMeta(payload);

          for (const st of estados) {
            sesiones.registrarEstadoEntrega(st.id, st.status);
            await api.actualizarEstadoEntrega(st.id, st.status).catch(() => undefined);
          }

          for (const msg of mensajes) {
            if (sesiones.yaFueProcesado(msg.messageId)) {
              continue;
            }
            sesiones.marcarProcesado(msg.messageId);
            await dialogo.procesarMensajeEntrante(msg);
          }
        } catch {
          // Nunca tumbar el servidor del webhook por un payload malformado
        }
      })();
      pendientesCola.push(tarea);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Ruta no encontrada' }));
  });

  return {
    server,
    meta,
    sesiones,
    dialogo,
    esperarCola: async () => {
      await Promise.allSettled(pendientesCola.splice(0, pendientesCola.length));
    },
  };
}

if (require.main === module) {
  const puerto = Number(process.env.PORT ?? 3001);
  const { server } = crearServidorBot();
  server.listen(puerto, () => {
    console.log(`[whatsapp-bot] Cloud API escuchando en http://localhost:${puerto} (/webhook)`);
  });
}
