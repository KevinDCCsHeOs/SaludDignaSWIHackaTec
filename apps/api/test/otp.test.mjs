import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

process.env.NODE_ENV = 'test';

const require = createRequire(import.meta.url);
const { crearAppNest } = require('../dist/main.js');
const { OtpService } = require('../dist/otp/otp.service.js');
const { KeyValueStoreService } = require('../dist/common/redis/kv-store.service.js');
const { AuditoriaService } = require('../dist/auditoria/auditoria.service.js');
const { USUARIOS_DEMO_SEMILLA } = require('../dist/auth/usuarios-demo.js');
const { obtenerTokenServicioBot } = require('../dist/auth/guards.js');

test('Issue #8: OTP hasheado, bloqueo tras 3 fallos, expiración clara, bloqueo de contexto sin OTP y Call Center', async () => {
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
    const kv = app.get(KeyValueStoreService);
    const auditoria = app.get(AuditoriaService);

    // 1. Sin OTP válido, no se muestra ningún dato del trámite/contexto (403)
    const sinOtp = await fetch(`${url}/identidad/pacientes/pac_ana_demo/contexto-seguro`, {
      headers: headersBot,
    });
    assert.equal(sinOtp.status, 403);

    // 2. Mensaje claro cuando no existe / expiró el código
    const expiradoRes = await fetch(`${url}/otp/verificar`, {
      method: 'POST',
      headers: headersBot,
      body: JSON.stringify({
        pacienteId: 'pac_ana_demo',
        canal: 'whatsapp',
        codigo: '123456',
      }),
    });
    assert.equal(expiradoRes.status, 400);
    const expiradoBody = await expiradoRes.json();
    assert.match(expiradoBody.message, /expirado/i);

    // 3. Solicitar OTP: debe guardarse HASHEADO, nunca en texto plano
    const solRes = await fetch(`${url}/otp/solicitar`, {
      method: 'POST',
      headers: headersBot,
      body: JSON.stringify({ pacienteId: 'pac_ana_demo', canal: 'whatsapp' }),
    });
    assert.equal(solRes.status, 201);
    const despacho = otpService.obtenerUltimoOtpSimulado('pac_ana_demo');
    assert.match(despacho.codigo, /^\d{6}$/);

    const almacenado = await kv.get('otp:pac_ana_demo');
    assert.ok(almacenado);
    assert.equal(almacenado.includes(despacho.codigo), false);

    // 4. 3 intentos fallidos -> bloqueo temporal (429) y registro en auditoría
    const codigoMalo = despacho.codigo === '000000' ? '111111' : '000000';
    for (let i = 0; i < 2; i++) {
      const f = await fetch(`${url}/otp/verificar`, {
        method: 'POST',
        headers: headersBot,
        body: JSON.stringify({
          pacienteId: 'pac_ana_demo',
          canal: 'whatsapp',
          codigo: codigoMalo,
        }),
      });
      assert.equal(f.status, 401);
    }
    const tercerFallo = await fetch(`${url}/otp/verificar`, {
      method: 'POST',
      headers: headersBot,
      body: JSON.stringify({
        pacienteId: 'pac_ana_demo',
        canal: 'whatsapp',
        codigo: codigoMalo,
      }),
    });
    assert.equal(tercerFallo.status, 429);

    // 5. Desbloquear para probar flujo exitoso y acceso a contexto-seguro
    await kv.del('otp:lock:pac_ana_demo');
    await fetch(`${url}/otp/solicitar`, {
      method: 'POST',
      headers: headersBot,
      body: JSON.stringify({ pacienteId: 'pac_ana_demo', canal: 'whatsapp' }),
    });
    const nuevoDespacho = otpService.obtenerUltimoOtpSimulado('pac_ana_demo');
    const okRes = await fetch(`${url}/otp/verificar`, {
      method: 'POST',
      headers: headersBot,
      body: JSON.stringify({
        pacienteId: 'pac_ana_demo',
        canal: 'whatsapp',
        codigo: nuevoDespacho.codigo,
      }),
    });
    assert.equal(okRes.status, 201);

    const conOtp = await fetch(`${url}/identidad/pacientes/pac_ana_demo/contexto-seguro`, {
      headers: headersBot,
    });
    assert.equal(conOtp.status, 200);
    const perfilIa = await conOtp.json();
    // Minimización para IA (#10 / ADR 0009): no expone CURP ni teléfono al bot
    assert.equal(perfilIa.curp, undefined);
    assert.equal(perfilIa.telefonoE164, undefined);

    // 6. Verificación por preguntas de seguridad en Call Center (asesor autenticado)
    const asesor = USUARIOS_DEMO_SEMILLA.find((u) => u.rol === 'asesor');
    const loginAsesor = await fetch(`${url}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: asesor.email, contrasena: asesor.contrasenaDemo }),
    });
    const { accessToken } = await loginAsesor.json();

    const ccRes = await fetch(`${url}/otp/verificar-call-center`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        pacienteId: 'pac_ana_demo',
        fechaNacimiento: '1995-04-12',
        ultimosDigitosTelefono: '4567',
      }),
    });
    assert.equal(ccRes.status, 201);
    const ccBody = await ccRes.json();
    assert.equal(ccBody.verificado, true);
    assert.equal(ccBody.canal, 'call_center');

    // 7. Quedó registro en auditoría
    await auditoria.flush();
    const registrosOtp = auditoria.consultar({
      pacienteId: 'pac_ana_demo',
      accion: 'verificar_otp',
    });
    assert.ok(registrosOtp.length >= 4);
  } finally {
    await app.close();
  }
});
