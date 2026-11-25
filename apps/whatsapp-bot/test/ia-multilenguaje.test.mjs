import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { MaquinaDialogoWhatsapp } = require('../dist/flujos/maquina-dialogo.js');
const { ClienteMetaCloudApi } = require('../dist/cloud-api/cliente-meta.js');
const { SesionWaStore } = require('../dist/cloud-api/sesion-store.js');

test('Issues #24, #25 y #26 (bot WhatsApp): urgencia 911 sin bloqueo OTP, inglés, náhuatl y fallback a menú IA', async () => {
  const ticketsCreados = [];
  const consultasIa = [];

  const apiMock = {
    resolverIdentidad: async () => ({ estado: 'nuevo' }),
    solicitarOtp: async () => ({ enviado: true }),
    verificarOtp: async () => ({ verificado: true }),
    vincularIdentidad: async () => ({ ok: true }),
    obtenerPerfilVerificado: async () => ({ nombre: 'Demo', idioma: 'es' }),
    obtenerContexto: async () => null,
    retomarTramite: async () => ({}),
    agendarCita: async () => ({ folio: 'SD-2026-000099' }),
    obtenerClinica: async () => null,
    crearTicketEscalamiento: async (entrada) => {
      ticketsCreados.push(entrada);
      return { folio: 'TK-2026-000911' };
    },
    registrarInteraccion: async () => ({ ok: true }),
    actualizarEstadoEntrega: async () => ({ ok: true }),
    solicitarEnlaceRecuperacion: async () => ({ enviado: true }),
    consultarAsistenteIa: async (entrada) => {
      consultasIa.push(entrada);
      if (entrada.mensaje.includes('???')) {
        return {
          intencion: 'desconocida',
          confianza: 0.35,
          idioma: entrada.idioma ?? 'es',
          respuesta: 'Elige una opción del menú.',
          mostrarMenu: true,
          guardrailActivado: 'ninguno',
          escalamiento: null,
        };
      }
      return {
        intencion: 'cotizar',
        confianza: 0.9,
        idioma: 'en',
        respuesta: 'Abdominal ultrasound costs $450 MXN.',
        mostrarMenu: false,
        guardrailActivado: 'ninguno',
        escalamiento: null,
      };
    },
  };

  const meta = new ClienteMetaCloudApi();
  const sesiones = new SesionWaStore();
  const dialogo = new MaquinaDialogoWhatsapp(apiMock, meta, sesiones);

  // 1. Urgencia 911 inmediata incluso antes de autenticarse (#25)
  await dialogo.procesarMensajeEntrante({
    messageId: 'wamid.urg.1',
    telefono: '+522229990001',
    texto: 'Tengo dolor de pecho muy fuerte',
  });
  assert.equal(ticketsCreados.length, 1);
  assert.equal(ticketsCreados[0].prioridad, 'critica');
  assert.equal(ticketsCreados[0].tipo, 'urgencia');
  assert.match(JSON.stringify(meta.obtenerHistorial().at(-1).payload), /911/);

  // 2. Mensaje en inglés -> detecta 'en' y responde en inglés (#26)
  const sesEn = await dialogo.procesarMensajeEntrante({
    messageId: 'wamid.en.1',
    telefono: '+522229990002',
    texto: 'Hello, I need help',
  });
  assert.equal(sesEn.idioma, 'en');
  assert.match(JSON.stringify(meta.obtenerHistorial().at(-1).payload), /Choose an option/i);

  await dialogo.procesarMensajeEntrante({
    messageId: 'wamid.en.2',
    telefono: '+522229990002',
    texto: 'How much is an abdominal ultrasound?',
  });
  assert.equal(consultasIa.length, 1);
  assert.match(JSON.stringify(meta.obtenerHistorial().at(-1).payload), /\$450 MXN/);

  // 3. Baja confianza desde IA muestra menú interactivo (#24)
  await dialogo.procesarMensajeEntrante({
    messageId: 'wamid.low.1',
    telefono: '+522229990002',
    texto: '???',
  });
  assert.equal(meta.obtenerHistorial().at(-1).tipo, 'interactive_list');

  // 4. Saludo en náhuatl -> detecta 'nah' y responde menú en náhuatl (#26)
  const sesNah = await dialogo.procesarMensajeEntrante({
    messageId: 'wamid.nah.1',
    telefono: '+522229990003',
    texto: 'Niltze, cualli tonalli',
  });
  assert.equal(sesNah.idioma, 'nah');
  assert.match(JSON.stringify(meta.obtenerHistorial().at(-1).payload), /Niltze/i);
});
