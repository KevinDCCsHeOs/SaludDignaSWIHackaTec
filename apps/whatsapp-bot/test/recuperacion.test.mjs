import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  esIntencionRecuperacionAcceso,
  manejarRecuperacionAccesoWhatsapp,
} = require('../dist/main.js');

test('Issue #9 (bot WhatsApp): detecta "No puedo entrar a mi cuenta" y exige OTP antes de enviar enlace', async () => {
  assert.equal(esIntencionRecuperacionAcceso('No puedo entrar a mi cuenta'), true);
  assert.equal(esIntencionRecuperacionAcceso('Olvidé mi contraseña'), true);
  assert.equal(esIntencionRecuperacionAcceso('Quiero cotizar un ultrasonido'), false);

  let enlaceSolicitado = false;
  const apiMock = {
    async resolverIdentidad() {
      return { estado: 'requiere_verificacion', pacienteId: 'pac_ana_demo' };
    },
    async solicitarOtp() {
      return { enviado: true };
    },
    async verificarOtp(_pid, _canal, codigo) {
      return { verificado: codigo === '482913' };
    },
    async solicitarEnlaceRecuperacion() {
      enlaceSolicitado = true;
      return { enviado: true };
    },
  };

  // Paso 1: pide OTP, todavía NO dispara enlace
  const paso1 = await manejarRecuperacionAccesoWhatsapp(
    { telefono: '+522221234567', mensaje: 'No puedo entrar a mi cuenta' },
    apiMock,
  );
  assert.equal(paso1.paso, 'esperando_otp');
  assert.equal(paso1.pacienteId, 'pac_ana_demo');
  assert.equal(enlaceSolicitado, false);

  // Paso 2: tras verificar OTP válido, sí dispara el enlace de recuperación
  const paso2 = await manejarRecuperacionAccesoWhatsapp(
    {
      telefono: '+522221234567',
      mensaje: '482913',
      codigoOtp: '482913',
      pacienteId: 'pac_ana_demo',
    },
    apiMock,
  );
  assert.equal(paso2.paso, 'enlace_enviado');
  assert.equal(enlaceSolicitado, true);
});
