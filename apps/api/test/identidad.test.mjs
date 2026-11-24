import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

process.env.NODE_ENV = 'test';

const require = createRequire(import.meta.url);
const { crearAppNest } = require('../dist/main.js');
const { normalizarTelefonoE164 } = require('../dist/identidad/normalizador.js');
const { OtpService } = require('../dist/otp/otp.service.js');
const { PacienteStoreService } = require('../dist/identidad/paciente-store.service.js');
const { EventPublisherService } = require('../dist/common/eventos/event-publisher.service.js');
const { obtenerTokenServicioBot } = require('../dist/auth/guards.js');

test('Issue #7: normalización de números telefónicos en distintos formatos a E.164', () => {
  assert.equal(normalizarTelefonoE164('2221234567'), '+522221234567');
  assert.equal(normalizarTelefonoE164('(222) 123-4567'), '+522221234567');
  assert.equal(normalizarTelefonoE164('+52 1 222 123 4567'), '+522221234567');
  assert.equal(normalizarTelefonoE164('5212221234567'), '+522221234567');
  assert.equal(normalizarTelefonoE164('+52 222 123 4567'), '+522221234567');
});

test('Issue #7: resolución Web -> WhatsApp, casos nuevo/existente/ambiguo y vinculación solo tras OTP', async () => {
  const app = await crearAppNest({ silencioso: true });
  await app.listen(0);
  const url = await app.getUrl();
  const headersBot = {
    'Content-Type': 'application/json',
    'x-service-token': obtenerTokenServicioBot(),
    'x-canal': 'whatsapp',
  };

  try {
    const otpService = app.get(OtpService);
    const store = app.get(PacienteStoreService);
    const events = app.get(EventPublisherService);

    // 1. Ana inició en Web y escribe en WhatsApp con otro formato de su teléfono -> requiere_verificacion
    const resAna = await fetch(`${url}/identidad/resolver`, {
      method: 'POST',
      headers: headersBot,
      body: JSON.stringify({ canal: 'whatsapp', identificador: '+52 1 222 123 4567' }),
    });
    assert.equal(resAna.status, 201);
    const anaResuelta = await resAna.json();
    assert.equal(anaResuelta.estado, 'requiere_verificacion');
    assert.equal(anaResuelta.pacienteId, 'pac_ana_demo');
    assert.equal(anaResuelta.identificadorNormalizado, '+522221234567');

    // 2. Intentar vincular WhatsApp SIN verificación OTP previa debe fallar (403)
    const vincularSinOtp = await fetch(`${url}/identidad/vincular`, {
      method: 'POST',
      headers: headersBot,
      body: JSON.stringify({
        pacienteId: 'pac_ana_demo',
        canal: 'whatsapp',
        identificador: '2221234567',
      }),
    });
    assert.equal(vincularSinOtp.status, 403);

    // 3. Solicitar y verificar OTP -> luego vincular WhatsApp exitosamente
    await fetch(`${url}/otp/solicitar`, {
      method: 'POST',
      headers: headersBot,
      body: JSON.stringify({ pacienteId: 'pac_ana_demo', canal: 'whatsapp' }),
    });
    const ultimoOtp = otpService.obtenerUltimoOtpSimulado('pac_ana_demo');
    assert.ok(ultimoOtp?.codigo);

    const verifRes = await fetch(`${url}/otp/verificar`, {
      method: 'POST',
      headers: headersBot,
      body: JSON.stringify({
        pacienteId: 'pac_ana_demo',
        canal: 'whatsapp',
        codigo: ultimoOtp.codigo,
      }),
    });
    assert.equal(verifRes.status, 201);

    const vincularOk = await fetch(`${url}/identidad/vincular`, {
      method: 'POST',
      headers: headersBot,
      body: JSON.stringify({
        pacienteId: 'pac_ana_demo',
        canal: 'whatsapp',
        identificador: '2221234567',
      }),
    });
    assert.equal(vincularOk.status, 201);

    // 4. Al volver a resolver, ya es `conocido`
    const resConocido = await fetch(`${url}/identidad/resolver`, {
      method: 'POST',
      headers: headersBot,
      body: JSON.stringify({ canal: 'whatsapp', identificador: '222 123 4567' }),
    });
    const conocido = await resConocido.json();
    assert.equal(conocido.estado, 'conocido');
    assert.equal(conocido.pacienteId, 'pac_ana_demo');

    // 5. Caso `nuevo`
    const resNuevo = await fetch(`${url}/identidad/resolver`, {
      method: 'POST',
      headers: headersBot,
      body: JSON.stringify({ canal: 'whatsapp', identificador: '5519998877' }),
    });
    const nuevo = await resNuevo.json();
    assert.equal(nuevo.estado, 'nuevo');
    assert.equal(nuevo.pacienteId, undefined);

    // 6. Caso `ambiguo` (dos familiares compartiendo teléfono)
    store.crearPaciente({
      nombre: 'María',
      apellidos: 'Familia Demo',
      telefonoE164: '+522229990000',
    });
    store.crearPaciente({
      nombre: 'Pedro',
      apellidos: 'Familia Demo',
      telefonoE164: '+522229990000',
    });

    const resAmbiguo = await fetch(`${url}/identidad/resolver`, {
      method: 'POST',
      headers: headersBot,
      body: JSON.stringify({ canal: 'whatsapp', identificador: '2229990000' }),
    });
    const ambiguo = await resAmbiguo.json();
    assert.equal(ambiguo.estado, 'ambiguo');
    assert.equal(ambiguo.requiereRevisionAsesor, true);
    assert.equal(ambiguo.pacienteId, undefined);

    // 7. Eventos emitidos verificados
    const tiposEmitidos = events.obtenerEventosEmitidos().map((e) => e.tipo);
    assert.ok(tiposEmitidos.includes('identidad.resuelta'));
    assert.ok(tiposEmitidos.includes('identidad.verificada'));
    assert.ok(tiposEmitidos.includes('identidad.vinculada'));
  } finally {
    await app.close();
  }
});
