import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { io as crearClienteSocket } from 'socket.io-client';

process.env.NODE_ENV = 'test';

const require = createRequire(import.meta.url);
const { crearAppNest } = require('../dist/main.js');
const { EventBusService } = require('../dist/eventos/event-bus.service.js');
const { USUARIOS_DEMO_SEMILLA } = require('../dist/auth/usuarios-demo.js');
const { obtenerTokenServicioBot } = require('../dist/auth/guards.js');
const { OtpService } = require('../dist/otp/otp.service.js');

/** El bot (asesor_ia) debe verificar a la paciente por OTP antes de ver o tocar su trámite. */
async function verificarOtpBot(app, url, headersBot, pacienteId) {
  const otp = app.get(OtpService);
  const sol = await fetch(`${url}/otp/solicitar`, {
    method: 'POST',
    headers: headersBot,
    body: JSON.stringify({ pacienteId, canal: 'whatsapp' }),
  });
  assert.equal(sol.status, 201);
  const despacho = otp.obtenerUltimoOtpSimulado(pacienteId);
  const ver = await fetch(`${url}/otp/verificar`, {
    method: 'POST',
    headers: headersBot,
    body: JSON.stringify({ pacienteId, canal: 'whatsapp', codigo: despacho.codigo }),
  });
  assert.equal(ver.status, 201);
}

