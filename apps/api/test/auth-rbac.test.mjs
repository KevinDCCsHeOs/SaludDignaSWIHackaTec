import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

process.env.NODE_ENV = 'test';

const require = createRequire(import.meta.url);
const { crearAppNest } = require('../dist/main.js');
const { USUARIOS_DEMO_SEMILLA } = require('../dist/auth/usuarios-demo.js');

async function iniciarServidorPruebas() {
  const app = await crearAppNest({ silencioso: true });
  await app.listen(0);
  const url = await app.getUrl();
  return { app, url };
}

async function loginComo(url, rol) {
  const u = USUARIOS_DEMO_SEMILLA.find((x) => x.rol === rol);
  const res = await fetch(`${url}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: u.email, contrasena: u.contrasenaDemo }),
  });
  return { res, body: await res.json() };
}

test('Issue #6: login JWT, refresh con rotación, /auth/me, logout y RBAC por rol', async () => {
  const { app, url } = await iniciarServidorPruebas();
  try {
    // 1. Login exitoso como admin + cookie httpOnly
    const { res: resAdmin, body: adminAuth } = await loginComo(url, 'admin');
    assert.equal(resAdmin.status, 200);
    assert.ok(adminAuth.accessToken);
    assert.ok(adminAuth.refreshToken);
    assert.equal(adminAuth.expiresIn, 900);
    assert.match(resAdmin.headers.get('set-cookie') ?? '', /HttpOnly/i);
    assert.equal(adminAuth.usuario.passwordHash, undefined);

    // 2. GET /auth/me devuelve perfil y permisos sin contraseña
    const meRes = await fetch(`${url}/auth/me`, {
      headers: { Authorization: `Bearer ${adminAuth.accessToken}` },
    });
    assert.equal(meRes.status, 200);
    const me = await meRes.json();
    assert.equal(me.rol, 'admin');
    assert.ok(me.permisos.includes('auditoria:leer'));

    // 3. Refresh rota el token e invalida el refresh token anterior
    const refRes = await fetch(`${url}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: adminAuth.refreshToken }),
    });
    assert.equal(refRes.status, 200);
    const nuevoPar = await refRes.json();
    assert.notEqual(nuevoPar.refreshToken, adminAuth.refreshToken);

    const replayRes = await fetch(`${url}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: adminAuth.refreshToken }),
    });
    assert.equal(replayRes.status, 401);

    // 4. Logout revoca el nuevo refresh token
    const logoutRes = await fetch(`${url}/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${nuevoPar.accessToken}`,
      },
      body: JSON.stringify({ refreshToken: nuevoPar.refreshToken }),
    });
    assert.equal(logoutRes.status, 200);

    const trasLogout = await fetch(`${url}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: nuevoPar.refreshToken }),
    });
    assert.equal(trasLogout.status, 401);

    // 5. Autorización estricta por rol
    const { body: pacienteAuth } = await loginComo(url, 'paciente');
    const { body: asesorAuth } = await loginComo(url, 'asesor');

    const audPaciente = await fetch(`${url}/admin/auditoria`, {
      headers: { Authorization: `Bearer ${pacienteAuth.accessToken}` },
    });
    assert.equal(audPaciente.status, 403);

    const audAsesor = await fetch(`${url}/admin/auditoria`, {
      headers: { Authorization: `Bearer ${asesorAuth.accessToken}` },
    });
    assert.equal(audAsesor.status, 403);

    const audAdmin = await fetch(`${url}/admin/auditoria`, {
      headers: { Authorization: `Bearer ${nuevoPar.accessToken}` },
    });
    assert.equal(audAdmin.status, 200);

    // Asesor común no puede fusionar pacientes (solo asesor_pro / admin)
    const mergeAsesor = await fetch(`${url}/identidad/merge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${asesorAuth.accessToken}`,
      },
      body: JSON.stringify({
        pacienteOrigenId: 'pac_a',
        pacienteDestinoId: 'pac_b',
        motivo: 'test',
      }),
    });
    assert.equal(mergeAsesor.status, 403);

    // 6. Rate limit en login tras 5 intentos fallidos
    for (let i = 0; i < 5; i++) {
      const fail = await fetch(`${url}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'medico.puebla@demo.saluddigna.local',
          contrasena: 'Incorrecta!',
        }),
      });
      assert.equal(fail.status, 401);
    }
    const bloqueado = await fetch(`${url}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'medico.puebla@demo.saluddigna.local',
        contrasena: 'Incorrecta!',
      }),
    });
    assert.equal(bloqueado.status, 429);
  } finally {
    await app.close();
  }
});
