import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  CATALOGO_EVENTOS,
  PATRON_TIPO_EVENTO,
  validarEventoOmnicanal,
  validarEventoOmnicanalSeguro,
} = require('../dist/events/index.js');

const EVENTOS_MINIMOS_ISSUE_3 = [
  'paciente.registrado',
  'identidad.resuelta',
  'identidad.verificada',
  'cotizacion.iniciada',
  'estudio.seleccionado',
  'clinica.seleccionada',
  'cita.agendada',
  'cita.confirmada',
  'tramite.pausado',
  'tramite.retomado',
  'canal.cambiado',
  'ticket.creado',
  'ticket.escalado',
  'ticket.cerrado',
  'resultado.liberado',
  'consentimiento.otorgado',
];

test('el catálogo contiene todos los eventos mínimos requeridos en el issue #3', () => {
  const tipos = new Set(CATALOGO_EVENTOS.map((e) => e.tipo));
  for (const requerido of EVENTOS_MINIMOS_ISSUE_3) {
    assert.ok(tipos.has(requerido), `Falta el evento mínimo: ${requerido}`);
  }
});

test('todos los eventos siguen dominio.accion y sus ejemplos pasan validación Zod', () => {
  for (const def of CATALOGO_EVENTOS) {
    assert.match(def.tipo, PATRON_TIPO_EVENTO);
    const parsed = validarEventoOmnicanal(def.ejemplo);
    assert.equal(parsed.tipo, def.tipo);
    assert.equal(parsed.version, def.version);
  }
});

test('rechaza payloads inválidos (UUID malformado, canal inexistente o datos incompletos)', () => {
  const invalidoUuid = validarEventoOmnicanalSeguro({
    ...CATALOGO_EVENTOS[0].ejemplo,
    eventId: 'no-es-uuid',
  });
  assert.equal(invalidoUuid.success, false);

  const invalidoCanal = validarEventoOmnicanalSeguro({
    ...CATALOGO_EVENTOS[0].ejemplo,
    canal: 'telegram',
  });
  assert.equal(invalidoCanal.success, false);

  const invalidoDatos = validarEventoOmnicanalSeguro({
    eventId: '10000000-0000-4000-8000-000000000099',
    tipo: 'clinica.seleccionada',
    version: 1,
    pacienteId: 'pac_ana_demo',
    tramiteId: 'trm_456',
    canal: 'web',
    actor: { tipo: 'paciente', id: 'pac_ana_demo' },
    timestamp: '2026-11-24T10:15:00Z',
    datos: {},
  });
  assert.equal(invalidoDatos.success, false);
});
