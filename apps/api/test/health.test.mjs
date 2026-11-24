import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { crearEstadoSaludApi } = require('../dist/main.js');

test('el núcleo API importa el contrato compartido y reporta salud', () => {
  const salud = crearEstadoSaludApi();
  assert.equal(salud.servicio, 'api');
  assert.equal(salud.estado, 'ok');
  assert.ok(salud.canalesSoportados.includes('whatsapp'));
  assert.ok(salud.eventosCatalogo >= 16);
});
