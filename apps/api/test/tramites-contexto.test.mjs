import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

process.env.NODE_ENV = 'test';

const require = createRequire(import.meta.url);
const { crearAppNest } = require('../dist/main.js');
const { validarTransicionTramite } = require('../dist/tramites/maquina-estados.js');
const { USUARIOS_DEMO_SEMILLA } = require('../dist/auth/usuarios-demo.js');
const { obtenerTokenServicioBot } = require('../dist/auth/guards.js');

test('Issue #12: pruebas unitarias de la máquina de estados (transiciones válidas e inválidas)', () => {
  // Inválida: saltar directo de cotizacion a cita_confirmada
  const salto = validarTransicionTramite('cotizacion', 'cita_confirmada', {});
  assert.equal(salto.valida, false);

  // Inválida: agendar cita sin clínica seleccionada
  const sinClinica = validarTransicionTramite('seleccion_clinica', 'cita_agendada', {
    fechaHora: '2026-11-26T09:00:00Z',
  });
  assert.equal(sinClinica.valida, false);

  // Válida: seleccion_clinica -> cita_agendada con clínica y fecha
  const okCita = validarTransicionTramite('seleccion_clinica', 'cita_agendada', {
    clinicaId: 'cli_09',
    fechaHora: '2026-11-26T09:00:00Z',
  });
  assert.equal(okCita.valida, true);

  // Inválida: salir de estado terminal cerrado
  const desdeCerrado = validarTransicionTramite('cerrado', 'cotizacion', {});
  assert.equal(desdeCerrado.valida, false);
});

