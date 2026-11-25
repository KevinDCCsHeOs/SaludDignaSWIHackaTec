import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

process.env.NODE_ENV = 'test';

const require = createRequire(import.meta.url);
const { crearAppNest } = require('../../apps/api/dist/main.js');
const { OtpService } = require('../../apps/api/dist/otp/otp.service.js');
const { USUARIOS_DEMO_SEMILLA } = require('../../apps/api/dist/auth/usuarios-demo.js');
const { obtenerTokenServicioBot } = require('../../apps/api/dist/auth/guards.js');
const { crearServidorBot } = require('../../apps/whatsapp-bot/dist/main.js');
const { ClienteHttpApiBot } = require('../../apps/whatsapp-bot/dist/cloud-api/cliente-api.js');

const APP_SECRET = 'resiliencia-wa-secret';

async function loginRol(apiUrl, rol) {
  const usr = USUARIOS_DEMO_SEMILLA.find((u) => u.rol === rol);
  const res = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: usr.email, contrasena: usr.contrasenaDemo }),
  });
  return (await res.json()).accessToken;
}

async function enviarWebhookWa(botUrl, messageId, from, texto) {
  const payload = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            value: {
              messages: [{ id: messageId, from, type: 'text', text: { body: texto } }],
            },
          },
        ],
      },
    ],
  });
  const firma = `sha256=${crypto.createHmac('sha256', APP_SECRET).update(payload).digest('hex')}`;
  return fetch(`${botUrl}/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': firma },
    body: payload,
  });
}

test('Issue #39 — Casos 1, 3 y 4: Web -> cierre abrupto -> reinicio API -> WhatsApp retoma con deduplicación -> Call Center -> App', async () => {
  const snapshotPath = path.join(
    os.tmpdir(),
    `sd-resiliencia-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );
  process.env.TRAMITES_SNAPSHOT_PATH = snapshotPath;

  let app1 = await crearAppNest({ silencioso: true });
  await app1.listen(0);
  const apiUrl1 = await app1.getUrl();

  let tramiteId;
  let folio;

  try {
    const tokenAna = await loginRol(apiUrl1, 'paciente');

    // 1. Web: Ana inicia cotización de ultrasonido y elige clínica Puebla Centro, luego "cierra navegador"
    const trm = await (
      await fetch(`${apiUrl1}/tramites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenAna}` },
        body: JSON.stringify({ pacienteId: 'pac_ana_demo', canal: 'web', estudioId: 'est_us_abd' }),
      })
    ).json();
    tramiteId = trm.id;
    folio = trm.folio;

    const patchRes = await fetch(`${apiUrl1}/tramites/${tramiteId}/contexto`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenAna}` },
      body: JSON.stringify({
        canal: 'web',
        clinicaId: 'cli_09',
        pendientes: ['confirmar_fecha', 'aceptar_preparacion'],
      }),
    });
    assert.equal(patchRes.status, 200);
  } finally {
    // 3. Reiniciar servidor API a mitad del flujo (simula reinicio de contenedor `api`)
    await app1.close();
    app1 = null;
  }

  const app2 = await crearAppNest({ silencioso: true });
  await app2.listen(0);
  const apiUrl2 = await app2.getUrl();

  const clienteApi = new ClienteHttpApiBot(apiUrl2, obtenerTokenServicioBot());
  const bot = crearServidorBot({ appSecret: APP_SECRET, api: clienteApi });
  await new Promise((r) => bot.server.listen(0, r));
  const botUrl = `http://127.0.0.1:${bot.server.address().port}`;

  try {
    const otpService = app2.get(OtpService);
    const tokenAna2 = await loginRol(apiUrl2, 'paciente');
    const tokenAsesor2 = await loginRol(apiUrl2, 'asesor');

    // Verificar que el contexto sobrevivió al reinicio del API
    const ctxPostReinicio = await (
      await fetch(`${apiUrl2}/pacientes/pac_ana_demo/contexto`, {
        headers: { Authorization: `Bearer ${tokenAna2}` },
      })
    ).json();
    assert.equal(ctxPostReinicio.folio, folio);
    assert.equal(ctxPostReinicio.contexto.estudio.id, 'est_us_abd');
    assert.equal(ctxPostReinicio.contexto.clinica.id, 'cli_09');

    // WhatsApp: Ana escribe "Hola" -> el bot pide OTP
    const w1 = await enviarWebhookWa(botUrl, 'wamid.res.1', '522221234567', 'Hola');
    assert.equal(w1.status, 200);
    await bot.esperarCola();

    const otp = otpService.obtenerUltimoOtpSimulado('pac_ana_demo');
    assert.ok(otp?.codigo);

    // 4. Mensajes duplicados con mismo `message.id` (no deben duplicar acciones)
    await enviarWebhookWa(botUrl, 'wamid.res.2', '522221234567', otp.codigo);
    await enviarWebhookWa(botUrl, 'wamid.res.2', '522221234567', otp.codigo);
    await bot.esperarCola();

    // Ana retoma su trámite y agenda horario por WhatsApp (envío duplicado de confirmación también deduplicado)
    await enviarWebhookWa(botUrl, 'wamid.res.3', '522221234567', 'Sí, continuar');
    await bot.esperarCola();
    await enviarWebhookWa(botUrl, 'wamid.res.4', '522221234567', 'Mañana 9:00');
    await enviarWebhookWa(botUrl, 'wamid.res.4', '522221234567', 'Mañana 9:00');
    await bot.esperarCola();

    // Call Center: asesor confirma la cita viendo todo el contexto acumulado
    const confRes = await fetch(`${apiUrl2}/tramites/${tramiteId}/avanzar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenAsesor2}` },
      body: JSON.stringify({ estadoDestino: 'cita_confirmada', canal: 'call_center' }),
    });
    assert.equal(confRes.status, 201);

    // App móvil: Ana consulta su trámite y ve su cita confirmada + historial intacto
    const appRes = await (
      await fetch(`${apiUrl2}/tramites/${folio}`, {
        headers: { Authorization: `Bearer ${tokenAna2}`, 'x-canal': 'app' },
      })
    ).json();
    assert.equal(appRes.estado, 'cita_confirmada');
    assert.equal(appRes.cita.estatus, 'confirmada');
    assert.equal(appRes.contexto.estudio.id, 'est_us_abd');
    assert.equal(appRes.contexto.clinica.id, 'cli_09');
  } finally {
    await new Promise((r) => bot.server.close(r));
    await app2.close();
    delete process.env.TRAMITES_SNAPSHOT_PATH;
    fs.rmSync(snapshotPath, { force: true });
  }
});

