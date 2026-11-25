import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

process.env.NODE_ENV = 'test';

const require = createRequire(import.meta.url);
const { crearAppNest } = require('../dist/main.js');
const { USUARIOS_DEMO_SEMILLA } = require('../dist/auth/usuarios-demo.js');

async function loginRol(url, rol) {
  const usr = USUARIOS_DEMO_SEMILLA.find((u) => u.rol === rol);
  const res = await fetch(`${url}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: usr.email, contrasena: usr.contrasenaDemo }),
  });
  return (await res.json()).accessToken;
}

test('Issues #27, #28, #29, #30 y #31: Patient Journey, KPIs reales, estadísticas por rol, jerarquía de resultados y estatus diagnóstico', async () => {
  const app = await crearAppNest({ silencioso: true });
  await app.listen(0);
  const url = await app.getUrl();

  try {
    const tokenAna = await loginRol(url, 'paciente');
    const tokenAsesor = await loginRol(url, 'asesor');
    const tokenRevisor = await loginRol(url, 'revisor_tecnico');
    const tokenMedico = await loginRol(url, 'medico');
    const tokenAdmin = await loginRol(url, 'admin');

    // 1. Flujo real Web -> WhatsApp -> Call Center para alimentar KPIs y Patient Journey (#27, #28)
    const trm = await (
      await fetch(`${url}/tramites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenAna}` },
        body: JSON.stringify({
          pacienteId: 'pac_ana_demo',
          canal: 'web',
          estudioId: 'est_us_abd',
          clinicaId: 'cli_10', // Angelópolis tiene estatus 'retraso' (#31)
        }),
      })
    ).json();

    await fetch(`${url}/tramites/${trm.id}/avanzar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenAna}` },
      body: JSON.stringify({
        estadoDestino: 'seleccion_clinica',
        canal: 'web',
        clinicaId: 'cli_10',
      }),
    });
    await fetch(`${url}/tramites/${trm.id}/avanzar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenAna}` },
      body: JSON.stringify({
        estadoDestino: 'cita_agendada',
        canal: 'whatsapp',
        fechaHora: '2026-11-27T10:00:00Z',
      }),
    });

    // 2. Estatus del servicio por clínica y proceso diagnóstico (#31)
    const estatusSvc = await (await fetch(`${url}/servicio/estatus?region=Puebla`)).json();
    assert.equal(estatusSvc.region, 'Puebla');
    assert.ok(estatusSvc.incidencias.some((i) => i.clinicaId === 'cli_10'));

    const proceso = await (
      await fetch(`${url}/tramites/${trm.folio}/proceso`, {
        headers: { Authorization: `Bearer ${tokenAna}` },
      })
    ).json();
    assert.equal(proceso.folio, trm.folio);
    assert.equal(proceso.clinica.tieneIncidencia, true);
    assert.ok(proceso.etiquetaEtapa.length > 0);

    // El asistente IA responde "¿Cómo va mi estudio?" con la etapa diagnóstica real (#31)
    const iaEst = await (
      await fetch(`${url}/ia/mensaje`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenAna}` },
        body: JSON.stringify({
          mensaje: '¿Cómo va mi estudio?',
          canal: 'web',
          pacienteId: 'pac_ana_demo',
        }),
      })
    ).json();
    assert.match(iaEst.respuesta, /Etapa diagnóstica/i);

    // 3. Jerarquía de liberación de resultados (#30):
    //    Paciente NO ve resultados antes de ser liberados
    const antesAna = await (
      await fetch(`${url}/resultados`, { headers: { Authorization: `Bearer ${tokenAna}` } })
    ).json();
    assert.equal(antesAna.total, 0);

    const intentoNoLiberado = await fetch(`${url}/resultados/res_demo_captura_01`, {
      headers: { Authorization: `Bearer ${tokenAna}` },
    });
    assert.equal(intentoNoLiberado.status, 403);

    // Revisor aprueba captura -> revision_tecnica
    const revRes = await fetch(`${url}/resultados/res_demo_captura_01/revisar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenRevisor}` },
      body: JSON.stringify({ aprobado: true }),
    });
    assert.equal(revRes.status, 201);
    assert.equal((await revRes.json()).estado, 'revision_tecnica');

    // Médico valida revision_tecnica -> validacion_medica
    const valRes = await fetch(`${url}/resultados/res_demo_captura_01/validar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenMedico}` },
      body: JSON.stringify({ aprobado: true }),
    });
    assert.equal(valRes.status, 201);
    assert.equal((await valRes.json()).estado, 'validacion_medica');

    // Médico libera validacion_medica -> liberado (genera PDF + evento resultado.liberado)
    const libRes = await fetch(`${url}/resultados/res_demo_captura_01/liberar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenMedico}` },
    });
    assert.equal(libRes.status, 201);
    const libData = await libRes.json();
    assert.equal(libData.resultado.estado, 'liberado');
    assert.equal(libData.resultado.pdfGenerado, true);

    // Ahora Ana SÍ ve el resultado, descarga el PDF y envía mensaje rápido al médico
    const despuesAna = await (
      await fetch(`${url}/resultados`, { headers: { Authorization: `Bearer ${tokenAna}` } })
    ).json();
    assert.equal(despuesAna.total, 1);

    const pdfRes = await fetch(`${url}/resultados/res_demo_captura_01/pdf`, {
      headers: { Authorization: `Bearer ${tokenAna}` },
    });
    assert.equal(pdfRes.status, 200);
    const pdfText = await pdfRes.text();
    assert.ok(pdfText.startsWith('%PDF-1.4'));

    const msgRes = await fetch(`${url}/resultados/res_demo_captura_01/mensajes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenAna}` },
      body: JSON.stringify({
        contenido: 'Doctor, ¿debo llevar este resultado impreso a consulta?',
      }),
    });
    assert.equal(msgRes.status, 201);
    const msgData = await msgRes.json();
    assert.equal(msgData.tiempoEsperadoRespuestaMinutos, 30);

    // 4. Tablero Patient Journey en tiempo real (#27)
    const journeyLista = await (
      await fetch(`${url}/journey/pacientes?region=Puebla`, {
        headers: { Authorization: `Bearer ${tokenAsesor}` },
      })
    ).json();
    assert.ok(journeyLista.total >= 1);

    const journeyAna = await (
      await fetch(`${url}/journey/pacientes/pac_ana_demo`, {
        headers: { Authorization: `Bearer ${tokenAdmin}` },
      })
    ).json();
    assert.equal(journeyAna.pacienteId, 'pac_ana_demo');
    assert.ok(journeyAna.canalesRecorridos.length >= 2);
    assert.ok(journeyAna.timeline.length >= 2);

    // 5. Dashboard KPIs reales + CSV (#28)
    const metricas = await (
      await fetch(`${url}/admin/metricas?region=Puebla`, {
        headers: { Authorization: `Bearer ${tokenAdmin}` },
      })
    ).json();
    assert.ok(metricas.kpis.tramitesRetomadosOtroCanalPct > 0);
    assert.ok(metricas.kpis.cambiosDeCanalTotal >= 1);
    assert.ok(metricas.kpis.eventosRegistrados > 0);
    assert.ok(Array.isArray(metricas.ticketsPorRegion));

    const csvRes = await fetch(`${url}/admin/metricas/export.csv`, {
      headers: { Authorization: `Bearer ${tokenAdmin}` },
    });
    assert.equal(csvRes.status, 200);
    const csv = await csvRes.text();
    assert.match(csv, /tramites_retomados_otro_canal_pct/);

    // 6. Estadísticas diferenciadas por rol (#29)
    for (const [token, rolEsperado] of [
      [tokenAna, 'paciente'],
      [tokenAsesor, 'asesor'],
      [tokenMedico, 'medico'],
      [tokenRevisor, 'revisor_tecnico'],
      [tokenAdmin, 'admin'],
    ]) {
      const est = await (
        await fetch(`${url}/estadisticas/mi-rol`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      ).json();
      assert.equal(est.rol, rolEsperado);
      assert.ok(est.tarjetas.length >= 3);
    }
  } finally {
    await app.close();
  }
});
