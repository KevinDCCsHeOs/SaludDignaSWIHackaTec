import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

process.env.NODE_ENV = 'test';
process.env.PLAZOS_PERFIL = 'exposicion';

const require = createRequire(import.meta.url);
const { SesionWaStore } = require('../dist/cloud-api/sesion-store.js');
const { ClienteMetaCloudApi } = require('../dist/cloud-api/cliente-meta.js');
const { MaquinaDialogoWhatsapp } = require('../dist/flujos/maquina-dialogo.js');

function sesionVerificada(ultimoMensajeEn) {
  return {
    telefono: '5215512345678',
    pacienteId: 'pac_ana_demo',
    nombrePaciente: 'Ana',
    tramiteId: 'trm_01',
    clinicaId: null,
    paso: 'menu_principal',
    pasoInterrumpido: null,
    idioma: 'es',
    ultimoMensajeEn,
  };
}

test('Traspaso v2: con el trámite en llamada, el bot avisa una sola vez y luego guarda silencio', async () => {
  const hasta = new Date(Date.now() + 60_000).toISOString();
  const apiMock = {
    obtenerContexto: async () => ({
      tramiteId: 'trm_01',
      contexto: { propietario: { canal: 'call_center', hasta, exclusivo: true } },
    }),
    registrarInteraccion: async () => ({ ok: true }),
  };
  const meta = new ClienteMetaCloudApi();
  const sesiones = new SesionWaStore();
  sesiones.guardar(sesionVerificada(new Date().toISOString()));
  const dialogo = new MaquinaDialogoWhatsapp(apiMock, meta, sesiones);

  await dialogo.procesarMensajeEntrante({
    messageId: 'wamid.t1',
    telefono: '5215512345678',
    texto: '¿Ya quedó mi cita?',
  });
  await dialogo.procesarMensajeEntrante({
    messageId: 'wamid.t2',
    telefono: '5215512345678',
    texto: '¿Hola?',
  });

  const enviados = meta.obtenerHistorial();
  assert.equal(enviados.length, 1);
  assert.match(enviados[0].payload.text.body, /teléfono/);
});

test('Traspaso v2: un solo aviso de inactividad y cierre sin mensaje, con la hora del umbral', async () => {
  const reportes = [];
  const apiMock = {
    reportarInactividad: async (r) => {
      reportes.push(r);
    },
  };
  const meta = new ClienteMetaCloudApi();
  const sesiones = new SesionWaStore();
  const ultimo = Date.parse('2026-11-25T10:00:00.000Z');
  sesiones.guardar(sesionVerificada(new Date(ultimo).toISOString()));
  const dialogo = new MaquinaDialogoWhatsapp(apiMock, meta, sesiones);

  // 40 s sin respuesta (exposición: aviso a los 30 s, cierre a los 60 s)
  assert.equal(await dialogo.revisarInactividad(ultimo + 40_000), 1);
  assert.equal(await dialogo.revisarInactividad(ultimo + 45_000), 0, 'el aviso no se repite');
  assert.equal(meta.obtenerHistorial().length, 1);
  assert.match(meta.obtenerHistorial()[0].payload.text.body, /CONTINUAR/);
  assert.equal(reportes[0].tipo, 'aviso');
  assert.equal(reportes[0].ocurridoEn, '2026-11-25T10:00:30.000Z');

  // 70 s: se cierra la conversación sin enviar nada
  assert.equal(await dialogo.revisarInactividad(ultimo + 70_000), 1);
  assert.equal(meta.obtenerHistorial().length, 1, 'el cierre no envía mensaje');
  assert.equal(reportes[1].tipo, 'cierre');
  assert.equal(reportes[1].ocurridoEn, '2026-11-25T10:01:00.000Z');
  assert.ok(sesiones.obtener('5215512345678').cerradaEn);
});
