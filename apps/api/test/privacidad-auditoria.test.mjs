import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

process.env.NODE_ENV = 'test';

const require = createRequire(import.meta.url);
const { crearAppNest } = require('../dist/main.js');
const { CifradoService } = require('../dist/privacidad/cifrado.service.js');
const { mask } = require('../dist/privacidad/enmascarado.js');
const {
  sanitizarObjetoParaLog,
  sanitizarTextoParaLog,
} = require('../dist/privacidad/sanitizador-logs.js');
const { AuditoriaService } = require('../dist/auditoria/auditoria.service.js');
const { EventPublisherService } = require('../dist/common/eventos/event-publisher.service.js');
const { USUARIOS_DEMO_SEMILLA } = require('../dist/auth/usuarios-demo.js');

test('Issue #10: cifrado AES-256-GCM, curp_hash determinista, mask() y sanitización de logs sin PII', () => {
  const cifrado = new CifradoService(
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    'pepper-pruebas',
  );
  const curp = 'LOPA950412MPLRZN04';
  const c1 = cifrado.cifrar(curp);
  const c2 = cifrado.cifrar(curp);

  assert.ok(c1.startsWith('enc:v1:'));
  assert.notEqual(c1, c2); // IV aleatorio distinto cada vez
  assert.equal(cifrado.descifrar(c1), curp);
  assert.equal(cifrado.descifrar(c2), curp);

  // Hash determinista de 64 hex chars para WHERE curp_hash = ?
  const h1 = cifrado.hashCurp(curp);
  const h2 = cifrado.hashCurp(' lopa950412mplrzn04 ');
  assert.equal(h1.length, 64);
  assert.equal(h1, h2);

  // Enmascarado
  assert.equal(mask(curp, 'curp'), '****ZN04');
  assert.equal(mask('ana.lopez@demo.saluddigna.local', 'email'), 'a***@demo.saluddigna.local');
  assert.equal(mask('+522221234567', 'telefono'), '+52******4567');
  assert.equal(mask('1995-04-12', 'fecha_nacimiento'), '****-**-**');

  // Ningún dato sensible sobrevive en logs
  const textoLog = sanitizarTextoParaLog(
    'Paciente CURP LOPA950412MPLRZN04 email ana.lopez@demo.saluddigna.local tel +52 222 123 4567',
  );
  assert.equal(textoLog.includes('LOPA950412MPLRZN04'), false);
  assert.equal(textoLog.includes('ana.lopez@demo.saluddigna.local'), false);
  assert.equal(textoLog.includes('222 123 4567'), false);

  const objLog = sanitizarObjetoParaLog({
    contrasena: 'Secreta123!',
    curp: 'LOPA950412MPLRZN04',
    mensaje: 'Hola, mi estudio de glucosa',
    ruta: '/identidad/resolver',
  });
  assert.equal(objLog.contrasena, '[REDACTADO]');
  assert.equal(objLog.curp, '[REDACTADO]');
  assert.equal(objLog.mensaje, '[REDACTADO]');
  assert.equal(objLog.ruta, '/identidad/resolver');
});

test('Issues #10 y #11: consentimiento, enmascarado en consola asesor, auditoría automática y exportación CSV solo admin', async () => {
  const app = await crearAppNest({ silencioso: true });
  await app.listen(0);
  const url = await app.getUrl();

  try {
    const auditoria = app.get(AuditoriaService);
    const events = app.get(EventPublisherService);

    // 1. Aviso de privacidad público
    const avisoRes = await fetch(`${url}/privacidad/aviso`);
    assert.equal(avisoRes.status, 200);
    const aviso = await avisoRes.json();
    assert.equal(aviso.version, 'v1.0-2026');
    assert.ok(aviso.simplificado.length > 20);

    // 2. Login como asesor y como admin
    const asesor = USUARIOS_DEMO_SEMILLA.find((u) => u.rol === 'asesor');
    const admin = USUARIOS_DEMO_SEMILLA.find((u) => u.rol === 'admin');
    const { accessToken: tokenAsesor } = await (
      await fetch(`${url}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: asesor.email, contrasena: asesor.contrasenaDemo }),
      })
    ).json();
    const { accessToken: tokenAdmin } = await (
      await fetch(`${url}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: admin.email, contrasena: admin.contrasenaDemo }),
      })
    ).json();

    // 3. Registrar consentimiento del paciente (fecha + canal + evento consentimiento.otorgado)
    const consRes = await fetch(`${url}/privacidad/consentimientos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenAsesor}`,
      },
      body: JSON.stringify({
        pacienteId: 'pac_ana_demo',
        canal: 'whatsapp',
        tipo: 'aviso_privacidad',
      }),
    });
    assert.equal(consRes.status, 201);
    const cons = await consRes.json();
    assert.equal(cons.canal, 'whatsapp');
    assert.ok(cons.otorgadoEn);
    assert.ok(events.obtenerEventosEmitidos().some((e) => e.tipo === 'consentimiento.otorgado'));

    // 4. Consulta del asesor al expediente -> datos enmascarados + registro automático en auditoría
    const expRes = await fetch(`${url}/identidad/pacientes/pac_ana_demo/resumen`, {
      headers: {
        Authorization: `Bearer ${tokenAsesor}`,
        'x-canal': 'call_center',
      },
    });
    assert.equal(expRes.status, 200);
    const resumen = await expRes.json();
    assert.equal(resumen.curp, '****ZN04');
    assert.equal(resumen.telefonoE164, '+52******4567');
    assert.equal(resumen.fechaNacimiento, '****-**-**');

    await auditoria.flush();

    // 5. Admin consulta bitácora filtrada por paciente y exporta CSV
    const bitacoraRes = await fetch(`${url}/admin/auditoria?pacienteId=pac_ana_demo`, {
      headers: { Authorization: `Bearer ${tokenAdmin}` },
    });
    assert.equal(bitacoraRes.status, 200);
    const bitacora = await bitacoraRes.json();
    assert.ok(
      bitacora.registros.some(
        (r) =>
          r.usuarioId === asesor.id &&
          r.accion === 'leer' &&
          r.entidad === 'Paciente' &&
          r.canal === 'call_center',
      ),
    );

    const csvRes = await fetch(`${url}/admin/auditoria/csv?pacienteId=pac_ana_demo`, {
      headers: { Authorization: `Bearer ${tokenAdmin}` },
    });
    assert.equal(csvRes.status, 200);
    const csv = await csvRes.text();
    assert.ok(csv.startsWith('id,creado_en,usuario_id,rol,accion,entidad'));
    assert.ok(csv.includes('pac_ana_demo'));
  } finally {
    await app.close();
  }
});
