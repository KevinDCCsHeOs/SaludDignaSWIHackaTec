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

test('incluye los eventos de transición genérica, cancelación y asignación (#12, #16)', () => {
  const tipos = new Set(CATALOGO_EVENTOS.map((e) => e.tipo));
  for (const requerido of ['tramite.avanzado', 'tramite.cancelado', 'ticket.asignado']) {
    assert.ok(tipos.has(requerido), `Falta el evento: ${requerido}`);
  }
});

test('traspaso v2: catálogo con canal propietario, temporizadores, ruta por riesgo y seguimiento', () => {
  const tipos = new Set(CATALOGO_EVENTOS.map((e) => e.tipo));
  for (const requerido of [
    'sesion.aviso_inactividad',
    'contexto.transferido',
    'canal.propietario_liberado',
    'cita.apartada',
    'cupo.liberado',
    'identidad.codigo_enviado',
    'identidad.codigo_vencido',
    'enrutamiento.escalado',
    'acceso.denegado',
    'resultado.valor_critico',
    'compromiso.vencido',
  ]) {
    assert.ok(tipos.has(requerido), `Falta el evento v2: ${requerido}`);
  }
});

test('traspaso v2: los campos de actor, hora del hecho, versión e idempotencia son opcionales y se validan', () => {
  const base = CATALOGO_EVENTOS.find((e) => e.tipo === 'clinica.seleccionada').ejemplo;
  // Compatibilidad: un evento sin los campos v2 sigue siendo válido
  assert.equal(validarEventoOmnicanalSeguro(base).success, true);

  const conV2 = validarEventoOmnicanalSeguro({
    ...base,
    ocurridoEn: '2026-11-24T10:14:00Z',
    rolActor: 'tutor',
    versionTramite: 2,
    correlacionId: 'conv_web_01',
    llaveIdempotencia: 'clinica.seleccionada:trm_456:1',
  });
  assert.equal(conV2.success, true);

  assert.equal(validarEventoOmnicanalSeguro({ ...base, rolActor: 'vecino' }).success, false);
  assert.equal(validarEventoOmnicanalSeguro({ ...base, ocurridoEn: 'ayer' }).success, false);
});
