import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { SesionWaStore } = require('../dist/cloud-api/sesion-store.js');
const { ClienteMetaCloudApi } = require('../dist/cloud-api/cliente-meta.js');
const { MaquinaDialogoWhatsapp } = require('../dist/flujos/maquina-dialogo.js');

function persistenciaEnMemoria() {
  const datos = new Map();
  return {
    datos,
    obtener: async (clave) => (datos.has(clave) ? JSON.parse(datos.get(clave)) : null),
    guardar: async (clave, sesion) => {
      datos.set(clave, JSON.stringify(sesion));
    },
  };
}

test('Issue #39: la conversación de WhatsApp sobrevive a un reinicio del bot', async () => {
  const persistencia = persistenciaEnMemoria();
  let otpVerificado = null;
  const apiMock = {
    resolverIdentidad: async () => ({
      estado: 'requiere_verificacion',
      pacienteId: 'pac_ana_demo',
    }),
    solicitarOtp: async () => ({ enviado: true }),
    verificarOtp: async (_pacienteId, _canal, codigo) => {
      otpVerificado = codigo;
      return { verificado: true };
    },
    vincularIdentidad: async () => ({ ok: true }),
    obtenerPerfilVerificado: async () => ({ nombre: 'Ana', idioma: 'es' }),
    obtenerContexto: async () => null,
    registrarInteraccion: async () => ({ ok: true }),
  };
  const telefono = '5215512345678';

  // Bot "antes del reinicio": Ana escribe y queda esperando el OTP
  const sesionesAntes = new SesionWaStore(persistencia);
  const dialogoAntes = new MaquinaDialogoWhatsapp(
    apiMock,
    new ClienteMetaCloudApi(),
    sesionesAntes,
  );
  await dialogoAntes.procesarMensajeEntrante({ messageId: 'wamid.r1', telefono, texto: 'Hola' });
  await sesionesAntes.esperarEscrituras();

  // La clave en Redis es el hash del teléfono, nunca el número
  const [clave] = [...persistencia.datos.keys()];
  assert.match(clave, /^[a-f0-9]{64}$/);
  assert.ok(!clave.includes(telefono));

  // Bot "después del reinicio": memoria vacía, pero retoma en el paso del OTP
  const sesionesDespues = new SesionWaStore(persistencia);
  const dialogoDespues = new MaquinaDialogoWhatsapp(
    apiMock,
    new ClienteMetaCloudApi(),
    sesionesDespues,
  );
  const sesion = await dialogoDespues.procesarMensajeEntrante({
    messageId: 'wamid.r2',
    telefono,
    texto: '583387',
  });

  assert.equal(otpVerificado, '583387');
  assert.equal(sesion.pacienteId, 'pac_ana_demo');
  assert.notEqual(sesion.paso, 'esperando_otp');
});

test('Issue #39: si el API no responde, el bot sigue atendiendo con memoria local', async () => {
  const sesiones = new SesionWaStore({
    obtener: async () => {
      throw new Error('API caído');
    },
    guardar: async () => {
      throw new Error('API caído');
    },
  });
  await sesiones.hidratar('5215512345678');
  sesiones.guardar({
    telefono: '5215512345678',
    pacienteId: null,
    nombrePaciente: null,
    tramiteId: null,
    clinicaId: null,
    paso: 'menu_principal',
    pasoInterrumpido: null,
    idioma: 'es',
    ultimoMensajeEn: new Date().toISOString(),
  });
  await sesiones.esperarEscrituras();
  assert.equal(sesiones.obtener('5215512345678').paso, 'menu_principal');
});
