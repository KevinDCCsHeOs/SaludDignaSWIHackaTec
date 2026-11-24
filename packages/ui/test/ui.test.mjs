import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { CANALES_ATENCION } = require('@salud-digna/shared');
const { META_CANAL_VISUAL, TOKENS_UI } = require('../dist/index.js');

test('todos los canales oficiales tienen metadatos visuales e i18n en @salud-digna/ui', () => {
  for (const canal of CANALES_ATENCION) {
    assert.ok(META_CANAL_VISUAL[canal], `Falta metadata visual para el canal: ${canal}`);
    assert.ok(META_CANAL_VISUAL[canal].claveI18n.startsWith('canales.'));
  }
  assert.ok(TOKENS_UI.colores.primario);
});
