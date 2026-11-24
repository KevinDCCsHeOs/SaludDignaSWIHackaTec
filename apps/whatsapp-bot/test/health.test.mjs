import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { crearEstadoSaludBot } = require('../dist/main.js');

test('whatsapp-bot importa @salud-digna/shared y opera en canal whatsapp', () => {
  const salud = crearEstadoSaludBot();
  assert.equal(salud.servicio, 'whatsapp-bot');
  assert.equal(salud.canal, 'whatsapp');
  assert.ok(salud.eventosConocidos >= 16);
});
