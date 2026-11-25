import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

process.env.NODE_ENV = 'test';
process.env.PLAZOS_PERFIL = 'exposicion';

const require = createRequire(import.meta.url);
const { crearAppNest } = require('../dist/main.js');
const { USUARIOS_DEMO_SEMILLA } = require('../dist/auth/usuarios-demo.js');
const { EventPublisherService } = require('../dist/common/eventos/event-publisher.service.js');
const { TemporizadoresService } = require('../dist/temporizadores/temporizadores.service.js');
const { OtpService } = require('../dist/otp/otp.service.js');
const { obtenerTokenServicioBot } = require('../dist/auth/guards.js');

async function login(url, rol) {
  const u = USUARIOS_DEMO_SEMILLA.find((x) => x.rol === rol);
  const res = await fetch(`${url}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: u.email, contrasena: u.contrasenaDemo }),
  });
  const { accessToken } = await res.json();
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` };
}

test('Traspaso v2: canal propietario con versión, transferencia a la llamada, 409 y caducidad', async () => {
  const app = await crearAppNest({ silencioso: true });
  await app.listen(0);
  const url = await app.getUrl();
  const eventos = app.get(EventPublisherService);
  const tipos = () => eventos.obtenerEventosEmitidos().map((e) => e.tipo);

  try {
    const hAna = await login(url, 'paciente');
    const hAsesor = await login(url, 'asesor');

    // Ana cotiza en la web: el trámite nace en versión 1 y cada escritura la incrementa
    const tramite = await (
      await fetch(`${url}/tramites`, {
        method: 'POST',
        headers: hAna,
        body: JSON.stringify({ pacienteId: 'pac_ana_demo', canal: 'web', estudioId: 'est_us_abd' }),
      })
    ).json();
    const patch = await (
      await fetch(`${url}/tramites/${tramite.id}/contexto`, {
        method: 'PATCH',
        headers: hAna,
        body: JSON.stringify({ canal: 'web', clinicaId: 'cli_09' }),
      })
    ).json();
    const version = patch.tramite.contexto.versionTramite;
    assert.ok(version >= 2);

    // El asesor atiende la llamada: toma el trámite en exclusiva
    const tomar = await fetch(`${url}/tramites/${tramite.id}/propietario`, {
      method: 'POST',
      headers: hAsesor,
      body: JSON.stringify({ versionEsperada: version }),
    });
    assert.equal(tomar.status, 201);
    const tomado = await tomar.json();
    assert.equal(tomado.contexto.propietario.canal, 'call_center');
    assert.equal(tomado.contexto.propietario.exclusivo, true);
    assert.ok(tipos().includes('contexto.transferido'));

    // Mientras dura la llamada, la web no escribe (409) …
    const web = await fetch(`${url}/tramites/${tramite.id}/contexto`, {
      method: 'PATCH',
      headers: hAna,
      body: JSON.stringify({ canal: 'web', pendientes: ['confirmar_fecha'] }),
    });
    assert.equal(web.status, 409);
    assert.equal((await web.json()).codigo, 'CANAL_NO_PROPIETARIO');

    // … y una escritura con versión vieja también se rechaza
    const vieja = await fetch(`${url}/tramites/${tramite.id}/contexto`, {
      method: 'PATCH',
      headers: { ...hAsesor, 'x-canal': 'call_center' },
      body: JSON.stringify({ canal: 'call_center', pendientes: [], versionEsperada: version }),
    });
    assert.equal(vieja.status, 409);
    assert.equal((await vieja.json()).codigo, 'VERSION_OBSOLETA');

    // Si la llamada se corta y nadie renueva, el permiso caduca solo con la hora del umbral
    const temporizadores = app.get(TemporizadoresService);
    const hasta = Date.parse(tomado.contexto.propietario.hasta);
    await temporizadores.revisar(hasta + 1000);
    const liberado = eventos
      .obtenerEventosEmitidos()
      .find((e) => e.tipo === 'canal.propietario_liberado');
    assert.ok(liberado);
    assert.equal(liberado.datos.motivo, 'caducado');
    assert.equal(liberado.ocurridoEn, tomado.contexto.propietario.hasta);

    // Revisar otra vez no duplica el vencimiento
    const antes = eventos.obtenerEventosEmitidos().length;
    await temporizadores.revisar(hasta + 5000);
    assert.equal(eventos.obtenerEventosEmitidos().length, antes);

    // Ya liberado, la web vuelve a escribir
    const webDespues = await fetch(`${url}/tramites/${tramite.id}/contexto`, {
      method: 'PATCH',
      headers: hAna,
      body: JSON.stringify({ canal: 'web', pendientes: ['confirmar_fecha'] }),
    });
    assert.equal(webDespues.status, 200);
  } finally {
    await app.close();
  }
});

