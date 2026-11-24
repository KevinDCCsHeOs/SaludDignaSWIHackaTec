import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { crearServidorBot } = require('../dist/main.js');

function firmar(cuerpo, secreto) {
  return `sha256=${createHmac('sha256', secreto).update(cuerpo).digest('hex')}`;
}

function payloadTexto(id, from, texto) {
  return JSON.stringify({
    entry: [
      {
        changes: [
          {
            value: {
              messages: [{ id, from, type: 'text', text: { body: texto } }],
            },
          },
        ],
      },
    ],
  });
}

test('Issues #20 y #21: webhook Meta firmado, deduplicación, estados de entrega y recorrido de Ana en WhatsApp', async () => {
  const appSecret = 'secreto-meta-demo';
  const verifyToken = 'verify-demo-2026';

  let estadoTramite = 'pausado';
  let citaAgendadaFecha = null;
  let ticketEscalado = false;

  const apiMock = {
    async resolverIdentidad() {
      return { estado: 'requiere_verificacion', pacienteId: 'pac_ana_demo' };
    },
    async solicitarOtp() {
      return { enviado: true };
    },
    async verificarOtp(_pid, _canal, codigo) {
      if (codigo !== '482913') throw new Error('Código inválido');
      return { verificado: true };
    },
    async vincularIdentidad() {
      return { ok: true };
    },
    async obtenerPerfilVerificado() {
      return { nombre: 'Ana', idioma: 'es' };
    },
    async obtenerContexto() {
      return {
        pacienteId: 'pac_ana_demo',
        tramiteId: 'trm_ana_1',
        folio: 'SD-2026-000001',
        estado: estadoTramite,
        contexto: {
          pasoActual: 'seleccion_clinica',
          estudio: { id: 'est_us_abd', nombre: 'Ultrasonido abdominal', precio: 450 },
          clinica: { id: 'cli_09', nombre: 'Salud Digna Puebla Centro', region: 'Puebla' },
          pendientes: ['confirmar_fecha'],
        },
        resumen: 'Ultrasonido abdominal pendiente en Salud Digna Puebla Centro',
      };
    },
    async retomarTramite() {
      estadoTramite = 'seleccion_clinica';
      return { estado: estadoTramite };
    },
    async agendarCita(_id, fechaHora) {
      estadoTramite = 'cita_agendada';
      citaAgendadaFecha = fechaHora;
      return { folio: 'SD-2026-000001', cita: { codigoConfirmacion: 'SD9K2M' } };
    },
    async obtenerClinica() {
      return {
        id: 'cli_09',
        nombre: 'Salud Digna Puebla Centro',
        direccion: 'Av. Reforma Ficticia 412, Puebla',
        lat: 19.043722,
        lng: -98.198148,
        region: 'Puebla',
      };
    },
    async crearTicketEscalamiento() {
      ticketEscalado = true;
      return { folio: 'TK-2026-000001' };
    },
    async registrarInteraccion() {
      return { duplicado: false };
    },
    async actualizarEstadoEntrega() {
      return { actualizado: true };
    },
    async solicitarEnlaceRecuperacion() {
      return { enviado: true };
    },
  };

  const bot = crearServidorBot({ api: apiMock, verifyToken, appSecret });
  await new Promise((resolve) => bot.server.listen(0, resolve));
  const { port } = bot.server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Handshake GET de Meta Cloud API
    const getOk = await fetch(
      `${baseUrl}/webhook?hub.mode=subscribe&hub.verify_token=${verifyToken}&hub.challenge=ch_123`,
    );
    assert.equal(getOk.status, 200);
    assert.equal(await getOk.text(), 'ch_123');

    // 2. Firma inválida es rechazada (401)
    const badSig = await fetch(`${baseUrl}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': 'sha256=0000' },
      body: payloadTexto('wamid.bad', '522221234567', 'Hola'),
    });
    assert.equal(badSig.status, 401);

    // Helper para enviar webhook firmado y esperar la cola
    async function enviarWa(id, texto) {
      const inicio = Date.now();
      const body = payloadTexto(id, '522221234567', texto);
      const res = await fetch(`${baseUrl}/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature-256': firmar(body, appSecret),
        },
        body,
      });
      assert.equal(res.status, 200);
      assert.ok(Date.now() - inicio < 3000);
      await bot.esperarCola();
    }

    // 3. Ana saluda -> pide OTP; mensaje duplicado con mismo message.id se ignora
    await enviarWa('wamid.1', 'Hola');
    const historialTrasSaludo = bot.meta.obtenerHistorial().length;
    assert.equal(historialTrasSaludo, 1);
    await enviarWa('wamid.1', 'Hola'); // duplicado
    assert.equal(bot.meta.obtenerHistorial().length, 1);

    // 4. Ana envía OTP -> bot la reconoce y ofrece retomar su Ultrasonido abdominal
    await enviarWa('wamid.2', '482913');
    const oferta = bot.meta.obtenerHistorial().at(-1);
    assert.equal(oferta.tipo, 'interactive_buttons');
    assert.match(JSON.stringify(oferta.payload), /Ultrasonido abdominal/);
    assert.match(JSON.stringify(oferta.payload), /Salud Digna Puebla Centro/);

    // 5. Interrupción: Ana pide ubicación de la clínica -> bot envía `location` y ofrece volver
    await enviarWa('wamid.3', '¿Dónde está la clínica? ubicación');
    assert.ok(bot.meta.obtenerHistorial().some((m) => m.tipo === 'location'));

    // 6. Ana vuelve, elige continuar y agenda horario Mañana 9:00
    await enviarWa('wamid.4', 'Sí, continuar');
    await enviarWa('wamid.5', 'Mañana 9:00');
    assert.equal(estadoTramite, 'cita_agendada');
    assert.equal(citaAgendadaFecha, '2026-11-26T09:00:00Z');

    // 7. Comando "asesor" escala a humano
    await enviarWa('wamid.6', 'asesor');
    assert.equal(ticketEscalado, true);

    // 8. Estados de entrega de Meta (`delivered` / `read`)
    const statusBody = JSON.stringify({
      entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.out.1', status: 'read' }] } }] }],
    });
    await fetch(`${baseUrl}/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': firmar(statusBody, appSecret),
      },
      body: statusBody,
    });
    await bot.esperarCola();
    assert.equal(bot.sesiones.obtenerEstadoEntrega('wamid.out.1'), 'read');

    // 9. Plantilla de recordatorio cuando pasaron > 24 h
    const sesionAna = bot.sesiones.obtener('522221234567');
    sesionAna.ultimoMensajeEn = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
    bot.sesiones.guardar(sesionAna);
    const enviadoPlantilla = await bot.dialogo.enviarRecordatorioSiExpiroVentana24h(
      '522221234567',
      'SD-2026-000001',
    );
    assert.equal(enviadoPlantilla, true);
    assert.equal(bot.meta.obtenerHistorial().at(-1).tipo, 'template');
  } finally {
    bot.server.close();
  }
});

test('Issue #20: en producción el bot exige credenciales reales de Meta', async () => {
  const { validarConfiguracionProduccion } = require('../dist/main.js');
  assert.deepEqual(validarConfiguracionProduccion({ NODE_ENV: 'development' }), []);
  const faltantes = validarConfiguracionProduccion({
    NODE_ENV: 'production',
    WA_VERIFY_TOKEN: 'token-real',
    WA_APP_SECRET: 'REEMPLAZAR_CON_APP_SECRET',
  });
  assert.ok(faltantes.includes('WA_APP_SECRET'));
  assert.ok(faltantes.includes('WA_ACCESS_TOKEN'));
  assert.ok(!faltantes.includes('WA_VERIFY_TOKEN'));
});
