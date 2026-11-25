import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

process.env.NODE_ENV = 'test';

const require = createRequire(import.meta.url);
const { crearAppNest } = require('../dist/main.js');
const { obtenerTokenServicioBot } = require('../dist/auth/guards.js');
const { USUARIOS_DEMO_SEMILLA } = require('../dist/auth/usuarios-demo.js');

test('Issue #39: el bot guarda y recupera su conversación por hash del teléfono, y nadie más puede leerla', async () => {
  const app = await crearAppNest({ silencioso: true });
  await app.listen(0);
  const url = await app.getUrl();
  const headersBot = {
    'Content-Type': 'application/json',
    'x-service-token': obtenerTokenServicioBot(),
    'x-canal': 'whatsapp',
  };
  const clave = createHash('sha256').update('5215512345678').digest('hex');
  const sesion = {
    telefono: '5215512345678',
    pacienteId: 'pac_ana_demo',
    paso: 'esperando_otp',
    idioma: 'es',
    ultimoMensajeEn: new Date().toISOString(),
  };

  try {
    const vacia = await (
      await fetch(`${url}/canales/whatsapp/sesiones/${clave}`, { headers: headersBot })
    ).json();
    assert.equal(vacia.sesion, null);

    const guardar = await fetch(`${url}/canales/whatsapp/sesiones/${clave}`, {
      method: 'PUT',
      headers: headersBot,
      body: JSON.stringify({ sesion }),
    });
    assert.equal(guardar.status, 200);

    const leida = await (
      await fetch(`${url}/canales/whatsapp/sesiones/${clave}`, { headers: headersBot })
    ).json();
    assert.deepEqual(leida.sesion, sesion);

    // Claves que no son SHA-256 (por ejemplo, el teléfono en claro) se rechazan
    const claveInvalida = await fetch(`${url}/canales/whatsapp/sesiones/5215512345678`, {
      headers: headersBot,
    });
    assert.equal(claveInvalida.status, 400);

    // Un paciente autenticado no puede leer conversaciones del bot
    const ana = USUARIOS_DEMO_SEMILLA.find((u) => u.rol === 'paciente');
    const { accessToken } = await (
      await fetch(`${url}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: ana.email, contrasena: ana.contrasenaDemo }),
      })
    ).json();
    const ajena = await fetch(`${url}/canales/whatsapp/sesiones/${clave}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    assert.equal(ajena.status, 403);
  } finally {
    await app.close();
  }
});
