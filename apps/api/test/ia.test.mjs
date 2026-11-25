import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

process.env.NODE_ENV = 'test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { crearAppNest } = require('../dist/main.js');
const { USUARIOS_DEMO_SEMILLA } = require('../dist/auth/usuarios-demo.js');
const { clasificarMensajeNlp } = require('../dist/ia/clasificador-nlp.js');

test('Issue #24: evaluación de 50 frases etiquetadas supera 85% de precisión y extrae entidades', () => {
  const rutaFrases = path.resolve(__dirname, '../src/ia/eval/frases.json');
  const frases = JSON.parse(fs.readFileSync(rutaFrases, 'utf8'));
  assert.equal(frases.length, 50);

  let aciertos = 0;
  for (const f of frases) {
    const res = clasificarMensajeNlp(f.texto, 'es');
    if (res.intencion === f.intencionEsperada) aciertos += 1;
  }

  const precision = aciertos / frases.length;
  assert.ok(
    precision >= 0.85,
    `Precisión esperada >= 85%, obtenida ${(precision * 100).toFixed(1)}%`,
  );

  // Extracción de entidades (estudio, clínica, fecha)
  const r = clasificarMensajeNlp(
    'Quiero agendar un ultrasonido abdominal en Puebla Centro mañana 9:00',
    'es',
  );
  assert.equal(r.intencion, 'agendar');
  assert.equal(r.entidades.estudioId, 'est_us_abd');
  assert.equal(r.entidades.clinicaId, 'cli_09');
  assert.ok(r.entidades.fecha);
});