test('Issues #14 y #15: Socket.IO con JWT en <2s, idempotencia/reintentos en EventBus y timeline cronológico', async () => {
  const app = await crearAppNest({ silencioso: true });
  await app.listen(0);
  const url = await app.getUrl();

  const asesor = USUARIOS_DEMO_SEMILLA.find((u) => u.rol === 'asesor');
  let socketAsesor;

  try {
    const eventBus = app.get(EventBusService);

    // 1. Prueba de reintentos + idempotencia por eventId en EventBus (#14)
    let intentosConsumidor = 0;
    let ejecucionesExitosas = 0;
    eventBus.suscribir('metricas', () => {
      intentosConsumidor += 1;
      if (intentosConsumidor < 3) {
        throw new Error('Fallo transitorio simulado');
      }
      ejecucionesExitosas += 1;
    });

    const eventoPrueba = await eventBus.publish({
      tipo: 'paciente.registrado',
      version: 1,
      pacienteId: 'pac_idemp_test',
      tramiteId: null,
      canal: 'web',
      actor: { tipo: 'paciente', id: 'pac_idemp_test' },
      datos: {
        registroLigero: true,
        canalPreferido: 'whatsapp',
        idioma: 'es',
        esDemo: true,
      },
    });
    assert.equal(intentosConsumidor, 3);
    assert.equal(ejecucionesExitosas, 1);

    // Reinyectar exactamente el mismo eventId no debe duplicar el procesamiento
    await eventBus.reentregarEvento(eventoPrueba);
    assert.equal(ejecucionesExitosas, 1);

    // 2. Socket.IO rechaza conexiones sin JWT válido
    const errorSinToken = await new Promise((resolve) => {
      const s = crearClienteSocket(url, {
        transports: ['websocket'],
        reconnection: false,
      });
      s.on('connect_error', (err) => {
        s.close();
        resolve(err.message);
      });
    });
    assert.match(errorSinToken, /JWT/i);

    // 3. Asesor se conecta con JWT válido y recibe evento de WhatsApp en < 2 segundos
    const { accessToken: tokenAsesor } = await (
      await fetch(`${url}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: asesor.email, contrasena: asesor.contrasenaDemo }),
      })
    ).json();

    const eventosRecibidos = [];
    socketAsesor = crearClienteSocket(url, {
      transports: ['websocket'],
      auth: { token: tokenAsesor },
      reconnection: false,
    });

    await new Promise((resolve, reject) => {
      socketAsesor.on('connect', resolve);
      socketAsesor.on('connect_error', reject);
    });

    const promesaEvento = new Promise((resolve) => {
      socketAsesor.on('evento:omnicanal', (ev) => {
        eventosRecibidos.push({ ev, recibidoEn: Date.now() });
        if (ev.tipo === 'cita.agendada') resolve(ev);
      });
    });

    // Ejecutar recorrido Web -> WhatsApp -> Call Center -> App
    const headersBot = {
      'Content-Type': 'application/json',
      'x-service-token': obtenerTokenServicioBot(),
    };
    await verificarOtpBot(app, url, headersBot, 'pac_ana_demo');

    const trm = await (
      await fetch(`${url}/tramites`, {
        method: 'POST',
        headers: headersBot,
        body: JSON.stringify({
          pacienteId: 'pac_ana_demo',
          canal: 'web',
          estudioId: 'est_us_abd',
        }),
      })
    ).json();

    await fetch(`${url}/tramites/${trm.id}/contexto`, {
      method: 'PATCH',
      headers: headersBot,
      body: JSON.stringify({ canal: 'web', clinicaId: 'cli_09' }),
    });

    const inicioWa = Date.now();
    await fetch(`${url}/tramites/${trm.id}/avanzar`, {
      method: 'POST',
      headers: headersBot,
      body: JSON.stringify({
        estadoDestino: 'cita_agendada',
        canal: 'whatsapp',
        fechaHora: '2026-11-26T09:00:00Z',
      }),
    });

    const eventoRt = await promesaEvento;
    const latenciaMs = Date.now() - inicioWa;
    assert.equal(eventoRt.tipo, 'cita.agendada');
    assert.ok(latenciaMs < 2000, `Latencia RT excedió 2s: ${latenciaMs}ms`);

    await fetch(`${url}/tramites/${trm.id}/avanzar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenAsesor}`,
      },
      body: JSON.stringify({ estadoDestino: 'cita_confirmada', canal: 'call_center' }),
    });

    // Evento desde App (ej. consulta/cambio de canal)
    await eventBus.publish({
      tipo: 'canal.cambiado',
      version: 1,
      pacienteId: 'pac_ana_demo',
      tramiteId: trm.id,
      canal: 'app',
      actor: { tipo: 'paciente', id: 'pac_ana_demo' },
      datos: {
        canalAnterior: 'call_center',
        canalNuevo: 'app',
        pasoActual: 'cita_confirmada',
        verificado: true,
      },
    });

    // 4. Timeline unificado muestra Web -> WhatsApp -> Call Center -> App en orden + filtros + paginación
    const tlRes = await fetch(`${url}/pacientes/pac_ana_demo/timeline?tramiteId=${trm.id}`, {
      headers: { Authorization: `Bearer ${tokenAsesor}` },
    });
    assert.equal(tlRes.status, 200);
    const tl = await tlRes.json();
    const canalesUnicosEnOrden = [];
    for (const item of tl.items) {
      if (canalesUnicosEnOrden.at(-1) !== item.canal) {
        canalesUnicosEnOrden.push(item.canal);
      }
    }
    assert.deepEqual(canalesUnicosEnOrden, ['web', 'whatsapp', 'call_center', 'app']);

    // Filtro por canal y paginación por cursor
    const soloWa = await (
      await fetch(`${url}/pacientes/pac_ana_demo/timeline?canal=whatsapp&tramiteId=${trm.id}`, {
        headers: { Authorization: `Bearer ${tokenAsesor}` },
      })
    ).json();
    assert.ok(soloWa.items.length >= 1);
    assert.ok(soloWa.items.every((i) => i.canal === 'whatsapp'));

    const pag1 = await (
      await fetch(`${url}/pacientes/pac_ana_demo/timeline?limit=2&tramiteId=${trm.id}`, {
        headers: { Authorization: `Bearer ${tokenAsesor}` },
      })
    ).json();
    assert.equal(pag1.items.length, 2);
    assert.ok(pag1.nextCursor);
  } finally {
    if (socketAsesor) socketAsesor.close();
    await app.close();
  }
});
