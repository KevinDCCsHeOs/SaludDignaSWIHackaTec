import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { crearEstadoSaludWeb } = require('../dist/main.js');

test('web importa @salud-digna/shared y @salud-digna/ui correctamente', () => {
  const salud = crearEstadoSaludWeb();
  assert.equal(salud.servicio, 'web');
  assert.equal(salud.canal, 'web');
  assert.ok(salud.rolesSoportados.includes('paciente'));
});
