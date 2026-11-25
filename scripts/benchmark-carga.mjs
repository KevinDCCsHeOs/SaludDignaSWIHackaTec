/**
 * Benchmark reproducible de carga local (#37) que levanta el API real y el webhook del bot
 * y mide p50, p95, p99, throughput y tasa de error para:
 *   (a) 200 usuarios concurrentes consultando contexto y catálogos cacheados
 *   (b) Ráfaga de 100+ mensajes/s firmados HMAC-SHA256 al webhook de WhatsApp
 *   (c) 150–300 conexiones Socket.IO concurrentes autenticadas con JWT
 */
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';

process.env.NODE_ENV = 'test';

const require = createRequire(import.meta.url);
const { io: ioClient } = require('socket.io-client');
const { crearAppNest } = require('../apps/api/dist/main.js');
const { USUARIOS_DEMO_SEMILLA } = require('../apps/api/dist/auth/usuarios-demo.js');
const { crearServidorBot } = require('../apps/whatsapp-bot/dist/main.js');

function percentil(valores, p) {
  if (valores.length === 0) return 0;
  const ordenados = [...valores].sort((a, b) => a - b);
  const idx = Math.min(ordenados.length - 1, Math.ceil((p / 100) * ordenados.length) - 1);
  return Number(ordenados[idx].toFixed(2));
}

async function ejecutarEscenarioContexto(apiUrl, token, usuariosConcurrentes = 200, rondas = 3) {
  const latencias = [];
  let errores = 0;
  const inicio = performance.now();

  const headers = { Authorization: `Bearer ${token}`, 'x-canal': 'web' };
  const tareas = Array.from({ length: usuariosConcurrentes }, async () => {
    for (let i = 0; i < rondas; i++) {
      const t0 = performance.now();
      try {
        const res = await fetch(
          i % 2 === 0
            ? `${apiUrl}/catalogos/estudios`
            : `${apiUrl}/pacientes/pac_ana_demo/tramites`,
          { headers },
        );
        if (!res.ok) errores += 1;
        else await res.arrayBuffer();
      } catch {
        errores += 1;
      }
      latencias.push(performance.now() - t0);
    }
  });

  await Promise.all(tareas);
  const duracionSeg = (performance.now() - inicio) / 1000;
  return {
    escenario: `Contexto y catálogos (${usuariosConcurrentes} VU × ${rondas} req)`,
    totalSolicitudes: latencias.length,
    errores,
    tasaErrorPct: Number(((errores / latencias.length) * 100).toFixed(2)),
    rps: Number((latencias.length / duracionSeg).toFixed(1)),
    p50Ms: percentil(latencias, 50),
    p95Ms: percentil(latencias, 95),
    p99Ms: percentil(latencias, 99),
  };
}

