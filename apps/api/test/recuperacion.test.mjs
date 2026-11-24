import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

process.env.NODE_ENV = 'test';

const require = createRequire(import.meta.url);
const { crearAppNest } = require('../dist/main.js');
const { RecuperacionAccesoService } = require('../dist/auth/recuperacion.service.js');
const { OtpService } = require('../dist/otp/otp.service.js');
const { USUARIOS_DEMO_SEMILLA } = require('../dist/auth/usuarios-demo.js');
const { obtenerTokenServicioBot } = require('../dist/auth/guards.js');

test('Issue #9: recuperación por correo, token de un solo uso, WhatsApp tras OTP y asistencia sin ver contraseña', async () => {
  const app = await crearAppNest({ silencioso: true });
  await app.listen(0);
  const url = await app.getUrl();

  try {
    const recService = app.get(RecuperacionAccesoService);
    const otpService = app.get(OtpService);
    const ana = USUARIOS_DEMO_SEMILLA.find((u) => u.rol === 'paciente');
    const asesor = USUARIOS_DEMO_SEMILLA.find((u) => u.rol === 'asesor');

    // 1. WhatsApp sin OTP previo es rechazado (403)
    const waSinOtp = await fetch(`${url}/auth/recuperar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telefono: '2221234567', canal: 'whatsapp' }),
    });
    assert.equal(waSinOtp.status, 403);

    // 2. WhatsApp tras OTP exitoso envía enlace
    await fetch(`${url}/otp/solicitar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-service-token': obtenerTokenServicioBot(),
      },
      body: JSON.stringify({ pacienteId: 'pac_ana_demo', canal: 'whatsapp' }),
    });
    const otpAna = otpService.obtenerUltimoOtpSimulado('pac_ana_demo');
    await fetch(`${url}/otp/verificar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-service-token': obtenerTokenServicioBot(),
      },
      body: JSON.stringify({
        pacienteId: 'pac_ana_demo',
        canal: 'whatsapp',
        codigo: otpAna.codigo,
      }),
    });

    const waConOtp = await fetch(`${url}/auth/recuperar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telefono: '2221234567', canal: 'whatsapp' }),
    });
    assert.equal(waConOtp.status, 200);

    // 3. Asesor dispara asistencia: nunca recibe el token ni contraseña en la respuesta
    const loginAsesor = await fetch(`${url}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: asesor.email, contrasena: asesor.contrasenaDemo }),
    });
    const { accessToken: tokenAsesor } = await loginAsesor.json();

    const asistirRes = await fetch(`${url}/auth/asistir-recuperacion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenAsesor}`,
      },
      body: JSON.stringify({ pacienteId: 'pac_ana_demo', canal: 'email' }),
    });
    assert.equal(asistirRes.status, 200);
    const asistirBody = await asistirRes.json();
    assert.equal(asistirBody.enviado, true);
    assert.equal(asistirBody.token, undefined);
    assert.equal(asistirBody.enlace, undefined);

    // 4. Usar el token enviado al paciente para restablecer contraseña (un solo uso)
    const ultimoEnlace = recService
      .obtenerNotificacionesParaPruebas()
      .filter((n) => n.tipo === 'enlace_recuperacion')
      .at(-1);
    assert.ok(ultimoEnlace?.token);

    const restablecerOk = await fetch(`${url}/auth/restablecer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: ultimoEnlace.token,
        nuevaContrasena: 'NuevaClaveSegura2026!',
      }),
    });
    assert.equal(restablecerOk.status, 200);

    // Reutilizar el mismo token debe fallar (un solo uso)
    const reusarToken = await fetch(`${url}/auth/restablecer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: ultimoEnlace.token,
        nuevaContrasena: 'OtraClave2026!',
      }),
    });
    assert.equal(reusarToken.status, 400);

    // 5. Notificación de cambio de contraseña registrada y login funciona con la nueva clave
    const avisosCambio = recService
      .obtenerNotificacionesParaPruebas()
      .filter((n) => n.tipo === 'cambio_contrasena' && n.usuarioId === ana.id);
    assert.equal(avisosCambio.length, 1);

    const loginNuevo = await fetch(`${url}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ana.email, contrasena: 'NuevaClaveSegura2026!' }),
    });
    assert.equal(loginNuevo.status, 200);
  } finally {
    await app.close();
  }
});
