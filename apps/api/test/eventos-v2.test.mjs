import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

process.env.NODE_ENV = 'test';

const require = createRequire(import.meta.url);
const { EventPublisherService } = require('../dist/common/eventos/event-publisher.service.js');
const { traducirEventoATimeline } = require('../dist/timeline/timeline.service.js');

test('Traspaso v2: un reintento con la misma llave de idempotencia no duplica el evento', async () => {
  const publisher = new EventPublisherService();
  let despachados = 0;
  publisher.configurarDespachadorBus(async () => {
    despachados++;
  });

  const entrada = {
    tipo: 'cupo.liberado',
    version: 1,
    pacienteId: 'pac_ana_demo',
    tramiteId: 'trm_demo',
    canal: 'whatsapp',
    actor: { tipo: 'sistema', id: 'temporizadores' },
    rolActor: 'sistema',
    llaveIdempotencia: 'cupo.liberado:trm_demo:1',
    datos: { folio: 'SD-2026-000001', clinicaId: 'cli_demo', fechaHora: '2026-11-26T15:00:00Z' },
  };
  const primero = await publisher.publicar(entrada);
  const reintento = await publisher.publicar(entrada);

  assert.equal(reintento.eventId, primero.eventId);
  assert.equal(despachados, 1);
  assert.equal(publisher.obtenerEventosEmitidos().length, 1);
});

test('Traspaso v2: la hora del hecho se respeta y el timeline la usa como fecha', async () => {
  const publisher = new EventPublisherService();
  const umbral = '2026-11-24T14:00:30.000Z';
  const evento = await publisher.publicar({
    tipo: 'sesion.aviso_inactividad',
    version: 1,
    pacienteId: 'pac_ana_demo',
    tramiteId: null,
    canal: 'whatsapp',
    actor: { tipo: 'sistema', id: 'temporizadores' },
    ocurridoEn: umbral,
    datos: {
      canalConversacion: 'whatsapp',
      inactivoSegundos: 30,
      cierreEnSegundos: 30,
      perfilPlazos: 'exposicion',
    },
  });
  assert.equal(evento.ocurridoEn, umbral);
  assert.notEqual(evento.timestamp, umbral);
  assert.equal(traducirEventoATimeline(evento).fecha, umbral);

  // Sin hora del hecho explícita, coincide con la de registro
  const sinHora = await publisher.publicar({
    tipo: 'identidad.codigo_vencido',
    version: 1,
    pacienteId: 'pac_ana_demo',
    tramiteId: null,
    canal: 'whatsapp',
    actor: { tipo: 'sistema', id: 'temporizadores' },
    datos: { canalEnvio: 'whatsapp' },
  });
  assert.equal(sinHora.ocurridoEn, sinHora.timestamp);
});