async function ejecutarEscenarioWebhook(botUrl, appSecret, totalMensajes = 300) {
  const latencias = [];
  let errores = 0;
  const inicio = performance.now();

  const lotes = 3;
  const porLote = Math.floor(totalMensajes / lotes);

  for (let l = 0; l < lotes; l++) {
    await Promise.all(
      Array.from({ length: porLote }, async (_, idx) => {
        const payload = JSON.stringify({
          object: 'whatsapp_business_account',
          entry: [
            {
              changes: [
                {
                  value: {
                    messages: [
                      {
                        id: `wamid.bench.${l}.${idx}`,
                        from: '522229990001',
                        type: 'text',
                        text: { body: 'Hola' },
                      },
                    ],
                  },
                },
              ],
            },
          ],
        });
        const firma = `sha256=${crypto.createHmac('sha256', appSecret).update(payload).digest('hex')}`;
        const t0 = performance.now();
        try {
          const res = await fetch(`${botUrl}/webhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': firma },
            body: payload,
          });
          if (res.status !== 200) errores += 1;
          else await res.arrayBuffer();
        } catch {
          errores += 1;
        }
        latencias.push(performance.now() - t0);
      }),
    );
  }

  const duracionSeg = (performance.now() - inicio) / 1000;
  return {
    escenario: `Webhook WhatsApp firmado (${totalMensajes} mensajes en ráfaga)`,
    totalSolicitudes: latencias.length,
    errores,
    tasaErrorPct: Number(((errores / latencias.length) * 100).toFixed(2)),
    rps: Number((latencias.length / duracionSeg).toFixed(1)),
    p50Ms: percentil(latencias, 50),
    p95Ms: percentil(latencias, 95),
    p99Ms: percentil(latencias, 99),
  };
}

async function ejecutarEscenarioSockets(apiUrl, token, cantidad = 300) {
  const latencias = [];
  let errores = 0;
  const sockets = [];
  const inicio = performance.now();
  const lote = 50;

  for (let offset = 0; offset < cantidad; offset += lote) {
    const tamano = Math.min(lote, cantidad - offset);
    await Promise.all(
      Array.from(
        { length: tamano },
        () =>
          new Promise((resolve) => {
            const t0 = performance.now();
            const s = ioClient(apiUrl, {
              auth: { token },
              transports: ['websocket'],
              reconnection: false,
              timeout: 5000,
            });
            sockets.push(s);
            s.once('connect', () => {
              latencias.push(performance.now() - t0);
              resolve();
            });
            s.once('connect_error', () => {
              errores += 1;
              resolve();
            });
          }),
      ),
    );
  }

  const conectadasSimultaneas = sockets.filter((s) => s.connected).length;
  const duracionSeg = (performance.now() - inicio) / 1000;
  for (const s of sockets) s.disconnect();

  return {
    escenario: `Socket.IO autenticado (${cantidad} conexiones simultáneas abiertas)`,
    totalSolicitudes: cantidad,
    conectadasSimultaneas,
    errores,
    tasaErrorPct: Number(((errores / cantidad) * 100).toFixed(2)),
    rps: Number((cantidad / duracionSeg).toFixed(1)),
    p50Ms: percentil(latencias, 50),
    p95Ms: percentil(latencias, 95),
    p99Ms: percentil(latencias, 99),
  };
}

async function main() {
  const app = await crearAppNest({ silencioso: true });
  await app.listen(0);
  const apiUrl = await app.getUrl();

  const appSecret = 'bench-wa-secret';
  const apiMockBot = {
    resolverIdentidad: async () => ({ estado: 'nuevo' }),
    solicitarOtp: async () => ({ enviado: true }),
    verificarOtp: async () => ({ verificado: true }),
    vincularIdentidad: async () => ({ ok: true }),
    obtenerPerfilVerificado: async () => ({ nombre: 'Bench', idioma: 'es' }),
    obtenerContexto: async () => null,
    retomarTramite: async () => ({}),
    agendarCita: async () => ({ folio: 'SD-2026-000001' }),
    obtenerClinica: async () => null,
    crearTicketEscalamiento: async () => ({ folio: 'TK-2026-000001' }),
    registrarInteraccion: async () => ({ ok: true }),
    actualizarEstadoEntrega: async () => ({ ok: true }),
    solicitarEnlaceRecuperacion: async () => ({ enviado: true }),
  };
  const bot = crearServidorBot({ appSecret, api: apiMockBot });
  await new Promise((r) => bot.server.listen(0, r));
  const botPort = bot.server.address().port;
  const botUrl = `http://127.0.0.1:${botPort}`;

  try {
    const ana = USUARIOS_DEMO_SEMILLA.find((u) => u.rol === 'paciente');
    const admin = USUARIOS_DEMO_SEMILLA.find((u) => u.rol === 'admin');

    const tokenAna = (
      await (
        await fetch(`${apiUrl}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: ana.email, contrasena: ana.contrasenaDemo }),
        })
      ).json()
    ).accessToken;

    const tokenAdmin = (
      await (
        await fetch(`${apiUrl}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: admin.email, contrasena: admin.contrasenaDemo }),
        })
      ).json()
    ).accessToken;

    const resultados = [
      await ejecutarEscenarioContexto(apiUrl, tokenAna, 200, 3),
      await ejecutarEscenarioWebhook(botUrl, appSecret, 300),
      await ejecutarEscenarioSockets(apiUrl, tokenAdmin, 300),
    ];

    await bot.esperarCola();
    console.log(JSON.stringify({ fecha: new Date().toISOString(), resultados }, null, 2));

    for (const r of resultados) {
      if (r.p95Ms >= 500 || r.tasaErrorPct >= 1) {
        process.exitCode = 1;
      }
    }
  } finally {
    await new Promise((r) => bot.server.close(r));
    await app.close();
  }
}

void main();
