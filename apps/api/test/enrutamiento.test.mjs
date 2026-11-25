import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

process.env.NODE_ENV = 'test';

const require = createRequire(import.meta.url);
const { crearAppNest } = require('../dist/main.js');
const { USUARIOS_DEMO_SEMILLA } = require('../dist/auth/usuarios-demo.js');

test('Traspaso v2: el núcleo expone la ruta por riesgo, igual para todos los canales', async () => {
  const app = await crearAppNest({ silencioso: true });
  await app.listen(0);
  const url = await app.getUrl();
  try {
    const asesor = USUARIOS_DEMO_SEMILLA.find((u) => u.rol === 'asesor');
    const { accessToken } = await (
      await fetch(`${url}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: asesor.email, contrasena: asesor.contrasenaDemo }),
      })
    ).json();
    const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` };

    const catalogo = await (await fetch(`${url}/enrutamiento/catalogo`, { headers: h })).json();
    assert.equal(catalogo.solicitudes.length, 16);
    assert.equal(catalogo.rutas.length, 5);

    // Raúl (cónyuge, sin permiso de resultados) pide el reenvío de los resultados de Ana
    const raul = await (
      await fetch(`${url}/enrutamiento/evaluar`, {
        method: 'POST',
        headers: h,
        body: JSON.stringify({ solicitud: 'ree', permiso: 'no' }),
      })
    ).json();
    assert.equal(raul.ruta, 'Evitar');
    assert.equal(raul.botBloqueado, true);
    assert.ok(raul.motivos.includes('acceso de un tercero sin autorización'));

    const invalida = await fetch(`${url}/enrutamiento/evaluar`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ solicitud: 'no-existe' }),
    });
    assert.equal(invalida.status, 400);
  } finally {
    await app.close();
  }
});