test('Issues #12 y #13: recorrido de Ana (Web -> reinicio servidor -> WhatsApp -> Call Center -> App) y conflictos', async () => {
  const snapshotTmp = path.join(os.tmpdir(), `sd-tramites-test-${Date.now()}.json`);
  process.env.TRAMITES_SNAPSHOT_PATH = snapshotTmp;

  const ana = USUARIOS_DEMO_SEMILLA.find((u) => u.rol === 'paciente');
  const asesor = USUARIOS_DEMO_SEMILLA.find((u) => u.rol === 'asesor');

  // --- INSTANCIA 1: Ana inicia en Web, autoguarda estudio + clínica y cierra sin confirmar ---
  const app1 = await crearAppNest({ silencioso: true });
  await app1.listen(0);
  const url1 = await app1.getUrl();

  let tramiteId;
  let folio;

  try {
    const { accessToken: tokenAna } = await (
      await fetch(`${url1}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: ana.email, contrasena: ana.contrasenaDemo }),
      })
    ).json();

    const crearRes = await fetch(`${url1}/tramites`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenAna}`,
      },
      body: JSON.stringify({
        pacienteId: 'pac_ana_demo',
        canal: 'web',
        estudioId: 'est_us_abd',
      }),
    });
    assert.equal(crearRes.status, 201);
    const creado = await crearRes.json();
    tramiteId = creado.id;
    folio = creado.folio;
    assert.match(folio, /^SD-2026-\d{6}$/);

    // Autoguardado parcial en Web (elige clínica Puebla Centro y cierra navegador)
    const patchRes = await fetch(`${url1}/tramites/${tramiteId}/contexto`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenAna}`,
      },
      body: JSON.stringify({
        canal: 'web',
        clinicaId: 'cli_09',
        pendientes: ['confirmar_fecha', 'aceptar_preparacion'],
      }),
    });
    assert.equal(patchRes.status, 200);
    const patchBody = await patchRes.json();
    assert.equal(patchBody.tramite.estado, 'seleccion_clinica');
    assert.match(patchBody.resumen, /Ultrasonido abdominal/i);
    assert.match(patchBody.resumen, /Salud Digna Puebla Centro/i);

    // Pausa por abandono en Web
    const pausaRes = await fetch(`${url1}/tramites/${tramiteId}/pausar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenAna}`,
      },
      body: JSON.stringify({ canal: 'web', motivo: 'Cerró navegador sin confirmar' }),
    });
    assert.equal(pausaRes.status, 201);
  } finally {
    // Simular REINICIO completo del servidor (#13)
    await app1.close();
  }

  // --- INSTANCIA 2: Servidor reiniciado; Ana escribe por WhatsApp y continúa exactamente donde quedó ---
  const app2 = await crearAppNest({ silencioso: true });
  await app2.listen(0);
  const url2 = await app2.getUrl();

  try {
    const headersBot = {
      'Content-Type': 'application/json',
      'x-service-token': obtenerTokenServicioBot(),
    };

    // El contexto sobrevivió al reinicio
    const ctxRes = await fetch(`${url2}/pacientes/pac_ana_demo/contexto`, {
      headers: headersBot,
    });
    assert.equal(ctxRes.status, 200);
    const ctxBody = await ctxRes.json();
    assert.equal(ctxBody.folio, folio);
    assert.equal(ctxBody.contexto.estudio.id, 'est_us_abd');
    assert.equal(ctxBody.contexto.clinica.id, 'cli_09');
    assert.match(ctxBody.resumen, /Ultrasonido abdominal/);

    // Retomar en WhatsApp restaura `seleccion_clinica`
    const retomarRes = await fetch(`${url2}/tramites/${tramiteId}/retomar`, {
      method: 'POST',
      headers: headersBot,
      body: JSON.stringify({ canal: 'whatsapp' }),
    });
    assert.equal(retomarRes.status, 201);
    const retomado = await retomarRes.json();
    assert.equal(retomado.estado, 'seleccion_clinica');
    assert.equal(retomado.ultimoCanal, 'whatsapp');

    // Conflicto controlado: cambio de fecha tentativa registra conflicto (último cambio gana)
    await fetch(`${url2}/tramites/${tramiteId}/contexto`, {
      method: 'PATCH',
      headers: headersBot,
      body: JSON.stringify({
        canal: 'whatsapp',
        fechaTentativa: '2026-11-26T09:00:00Z',
      }),
    });
    const conflictoRes = await fetch(`${url2}/tramites/${tramiteId}/contexto`, {
      method: 'PATCH',
      headers: headersBot,
      body: JSON.stringify({
        canal: 'whatsapp',
        fechaTentativa: '2026-11-26T10:30:00Z',
      }),
    });
    const conflictoBody = await conflictoRes.json();
    assert.equal(conflictoBody.tramite.contexto.fechaTentativa, '2026-11-26T10:30:00Z');
    assert.equal(conflictoBody.tramite.contexto.conflictos.length, 1);

    // Transición inválida rechazada (409)
    const invalidaRes = await fetch(`${url2}/tramites/${tramiteId}/avanzar`, {
      method: 'POST',
      headers: headersBot,
      body: JSON.stringify({ estadoDestino: 'cerrado', canal: 'whatsapp' }),
    });
    assert.equal(invalidaRes.status, 409);

    // Agendar cita en WhatsApp
    const agendarRes = await fetch(`${url2}/tramites/${tramiteId}/avanzar`, {
      method: 'POST',
      headers: headersBot,
      body: JSON.stringify({
        estadoDestino: 'cita_agendada',
        canal: 'whatsapp',
        fechaHora: '2026-11-26T10:30:00Z',
      }),
    });
    assert.equal(agendarRes.status, 201);

    // Call Center confirma cita
    const { accessToken: tokenAsesor } = await (
      await fetch(`${url2}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: asesor.email, contrasena: asesor.contrasenaDemo }),
      })
    ).json();

    const confirmarRes = await fetch(`${url2}/tramites/${tramiteId}/avanzar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenAsesor}`,
      },
      body: JSON.stringify({ estadoDestino: 'cita_confirmada', canal: 'call_center' }),
    });
    assert.equal(confirmarRes.status, 201);
    const confirmado = await confirmarRes.json();
    assert.equal(confirmado.estado, 'cita_confirmada');
    assert.equal(confirmado.cita.estatus, 'confirmada');

    // App consulta trámite activo
    const { accessToken: tokenAna2 } = await (
      await fetch(`${url2}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: ana.email, contrasena: ana.contrasenaDemo }),
      })
    ).json();
    const appRes = await fetch(`${url2}/pacientes/pac_ana_demo/tramites?activo=true`, {
      headers: { Authorization: `Bearer ${tokenAna2}` },
    });
    assert.equal(appRes.status, 200);
    const appBody = await appRes.json();
    assert.equal(appBody.total, 1);
    assert.equal(appBody.tramites[0].estado, 'cita_confirmada');
  } finally {
    await app2.close();
    delete process.env.TRAMITES_SNAPSHOT_PATH;
    if (fs.existsSync(snapshotTmp)) fs.unlinkSync(snapshotTmp);
  }
});
