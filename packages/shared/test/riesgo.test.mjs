import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { evaluarRutaPorRiesgo, SOLICITUDES_RIESGO } = require('../dist/riesgo.js');

const aqui = path.dirname(fileURLToPath(import.meta.url));
const especificaciones = path.join(
  aqui,
  '..',
  '..',
  '..',
  'docs',
  'v2-handoff',
  'especificaciones',
);
const perfiles = JSON.parse(fs.readFileSync(path.join(especificaciones, 'perfiles.json'), 'utf8'));
const solicitudes = JSON.parse(
  fs.readFileSync(path.join(especificaciones, 'solicitudes.json'), 'utf8'),
);
const escenarios = fs
  .readFileSync(path.join(especificaciones, 'escenarios-prueba.jsonl'), 'utf8')
  .split('\n')
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l));

test('Traspaso v2: el catálogo de solicitudes coincide con solicitudes.json', () => {
  assert.equal(SOLICITUDES_RIESGO.length, solicitudes.length);
  for (const s of solicitudes) {
    const nuestra = SOLICITUDES_RIESGO.find((x) => x.id === s.id);
    assert.ok(nuestra, `Falta la solicitud ${s.id}`);
    assert.equal(nuestra.probabilidad * nuestra.impacto, s.riesgo_base, s.id);
    assert.equal(nuestra.permisoRequerido, s.permiso_requerido, s.id);
  }
});

test('Traspaso v2: los 640 escenarios (perfil × canal × solicitud) dan el riesgo, la ruta y el permiso esperados', () => {
  assert.equal(escenarios.length, 640);
  const fallas = [];
  for (const e of escenarios) {
    const perfil = perfiles.find((p) => p.id === e.perfil);
    const solicitud = solicitudes.find((s) => s.id === e.solicitud);
    const permiso = perfil.permisos[solicitud.permiso_requerido];
    if (permiso !== e.permiso) {
      fallas.push(`${e.perfil}/${e.canal}/${e.solicitud}: permiso ${permiso} ≠ ${e.permiso}`);
      continue;
    }
    const d = evaluarRutaPorRiesgo({ solicitud: e.solicitud, permiso });
    if (d.riesgo !== e.riesgo || d.ruta !== e.ruta) {
      fallas.push(
        `${e.perfil}/${e.canal}/${e.solicitud}: ${d.riesgo}/${d.ruta} ≠ ${e.riesgo}/${e.ruta}`,
      );
    }
    for (const ajuste of e.ajustes) {
      if (!d.motivos.includes(ajuste)) fallas.push(`${e.perfil}/${e.solicitud}: falta "${ajuste}"`);
    }
  }
  assert.deepEqual(fallas, []);
});

test('Traspaso v2: ajustes del árbol (estrés, otra lengua, urgencia y verificación)', () => {
  // Estrés: +5 sube un nivel (agendar 6 → 11, Reducir → Compartir)
  assert.equal(evaluarRutaPorRiesgo({ solicitud: 'age', estres: true }).ruta, 'Compartir');
  // Otra lengua con contenido clínico: mínimo Compartir
  assert.equal(evaluarRutaPorRiesgo({ solicitud: 'age', otraLengua: true }).ruta, 'Compartir');
  // Otra lengua sin contenido clínico no cambia la ruta
  assert.equal(evaluarRutaPorRiesgo({ solicitud: 'cot', otraLengua: true }).ruta, 'Aceptar');
  // Urgencia por falta del resultado: mínimo Escalar
  assert.equal(
    evaluarRutaPorRiesgo({ solicitud: 'ret', urgenciaPorResultado: true }).ruta,
    'Escalar',
  );
  // Valor crítico y emergencia: siempre Evitar, el bot queda bloqueado
  const cri = evaluarRutaPorRiesgo({ solicitud: 'cri' });
  assert.equal(cri.ruta, 'Evitar');
  assert.equal(cri.botBloqueado, true);
  // Identidad no verificada: se pide código antes de cualquier dato
  assert.equal(
    evaluarRutaPorRiesgo({ solicitud: 'ree', identidadVerificada: false }).requiereVerificacion,
    true,
  );
  assert.equal(
    evaluarRutaPorRiesgo({ solicitud: 'cot', identidadVerificada: false }).requiereVerificacion,
    false,
  );
});
