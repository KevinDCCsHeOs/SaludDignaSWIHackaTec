import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { telefonoParaEnvioMeta } = require('../dist/cloud-api/cliente-meta.js');

test('Issue #20: quita el prefijo móvil 521 de México antes de responder por Cloud API', () => {
  assert.equal(telefonoParaEnvioMeta('5215512345678'), '525512345678');
  assert.equal(telefonoParaEnvioMeta('+52 1 55 1234 5678'), '525512345678');
});

test('Issue #20: deja intactos los números que ya están en formato válido', () => {
  assert.equal(telefonoParaEnvioMeta('525512345678'), '525512345678');
  assert.equal(telefonoParaEnvioMeta('15551883307'), '15551883307');
});