test('Issue #39 — Casos 2, 5 y 6: 3 OTP fallidos -> bloqueo, edición concurrente con conflicto y registro ligero incompleto', async () => {
  const app = await crearAppNest({ silencioso: true });
  await app.listen(0);
  const apiUrl = await app.getUrl();

  const headersBot = {
    'Content-Type': 'application/json',
    'x-service-token': obtenerTokenServicioBot(),
    'x-canal': 'whatsapp',
  };

  try {
    const otpService = app.get(OtpService);
    const tokenAna = await loginRol(apiUrl, 'paciente');
    const tokenAsesor = await loginRol(apiUrl, 'asesor');

    // Caso 2: WhatsApp -> OTP incorrecto 3 veces -> bloqueo 429 y sin acceso al contexto
    await fetch(`${apiUrl}/otp/solicitar`, {
      method: 'POST',
      headers: headersBot,
      body: JSON.stringify({ pacienteId: 'pac_ana_demo', canal: 'whatsapp' }),
    });
    const real = otpService.obtenerUltimoOtpSimulado('pac_ana_demo').codigo;
    const malo = real === '000000' ? '111111' : '000000';

    for (let i = 0; i < 2; i++) {
      const f = await fetch(`${apiUrl}/otp/verificar`, {
        method: 'POST',
        headers: headersBot,
        body: JSON.stringify({ pacienteId: 'pac_ana_demo', canal: 'whatsapp', codigo: malo }),
      });
      assert.equal(f.status, 401);
    }
    const bloqueo = await fetch(`${apiUrl}/otp/verificar`, {
      method: 'POST',
      headers: headersBot,
      body: JSON.stringify({ pacienteId: 'pac_ana_demo', canal: 'whatsapp', codigo: malo }),
    });
    assert.equal(bloqueo.status, 429);

    const ctxBloqueado = await fetch(`${apiUrl}/pacientes/pac_ana_demo/contexto`, {
      headers: headersBot,
    });
    assert.equal(ctxBloqueado.status, 403);

    // Caso 5: Asesor y paciente modifican el trámite al mismo tiempo -> último cambio gana + conflicto registrado
    const trm = await (
      await fetch(`${apiUrl}/tramites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenAna}` },
        body: JSON.stringify({ pacienteId: 'pac_ana_demo', canal: 'web', estudioId: 'est_us_abd' }),
      })
    ).json();

    await fetch(`${apiUrl}/tramites/${trm.id}/contexto`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenAna}` },
      body: JSON.stringify({ canal: 'web', clinicaId: 'cli_09' }),
    });
    const segundo = await (
      await fetch(`${apiUrl}/tramites/${trm.id}/contexto`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenAsesor}` },
        body: JSON.stringify({ canal: 'call_center', clinicaId: 'cli_10' }),
      })
    ).json();

    assert.equal(segundo.tramite.clinicaId, 'cli_10');
    assert.ok(
      segundo.tramite.contexto.conflictos.some(
        (c) => c.campo === 'clinica' && c.valorAnterior === 'cli_09' && c.valorNuevo === 'cli_10',
      ),
    );

    // Caso 6: Paciente nuevo sin datos completos (solo nombre y teléfono) -> registro ligero y continuidad
    const regLigero = await (
      await fetch(`${apiUrl}/identidad/registro-ligero`, {
        method: 'POST',
        headers: headersBot,
        body: JSON.stringify({
          nombre: 'Luis',
          apellidos: 'Demo Incompleto',
          canal: 'whatsapp',
          identificador: '+522228887766',
          region: 'Puebla',
        }),
      })
    ).json();
    assert.ok(regLigero.pacienteId);

    const trmNuevo = await (
      await fetch(`${apiUrl}/tramites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenAsesor}` },
        body: JSON.stringify({
          pacienteId: regLigero.pacienteId,
          canal: 'call_center',
          estudioId: 'est_lab_bh',
        }),
      })
    ).json();
    assert.equal(trmNuevo.pacienteId, regLigero.pacienteId);
    assert.equal(trmNuevo.contexto.estudio.id, 'est_lab_bh');
  } finally {
    await app.close();
  }
});
