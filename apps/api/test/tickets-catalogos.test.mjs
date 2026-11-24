import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

process.env.NODE_ENV = 'test';

const require = createRequire(import.meta.url);
const { crearAppNest } = require('../dist/main.js');
const { TicketsService } = require('../dist/tickets/tickets.service.js');
const { EventBusService } = require('../dist/eventos/event-bus.service.js');
const {
  CLINICAS_DEMO,
  ESTUDIOS_DEMO,
  MEDICOS_DEMO,
  PACIENTES_DEMO,
} = require('../dist/catalogos/datos-demo.js');
const { USUARIOS_DEMO_SEMILLA } = require('../dist/auth/usuarios-demo.js');
const { obtenerTokenServicioBot } = require('../dist/auth/guards.js');

test('Issue #17: catálogos demo cumplen volumen esperado y son 100% ficticios (esDemo: true)', async () => {
  assert.equal(ESTUDIOS_DEMO.length, 30);
  assert.equal(CLINICAS_DEMO.length, 10);
  assert.equal(MEDICOS_DEMO.length, 5);
  assert.equal(PACIENTES_DEMO.length, 15);
  assert.ok(ESTUDIOS_DEMO.every((e) => e.esDemo === true));
  assert.ok(CLINICAS_DEMO.every((c) => c.esDemo === true));
  assert.ok(
    PACIENTES_DEMO.every((p) => p.esDemo === true && p.email.endsWith('@demo.saluddigna.local')),
  );

  const app = await crearAppNest({ silencioso: true });
  await app.listen(0);
  const url = await app.getUrl();
  try {
    const estRes = await (await fetch(`${url}/catalogos/estudios?categoria=ultrasonido`)).json();
    assert.ok(estRes.total >= 5);
    const cliRes = await (await fetch(`${url}/catalogos/clinicas?region=Puebla`)).json();
    assert.equal(cliRes.total, 3);
  } finally {
    await app.close();
  }
});

test('Issue #16: tickets desde WhatsApp, balanceo por carga regional, escalamiento IA->asesor->pro y SLA vencido', async () => {
  const app = await crearAppNest({ silencioso: true });
  await app.listen(0);
  const url = await app.getUrl();

  const ana = USUARIOS_DEMO_SEMILLA.find((u) => u.rol === 'paciente');
  const asesor = USUARIOS_DEMO_SEMILLA.find((u) => u.rol === 'asesor');

  try {
    const ticketsService = app.get(TicketsService);
    const eventBus = app.get(EventBusService);
    const headersBot = {
      'Content-Type': 'application/json',
      'x-service-token': obtenerTokenServicioBot(),
    };

    // 1. Bot crea dos tickets en Puebla -> balanceo automático al asesor con menos carga
    const t1 = await (
      await fetch(`${url}/tickets`, {
        method: 'POST',
        headers: headersBot,
        body: JSON.stringify({
          pacienteId: 'pac_ana_demo',
          canalOrigen: 'whatsapp',
          tipo: 'duda',
          prioridad: 'media',
          region: 'Puebla',
          resumenIa: 'Ana pregunta si puede tomar agua antes del ultrasonido abdominal.',
        }),
      })
    ).json();
    assert.match(t1.folio, /^TK-2026-\d{6}$/);
    assert.equal(t1.asignadoAId, 'usr_asesor_01');

    const t2 = await (
      await fetch(`${url}/tickets`, {
        method: 'POST',
        headers: headersBot,
        body: JSON.stringify({
          pacienteId: 'pac_demo_02',
          canalOrigen: 'whatsapp',
          tipo: 'queja',
          region: 'Puebla',
        }),
      })
    ).json();
    // El segundo ticket va al segundo asesor de Puebla (menor carga)
    assert.equal(t2.asignadoAId, 'usr_asesor_02');

    // 2. Asesor ve los tickets abiertos de su región
    const { accessToken: tokenAsesor } = await (
      await fetch(`${url}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: asesor.email, contrasena: asesor.contrasenaDemo }),
      })
    ).json();

    const colaPuebla = await (
      await fetch(`${url}/tickets?region=Puebla`, {
        headers: { Authorization: `Bearer ${tokenAsesor}` },
      })
    ).json();
    assert.equal(colaPuebla.total, 2);

    // 3. El paciente consulta el estatus de su ticket desde cualquier canal (solo ve los suyos)
    const { accessToken: tokenAna } = await (
      await fetch(`${url}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: ana.email, contrasena: ana.contrasenaDemo }),
      })
    ).json();

    const misTickets = await (
      await fetch(`${url}/tickets`, {
        headers: { Authorization: `Bearer ${tokenAna}` },
      })
    ).json();
    assert.equal(misTickets.total, 1);
    assert.equal(misTickets.tickets[0].folio, t1.folio);

    // 4. Escalamiento asesor -> asesor_pro
    const escRes = await fetch(`${url}/tickets/${t1.id}/escalar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenAsesor}`,
      },
      body: JSON.stringify({ motivo: 'Requiere validación de segundo nivel' }),
    });
    assert.equal(escRes.status, 201);
    const escalado = await escRes.json();
    assert.equal(escalado.nivelEscalamiento, 'asesor_pro');
    assert.equal(escalado.asignadoAId, 'usr_asesor_pro_01');
    assert.equal(escalado.estatus, 'escalado');

    // 5. Job de SLA vencido emite `ticket.sla_vencido`
    const futuroMs = Date.now() + 25 * 60 * 60 * 1000;
    const vencidos = await ticketsService.verificarSlasVencidos(futuroMs);
    assert.equal(vencidos.length, 2);
    assert.ok(eventBus.obtenerOutbox().some((o) => o.evento.tipo === 'ticket.sla_vencido'));

    // 6. Resolver y cerrar ticket
    const cerrarRes = await fetch(`${url}/tickets/${t1.id}/resolver`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenAsesor}`,
      },
      body: JSON.stringify({ resolucion: 'Indicaciones de ayuno confirmadas y cita agendada' }),
    });
    assert.equal(cerrarRes.status, 201);
    const cerrado = await cerrarRes.json();
    assert.equal(cerrado.estatus, 'cerrado');
  } finally {
    await app.close();
  }
});
