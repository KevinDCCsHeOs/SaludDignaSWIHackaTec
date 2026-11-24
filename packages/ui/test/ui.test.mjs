import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { CANALES_ATENCION } = require('@salud-digna/shared');
const {
  META_CANAL_VISUAL,
  TOKENS_UI,
  construirModeloTimeline,
  renderizarTimelineHtml,
  crearConfigSocketCliente,
} = require('../dist/index.js');

test('todos los canales oficiales tienen metadatos visuales e i18n en @salud-digna/ui', () => {
  for (const canal of CANALES_ATENCION) {
    assert.ok(META_CANAL_VISUAL[canal], `Falta metadata visual para el canal: ${canal}`);
    assert.ok(META_CANAL_VISUAL[canal].claveI18n.startsWith('canales.'));
  }
  assert.ok(TOKENS_UI.colores.primario);
});

test('Issue #15 y #14: componente Timeline reutilizable y configuración de reconexión Socket.IO', () => {
  const items = [
    {
      eventId: 'ev1',
      fecha: '2026-11-24T10:15:00Z',
      canal: 'web',
      actor: 'Paciente',
      actorTipo: 'paciente',
      accion: 'Seleccionó clínica Salud Digna Puebla Centro',
      estado: 'seleccion_clinica',
    },
    {
      eventId: 'ev2',
      fecha: '2026-11-24T14:02:00Z',
      canal: 'whatsapp',
      actor: 'Asistente IA',
      actorTipo: 'asesor_ia',
      accion: 'Trámite retomado en whatsapp',
      estado: 'seleccion_clinica',
    },
  ];

  const modelo = construirModeloTimeline(items);
  assert.equal(modelo[0].esCambioDeCanal, false);
  assert.equal(modelo[1].esCambioDeCanal, true);
  assert.equal(modelo[1].metaCanal.icono, 'message-circle');

  const html = renderizarTimelineHtml(items);
  assert.match(html, /sd-timeline/);
  assert.match(html, /data-canal="whatsapp"/);
  assert.match(html, /data-cambio-canal="true"/);

  const socketCfg = crearConfigSocketCliente('http://localhost:3000', 'jwt-demo');
  assert.equal(socketCfg.options.reconnection, true);
  assert.equal(socketCfg.options.auth.token, 'jwt-demo');
});
