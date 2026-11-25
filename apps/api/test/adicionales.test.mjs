import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

process.env.NODE_ENV = 'test';

const require = createRequire(import.meta.url);
const { crearAppNest } = require('../dist/main.js');
const { OtpService } = require('../dist/otp/otp.service.js');
const { USUARIOS_DEMO_SEMILLA } = require('../dist/auth/usuarios-demo.js');

async function loginRol(url, rol) {
  const usr = USUARIOS_DEMO_SEMILLA.find((u) => u.rol === rol);
  const res = await fetch(`${url}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: usr.email, contrasena: usr.contrasenaDemo }),
  });
  return (await res.json()).accessToken;
}

test('Issues #32 y #33: alertas epidemiológicas segmentadas por región/consentimiento, prevención y facturación simulada con pdfkit', async () => {
  const app = await crearAppNest({ silencioso: true });
  await app.listen(0);
  const url = await app.getUrl();

  try {
    const tokenAna = await loginRol(url, 'paciente');
    const tokenAdmin = await loginRol(url, 'admin');
    const tokenBot = process.env.API_SERVICE_TOKEN ?? 'dev-api-service-token-not-for-prod';

    // === ISSUE #32: Alertas epidemiológicas y prevención ===
    // 1. Registrar consentimiento de notificaciones para Ana (Puebla)
    await fetch(`${url}/privacidad/consentimientos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenAna}` },
      body: JSON.stringify({
        pacienteId: 'pac_ana_demo',
        canal: 'whatsapp',
        tipo: 'notificaciones',
      }),
    });

    // 2. Admin publica alerta para Puebla -> llega a Ana por su canal preferido (whatsapp)
    const pubRes = await fetch(`${url}/alertas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenAdmin}` },
      body: JSON.stringify({
        titulo: 'Alerta dengue Puebla Centro',
        mensaje: 'Acude a valoración ante fiebre alta y revisa medidas preventivas en tu clínica.',
        region: 'Puebla',
        nivel: 'urgente',
      }),
    });
    assert.equal(pubRes.status, 201);
    const pubData = await pubRes.json();
    assert.ok(pubData.alerta.destinatariosNotificados >= 1);
    assert.ok(
      pubData.entregas.some((e) => e.pacienteId === 'pac_ana_demo' && e.canal === 'whatsapp'),
    );

    // 3. Panel de alertas activas devuelve la nueva alerta para Puebla
    const activas = await (await fetch(`${url}/alertas/activas?region=Puebla`)).json();
    assert.ok(activas.alertas.some((a) => a.id === pubData.alerta.id));

    // 4. Regla preventiva: chequeo de glucosa anual
    const prevRes = await (
      await fetch(`${url}/alertas/prevencion/pac_ana_demo`, {
        headers: { Authorization: `Bearer ${tokenAna}` },
      })
    ).json();
    assert.ok(prevRes.recordatorios.some((r) => r.regla === 'glucosa_anual_12m'));

    // === ISSUE #33: Facturación simulada ===
    // 1. Rechaza RFC y código postal inválidos
    const invalidoRes = await fetch(`${url}/facturacion/pacientes/pac_ana_demo/datos-fiscales`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenAna}` },
      body: JSON.stringify({
        rfc: 'INVALIDO',
        razonSocial: 'Ana López Demo',
        regimenFiscal: '605',
        codigoPostal: '123',
      }),
    });
    assert.equal(invalidoRes.status, 400);

    // 2. Guarda datos fiscales cifrados en el paciente (una sola vez)
    const guardarRes = await fetch(`${url}/facturacion/pacientes/pac_ana_demo/datos-fiscales`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenAna}` },
      body: JSON.stringify({
        rfc: 'LOPA950412AB1',
        razonSocial: 'Ana López Demo',
        regimenFiscal: '605',
        codigoPostal: '72000',
        usoCfdi: 'D01',
      }),
    });
    assert.equal(guardarRes.status, 200);

    // 3. Crear trámite y verificar OTP de Ana en WhatsApp para solicitar factura desde WhatsApp
    const trm = await (
      await fetch(`${url}/tramites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenAna}` },
        body: JSON.stringify({
          pacienteId: 'pac_ana_demo',
          canal: 'web',
          estudioId: 'est_us_abd',
          clinicaId: 'cli_09',
        }),
      })
    ).json();

    const otpService = app.get(OtpService);
    await fetch(`${url}/otp/solicitar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-service-token': tokenBot,
        'x-canal': 'whatsapp',
      },
      body: JSON.stringify({ pacienteId: 'pac_ana_demo', canal: 'whatsapp' }),
    });
    const despachoOtp = otpService.obtenerUltimoOtpSimulado('pac_ana_demo');

    const verifRes = await fetch(`${url}/otp/verificar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-service-token': tokenBot,
        'x-canal': 'whatsapp',
      },
      body: JSON.stringify({
        pacienteId: 'pac_ana_demo',
        canal: 'whatsapp',
        codigo: despachoOtp.codigo,
      }),
    });
    assert.equal(verifRes.status, 201);

    // 4. Ana pide su factura en WhatsApp SIN repetir datos fiscales (reutiliza cifrados)
    const facRes = await fetch(`${url}/facturacion/solicitar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-service-token': tokenBot,
        'x-canal': 'whatsapp',
      },
      body: JSON.stringify({
        tramiteId: trm.id,
        pacienteId: 'pac_ana_demo',
        canal: 'whatsapp',
      }),
    });
    assert.equal(facRes.status, 201);
    const facData = await facRes.json();
    assert.equal(facData.factura.estatus, 'emitida');
    assert.equal(facData.factura.reutilizoDatosGuardados, true);
    assert.equal(facData.factura.rfc, 'LOPA950412AB1');

    // 5. Ana consulta estatus por folio y descarga el PDF (pdfkit) desde la App
    const consultaApp = await (
      await fetch(`${url}/facturacion/tramites/${trm.folio}`, {
        headers: { Authorization: `Bearer ${tokenAna}`, 'x-canal': 'app' },
      })
    ).json();
    assert.equal(consultaApp.existe, true);
    assert.equal(consultaApp.factura.estatus, 'emitida');

    const pdfRes = await fetch(`${url}${consultaApp.pdfUrl}`, {
      headers: { Authorization: `Bearer ${tokenAna}`, 'x-canal': 'app' },
    });
    assert.equal(pdfRes.status, 200);
    assert.match(pdfRes.headers.get('content-type') ?? '', /application\/pdf/);
    const buf = Buffer.from(await pdfRes.arrayBuffer());
    assert.ok(buf.subarray(0, 5).toString('utf8') === '%PDF-');
    assert.ok(buf.length > 800);
  } finally {
    await app.close();
  }
});