test('Issues #24, #25 y #26: guardrails, contexto seguro, escalamiento, vigencias, multilenguaje y lenguaje sencillo', async () => {
  const app = await crearAppNest({ silencioso: true });
  await app.listen(0);
  const url = await app.getUrl();

  const ana = USUARIOS_DEMO_SEMILLA.find((u) => u.rol === 'paciente');
  const admin = USUARIOS_DEMO_SEMILLA.find((u) => u.rol === 'admin');

  try {
    const { accessToken: tokenAna } = await (
      await fetch(`${url}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: ana.email, contrasena: ana.contrasenaDemo }),
      })
    ).json();

    const { accessToken: tokenAdmin } = await (
      await fetch(`${url}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: admin.email, contrasena: admin.contrasenaDemo }),
      })
    ).json();

    // Crear trámite activo de Ana con orden próxima a vencer en 2 días (#25 vigencias)
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

    const venceEn2Dias = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    await fetch(`${url}/tramites/${trm.id}/contexto`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenAna}` },
      body: JSON.stringify({
        canal: 'web',
        datosCapturados: { fechaVencimientoOrden: venceEn2Dias },
      }),
    });

    // 1. Respuesta contextual de IA para Ana sin pedir datos repetidos (#24)
    const resCtx = await (
      await fetch(`${url}/ia/mensaje`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenAna}` },
        body: JSON.stringify({
          mensaje: '¿Cómo va mi trámite?',
          canal: 'web',
          pacienteId: 'pac_ana_demo',
        }),
      })
    ).json();
    assert.equal(resCtx.intencion, 'estatus');
    assert.ok(resCtx.confianza >= 0.6);
    assert.equal(resCtx.mostrarMenu, false);
    assert.match(resCtx.respuesta, new RegExp(trm.folio));
    assert.match(resCtx.respuesta, /Ultrasonido abdominal/i);

    // 2. Guardrail: nunca diagnostica ni receta (#24)
    const resDiag = await (
      await fetch(`${url}/ia/mensaje`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenAna}` },
        body: JSON.stringify({
          mensaje: '¿Qué enfermedad tengo y qué medicamento debo tomar?',
          canal: 'web',
          pacienteId: 'pac_ana_demo',
        }),
      })
    ).json();
    assert.equal(resDiag.guardrailActivado, 'no_diagnostico');
    assert.match(resDiag.respuesta, /no puedo emitir diagnósticos/i);
    assert.match(resDiag.respuesta, /médico|profesional/i);

    // 3. Urgencia con síntomas de alarma -> 911 inmediato + ticket prioridad crítica con resumen <= 5 líneas (#25)
    const resUrg = await (
      await fetch(`${url}/ia/mensaje`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenAna}` },
        body: JSON.stringify({
          mensaje: 'Ayuda, tengo dolor de pecho muy fuerte y no puedo respirar',
          canal: 'whatsapp',
          pacienteId: 'pac_ana_demo',
        }),
      })
    ).json();
    assert.equal(resUrg.intencion, 'urgencia');
    assert.equal(resUrg.guardrailActivado, 'urgencia_911');
    assert.match(resUrg.respuesta, /911/);
    assert.equal(resUrg.escalamiento.prioridad, 'critica');
    assert.ok(resUrg.escalamiento.ticketFolio);
    assert.ok(resUrg.escalamiento.resumenIa.split('\n').length <= 5);

    // 4. Baja confianza (<0.6) muestra menú; 2 seguidas escalan automáticamente a humano (#24, #25)
    const low1 = await (
      await fetch(`${url}/ia/mensaje`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenAna}` },
        body: JSON.stringify({
          mensaje: 'asdfghjkl blablabla 123',
          canal: 'web',
          pacienteId: 'pac_ana_demo',
        }),
      })
    ).json();
    assert.ok(low1.confianza < 0.6);
    assert.equal(low1.mostrarMenu, true);
    assert.equal(low1.escalamiento, null);

    const low2 = await (
      await fetch(`${url}/ia/mensaje`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenAna}` },
        body: JSON.stringify({
          mensaje: 'qwerty zxcvb sin sentido',
          canal: 'web',
          pacienteId: 'pac_ana_demo',
        }),
      })
    ).json();
    assert.ok(low2.escalamiento);
    assert.equal(low2.escalamiento.requerido, true);
    assert.ok(low2.escalamiento.tiempoEsperaMinutos >= 1);
    assert.match(low2.respuesta, /espera/i);

    // 5. Detección de idioma inglés -> responde en inglés y guarda preferencia en el paciente (#26)
    const resEn = await (
      await fetch(`${url}/ia/mensaje`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenAna}` },
        body: JSON.stringify({
          mensaje: 'Hello, how much does an abdominal ultrasound cost?',
          canal: 'web',
          pacienteId: 'pac_ana_demo',
        }),
      })
    ).json();
    assert.equal(resEn.idioma, 'en');
    assert.equal(resEn.intencion, 'cotizar');
    assert.match(resEn.respuesta, /approximate cost|\$450/i);

    const perfilRes = await (
      await fetch(`${url}/identidad/pacientes/pac_ana_demo/resumen`, {
        headers: { Authorization: `Bearer ${tokenAdmin}` },
      })
    ).json();
    assert.equal(perfilRes.idioma, 'en');

    // Restaurar español vía endpoint PATCH de preferencia de idioma (#26)
    const patchLang = await fetch(`${url}/identidad/pacientes/pac_ana_demo/idioma`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenAna}` },
      body: JSON.stringify({ idioma: 'es' }),
    });
    assert.equal(patchLang.status, 200);

    // 6. Náhuatl base + modo "explícame fácil" + glosario y preparación sencilla (#26)
    const resNah = await (
      await fetch(`${url}/ia/mensaje`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensaje: 'Niltze, cualli tonalli', canal: 'whatsapp' }),
      })
    ).json();
    assert.equal(resNah.idioma, 'nah');
    assert.match(resNah.respuesta, /Niltze/i);

    const resFacil = await (
      await fetch(`${url}/ia/mensaje`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mensaje: 'Explícame fácil qué es ayuno para ultrasonido abdominal',
          canal: 'web',
          modoSencillo: true,
        }),
      })
    ).json();
    assert.match(resFacil.respuesta, /No comas|agua simple/i);

    const prepSencilla = await (
      await fetch(`${url}/ia/estudios/est_us_abd/preparacion-sencilla?idioma=es`)
    ).json();
    assert.match(prepSencilla.preparacionSencilla, /Explicación sencilla/i);

    const glosario = await (await fetch(`${url}/ia/glosario?q=ayuno`)).json();
    assert.ok(glosario.totalTerminos >= 1);
    assert.equal(glosario.estudios.length, 30);

    // 7. Job de vigencias: detecta orden por vencer en <= 3 días y evita duplicados el mismo día (#25)
    const vig1 = await (
      await fetch(`${url}/ia/vigencias/verificar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenAdmin}` },
        body: JSON.stringify({}),
      })
    ).json();
    assert.ok(vig1.recordatoriosEnviados.some((a) => a.tramiteId === trm.id));

    const vig2 = await (
      await fetch(`${url}/ia/vigencias/verificar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenAdmin}` },
        body: JSON.stringify({}),
      })
    ).json();
    assert.equal(vig2.recordatoriosEnviados.length, 0);

    // 8. Registro de respuestas de IA en interacciones para auditoría (#24)
    const inters = await (
      await fetch(`${url}/canales/interacciones/pac_ana_demo`, {
        headers: { Authorization: `Bearer ${tokenAdmin}` },
      })
    ).json();
    assert.ok(inters.interacciones.some((i) => i.actorTipo === 'asesor_ia'));
  } finally {
    await app.close();
  }
});
