import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

process.env.NODE_ENV = 'test';

const require = createRequire(import.meta.url);
const { crearAppNest } = require('../dist/main.js');
const { USUARIOS_DEMO_SEMILLA } = require('../dist/auth/usuarios-demo.js');

test('Issues #19, #22 y #23: llamadas Call Center, correo entrante con acuse en timeline, búsqueda enmascarada y push Expo', async () => {
  const app = await crearAppNest({ silencioso: true });
  await app.listen(0);
  const url = await app.getUrl();

  const ana = USUARIOS_DEMO_SEMILLA.find((u) => u.rol === 'paciente');
  const asesor = USUARIOS_DEMO_SEMILLA.find((u) => u.rol === 'asesor');

  try {
    const { accessToken: tokenAsesor } = await (
      await fetch(`${url}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: asesor.email, contrasena: asesor.contrasenaDemo }),
      })
    ).json();

    const { accessToken: tokenAna } = await (
      await fetch(`${url}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: ana.email, contrasena: ana.contrasenaDemo }),
      })
    ).json();

    // 1. Búsqueda de paciente para consola del asesor (enmascarado #10, #19)
    const busqRes = await fetch(`${url}/identidad/pacientes/buscar?q=2221234567`, {
      headers: { Authorization: `Bearer ${tokenAsesor}` },
    });
    assert.equal(busqRes.status, 200);
    const busq = await busqRes.json();
    assert.equal(busq.total, 1);
    assert.equal(busq.pacientes[0].curp, '****ZN04');

    // 2. Registrar llamada de Call Center (#19, #23)
    const llamRes = await fetch(`${url}/canales/llamadas`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenAsesor}`,
      },
      body: JSON.stringify({
        pacienteId: 'pac_ana_demo',
        motivo: 'Duda de preparación',
        notas: 'Confirmó ayuno de 6 horas para ultrasonido abdominal',
        resultado: 'Cita confirmada sin repetir datos',
        duracionSegundos: 185,
      }),
    });
    assert.equal(llamRes.status, 201);

    // 3. Simular correo entrante (#23): resuelve identidad, crea ticket y devuelve acuse
    const emailRes = await fetch(`${url}/canales/email/entrante`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        remitente: 'ana.lopez@demo.saluddigna.local',
        asunto: 'Confirmación de horario',
        cuerpo: 'Hola, confirmo mi asistencia mañana a las 9:00.',
        region: 'Puebla',
      }),
    });
    assert.equal(emailRes.status, 201);
    const emailBody = await emailRes.json();
    assert.equal(emailBody.pacienteId, 'pac_ana_demo');
    assert.match(emailBody.ticket.folio, /^TK-2026-\d{6}$/);
    assert.match(emailBody.acuseAutomatico.asunto, /Acuse de recibo/);

    // 4. Ambas interacciones (call_center y email) aparecen en el timeline con sus íconos
    const tl = await (
      await fetch(`${url}/pacientes/pac_ana_demo/timeline`, {
        headers: { Authorization: `Bearer ${tokenAsesor}` },
      })
    ).json();
    const canalesEnTimeline = new Set(tl.items.map((i) => i.canal));
    assert.ok(canalesEnTimeline.has('call_center'));
    assert.ok(canalesEnTimeline.has('email'));
    assert.ok(tl.items.some((i) => i.canal === 'call_center' && i.icono === 'phone'));
    assert.ok(tl.items.some((i) => i.canal === 'email' && i.icono === 'mail'));

    // 5. Registrar expoPushToken (#22) y comprobar despacho automático al confirmar cita
    const pushReg = await fetch(`${url}/canales/push-tokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenAna}`,
      },
      body: JSON.stringify({
        pacienteId: 'pac_ana_demo',
        expoPushToken: 'ExponentPushToken[demo-ana-001]',
        plataforma: 'android',
      }),
    });
    assert.equal(pushReg.status, 201);

    const trm = await (
      await fetch(`${url}/tramites`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenAna}`,
        },
        body: JSON.stringify({
          pacienteId: 'pac_ana_demo',
          canal: 'web',
          estudioId: 'est_us_abd',
          clinicaId: 'cli_09',
        }),
      })
    ).json();

    await fetch(`${url}/tramites/${trm.id}/avanzar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenAna}`,
      },
      body: JSON.stringify({
        estadoDestino: 'seleccion_clinica',
        canal: 'web',
        clinicaId: 'cli_09',
      }),
    });
    await fetch(`${url}/tramites/${trm.id}/avanzar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenAna}`,
      },
      body: JSON.stringify({
        estadoDestino: 'cita_agendada',
        canal: 'whatsapp',
        fechaHora: '2026-11-26T09:00:00Z',
      }),
    });
    await fetch(`${url}/tramites/${trm.id}/avanzar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenAsesor}`,
      },
      body: JSON.stringify({
        estadoDestino: 'cita_confirmada',
        canal: 'call_center',
      }),
    });

    const tokensRes = await (
      await fetch(`${url}/canales/push-tokens/pac_ana_demo`, {
        headers: { Authorization: `Bearer ${tokenAna}` },
      })
    ).json();
    assert.equal(tokensRes.tokens.length, 1);
    assert.ok(tokensRes.notificacionesEnviadas.some((n) => n.tipoEvento === 'cita.confirmada'));
  } finally {
    await app.close();
  }
});