test('Traspaso v2: horario apartado que se libera y código de un solo uso de 15 min que vence', async () => {
  const app = await crearAppNest({ silencioso: true });
  await app.listen(0);
  const url = await app.getUrl();
  const eventos = app.get(EventPublisherService);
  const temporizadores = app.get(TemporizadoresService);

  try {
    const hAna = await login(url, 'paciente');
    const tramite = await (
      await fetch(`${url}/tramites`, {
        method: 'POST',
        headers: hAna,
        body: JSON.stringify({ pacienteId: 'pac_ana_demo', canal: 'web', estudioId: 'est_us_abd' }),
      })
    ).json();
    await fetch(`${url}/tramites/${tramite.id}/avanzar`, {
      method: 'POST',
      headers: hAna,
      body: JSON.stringify({
        estadoDestino: 'seleccion_clinica',
        canal: 'web',
        clinicaId: 'cli_09',
      }),
    });
    const agendado = await (
      await fetch(`${url}/tramites/${tramite.id}/avanzar`, {
        method: 'POST',
        headers: hAna,
        body: JSON.stringify({
          estadoDestino: 'cita_agendada',
          canal: 'web',
          fechaHora: '2026-11-30T15:00:00Z',
        }),
      })
    ).json();
    const apartadoHasta = agendado.contexto.cupo.apartadoHasta;
    assert.ok(eventos.obtenerEventosEmitidos().some((e) => e.tipo === 'cita.apartada'));

    await temporizadores.revisar(Date.parse(apartadoHasta) + 1000);
    const cupo = eventos.obtenerEventosEmitidos().find((e) => e.tipo === 'cupo.liberado');
    assert.ok(cupo);
    assert.equal(cupo.ocurridoEn, apartadoHasta);

    // Confirmar después: se vuelve a apartar sin pedir datos y se confirma
    const confirmada = await fetch(`${url}/tramites/${tramite.id}/avanzar`, {
      method: 'POST',
      headers: hAna,
      body: JSON.stringify({ estadoDestino: 'cita_confirmada', canal: 'web' }),
    });
    assert.equal(confirmada.status, 201);
    const apartadas = eventos.obtenerEventosEmitidos().filter((e) => e.tipo === 'cita.apartada');
    assert.equal(apartadas.length, 2);

    // OTP: dura 15 min; al vencer sin usarse queda el evento con la hora del umbral
    const headersBot = {
      'Content-Type': 'application/json',
      'x-service-token': obtenerTokenServicioBot(),
      'x-canal': 'whatsapp',
    };
    const sol = await (
      await fetch(`${url}/otp/solicitar`, {
        method: 'POST',
        headers: headersBot,
        body: JSON.stringify({ pacienteId: 'pac_ana_demo', canal: 'whatsapp' }),
      })
    ).json();
    assert.equal(sol.expiraEnSegundos, 900);
    const enviado = eventos
      .obtenerEventosEmitidos()
      .find((e) => e.tipo === 'identidad.codigo_enviado');
    assert.ok(enviado);
    assert.ok(
      !JSON.stringify(enviado).includes(
        app.get(OtpService).obtenerUltimoOtpSimulado('pac_ana_demo').codigo,
      ),
    );

    await temporizadores.revisar(Date.parse(enviado.datos.venceEn) + 1000);
    const vencido = eventos
      .obtenerEventosEmitidos()
      .find((e) => e.tipo === 'identidad.codigo_vencido');
    assert.ok(vencido);
    assert.equal(vencido.ocurridoEn, enviado.datos.venceEn);
  } finally {
    await app.close();
  }
});
