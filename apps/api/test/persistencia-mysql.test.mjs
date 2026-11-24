import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// Prueba de integración contra MySQL real: solo corre si hay DATABASE_URL (CI la provee con la
// BD migrada y sembrada). Habilita Prisma en modo test solo para este archivo.
process.env.NODE_ENV = 'test';
process.env.PRISMA_EN_PRUEBAS = '1';
delete process.env.TRAMITES_SNAPSHOT_PATH;

const require = createRequire(import.meta.url);
const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);

test(
  'Issues #13, #15 y #16: trámite, ticket y timeline sobreviven un reinicio leyendo de MySQL',
  { skip: hayBaseDeDatos ? false : 'Sin DATABASE_URL: prueba de integración omitida' },
  async () => {
    const { crearAppNest } = require('../dist/main.js');
    const { USUARIOS_DEMO_SEMILLA } = require('../dist/auth/usuarios-demo.js');
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    const asesor = USUARIOS_DEMO_SEMILLA.find((u) => u.rol === 'asesor');

    const login = async (url) => {
      const res = await fetch(`${url}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: asesor.email, contrasena: asesor.contrasenaDemo }),
      });
      const { accessToken } = await res.json();
      return { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` };
    };

    let tramiteId;
    let ticketId;
    let folio;

    // --- Instancia 1: el asesor crea trámite y ticket para Ana (paciente sembrada) ---
    const app1 = await crearAppNest({ silencioso: true });
    await app1.listen(0);
    try {
      const url1 = await app1.getUrl();
      const headers = await login(url1);

      const tramite = await (
        await fetch(`${url1}/tramites`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            pacienteId: 'pac_ana_demo',
            canal: 'call_center',
            estudioId: 'est_us_abd',
          }),
        })
      ).json();
      tramiteId = tramite.id;
      folio = tramite.folio;

      const patch = await fetch(`${url1}/tramites/${tramiteId}/contexto`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ canal: 'call_center', clinicaId: 'cli_09' }),
      });
      assert.equal(patch.status, 200);

      const agendar = await fetch(`${url1}/tramites/${tramiteId}/avanzar`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          estadoDestino: 'cita_agendada',
          canal: 'call_center',
          fechaHora: '2026-12-02T09:00:00Z',
        }),
      });
      assert.equal(agendar.status, 201);

      const ticket = await (
        await fetch(`${url1}/tickets`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            pacienteId: 'pac_ana_demo',
            tramiteId,
            canalOrigen: 'call_center',
            tipo: 'duda',
            region: 'Puebla',
          }),
        })
      ).json();
      ticketId = ticket.id;

      // Llamada de Call Center (#19, #23): debe quedar en `interacciones`
      const llamada = await fetch(`${url1}/canales/llamadas`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          pacienteId: 'pac_ana_demo',
          tramiteId,
          motivo: 'Duda de preparación',
          notas: 'Se explicó el ayuno de 8 horas',
          resultado: 'Duda resuelta',
        }),
      });
      assert.equal(llamada.status, 201);
      assert.equal(await prisma.interaccion.count({ where: { tramiteId } }), 1);

      // Lo escrito quedó en MySQL (fuente de verdad) y el evento en el outbox
      const fila = await prisma.tramite.findUnique({
        where: { id: tramiteId },
        include: { pasos: true, citas: true },
      });
      assert.equal(fila.estado, 'cita_agendada');
      assert.equal(fila.citas.length, 1);
      assert.ok(fila.pasos.length >= 3);
      const eventosBd = await prisma.evento.count({ where: { tramiteId } });
      assert.ok(eventosBd >= 3, `Se esperaban eventos en el outbox, hay ${eventosBd}`);
    } finally {
      await app1.close();
    }

    // --- Instancia 2: reinicio sin snapshot JSON; todo debe venir de MySQL ---
    const app2 = await crearAppNest({ silencioso: true });
    await app2.listen(0);
    try {
      const url2 = await app2.getUrl();
      const headers = await login(url2);

      const recargado = await (await fetch(`${url2}/tramites/${tramiteId}`, { headers })).json();
      assert.equal(recargado.folio, folio);
      assert.equal(recargado.estado, 'cita_agendada');
      assert.equal(recargado.contexto.clinica.id, 'cli_09');
      assert.equal(recargado.cita.estatus, 'agendada');

      const ticket = await fetch(`${url2}/tickets/${ticketId}`, { headers });
      assert.equal(ticket.status, 200);

      const interacciones = await (
        await fetch(`${url2}/canales/interacciones/pac_ana_demo`, { headers })
      ).json();
      const lista = Array.isArray(interacciones) ? interacciones : interacciones.interacciones;
      assert.ok(
        lista.some((i) => i.canal === 'call_center' && i.tramiteId === tramiteId),
        'La llamada no sobrevivió el reinicio',
      );

      const timeline = await (
        await fetch(`${url2}/pacientes/pac_ana_demo/timeline?tramiteId=${tramiteId}`, { headers })
      ).json();
      const tipos = timeline.items.map((i) => i.tipoEvento);
      assert.ok(tipos.includes('cotizacion.iniciada'), 'El timeline no se reconstruyó');
      assert.ok(tipos.includes('cita.agendada'));
      assert.ok(
        timeline.items.some((i) => i.tipoEvento === 'interaccion.registrada'),
        'La llamada no volvió a la línea de tiempo',
      );

      // El folio siguiente continúa la secuencia (no reinicia en 000001)
      const otro = await (
        await fetch(`${url2}/tramites`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ pacienteId: 'pac_ana_demo', canal: 'call_center' }),
        })
      ).json();
      assert.notEqual(otro.folio, folio);
      await fetch(`${url2}/tramites/${otro.id}/cancelar`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ canal: 'call_center' }),
      });
    } finally {
      await app2.close();
      // Limpiar lo creado por la prueba (las tablas hijas caen en cascada)
      await prisma.evento.deleteMany({ where: { paciente: { id: 'pac_ana_demo' } } });
      await prisma.interaccion.deleteMany({ where: { pacienteId: 'pac_ana_demo' } });
      await prisma.ticket.deleteMany({ where: { pacienteId: 'pac_ana_demo' } });
      await prisma.tramite.deleteMany({ where: { pacienteId: 'pac_ana_demo' } });
      await prisma.$disconnect();
    }
  },
);
