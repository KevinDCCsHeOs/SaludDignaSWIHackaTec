import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { crearConfigAppMovil } = require('../dist/index.js');

test('mobile importa @salud-digna/shared y @salud-digna/ui correctamente', () => {
  const cfg = crearConfigAppMovil();
  assert.equal(cfg.canal, 'app');
  assert.equal(cfg.icono, 'smartphone');
});
