'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { CanalAtencion } from '@salud-digna/shared';
import { BannerServicioClinica } from '../../../components/BannerServicioClinica';
import { TimelinePanel } from '../../../components/TimelinePanel';
import { apiWeb } from '../../../lib/api';
import { useAppWeb } from '../../../lib/providers';

const ETAPAS_STEPPER = [
  { clave: 'cotizacion', etiqueta: '1 · Cotización' },
  { clave: 'seleccion_clinica', etiqueta: '2 · Clínica' },
  { clave: 'cita_agendada', etiqueta: '3 · Cita agendada' },
  { clave: 'cita_confirmada', etiqueta: '4 · Confirmada' },
  { clave: 'en_proceso', etiqueta: '5 · En proceso' },
  { clave: 'resultados_liberados', etiqueta: '6 · Resultados' },
] as const;

const NODOS_CANAL: ReadonlyArray<{ canal: CanalAtencion; etiqueta: string; icono: string }> = [
  { canal: 'web', etiqueta: 'Portal Web', icono: '🌐' },
  { canal: 'whatsapp', etiqueta: 'WhatsApp', icono: '💬' },
  { canal: 'call_center', etiqueta: 'Call Center', icono: '📞' },
  { canal: 'app', etiqueta: 'App Móvil', icono: '📱' },
];

export default function JourneyPacientePage() {
  const params = useParams<{ pacienteId: string }>();
  const pacienteId = params.pacienteId;
  const { token, usuario, ultimoEventoRt, suscribirPacienteRt } = useAppWeb();
  const [modoPresentacion, setModoPresentacion] = useState(false);

  const autorizado =
    usuario &&
    (usuario.rol === 'admin' || usuario.rol === 'asesor' || usuario.rol === 'asesor_pro');

  useEffect(() => {
    if (token && autorizado && pacienteId) {
      suscribirPacienteRt(pacienteId);
    }
  }, [token, autorizado, pacienteId, suscribirPacienteRt]);

  const { data, isLoading } = useQuery({
    queryKey: ['journey', pacienteId],
    queryFn: () => apiWeb.obtenerJourneyPaciente(token!, pacienteId),
    enabled: Boolean(token && autorizado && pacienteId),
    refetchInterval: 4000,
  });

  const alternarPresentacion = () => {
    setModoPresentacion((prev) => {
      const siguiente = !prev;
      try {
        if (siguiente && document.documentElement.requestFullscreen) {
          void document.documentElement.requestFullscreen().catch(() => undefined);
        } else if (!siguiente && document.fullscreenElement) {
          void document.exitFullscreen().catch(() => undefined);
        }
      } catch {
        // Fallback CSS fullscreen
      }
      return siguiente;
    });
  };

  if (!usuario || !autorizado) {
    return (
      <section className="sd-card">
        <h1>Patient Journey</h1>
        <p className="sd-muted">
          Inicia sesión como asesor o administrador para ver este tablero en vivo.
        </p>
        <Link href="/login" className="sd-btn-primary">
          Iniciar sesión
        </Link>
      </section>
    );
  }

  const indiceEtapa = ETAPAS_STEPPER.findIndex((e) => e.clave === data?.estadoActual);

  return (
    <div className={modoPresentacion ? 'sd-presentacion' : ''}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
          marginBottom: '1rem',
        }}
      >
        <div>
          <Link href="/journey" className="sd-muted">
            ← Volver a lista de pacientes
          </Link>
          <h1 style={{ margin: '0.25rem 0' }}>
            Patient Journey en vivo · {data?.nombre ?? pacienteId}
          </h1>
          <span className="sd-badge">
            {data?.folio ? `Folio ${data.folio}` : 'Esperando inicio de trámite'} · Último canal:{' '}
            {data?.ultimoCanal ?? 'web'}
          </span>
        </div>
        <button type="button" className="sd-btn-primary" onClick={alternarPresentacion}>
          {modoPresentacion ? 'Salir de modo presentación' : 'Modo presentación (Demo)'}
        </button>
      </div>

      {data?.procesoDiagnostico?.clinica?.tieneIncidencia && (
        <BannerServicioClinica
          clinicaId={data.procesoDiagnostico.clinica.id}
          region={data.region}
        />
      )}

      {ultimoEventoRt && (
        <div className="sd-banner-pendiente" role="status" aria-live="polite">
          <span>
            <strong>Evento en vivo recibido:</strong>{' '}
            {String(ultimoEventoRt.tipo ?? 'actualización')} en canal{' '}
            <strong>{String(ultimoEventoRt.canal ?? '')}</strong>
          </span>
          <span className="sd-badge">Tiempo real Socket.IO</span>
        </div>
      )}

      {isLoading && <p>Cargando recorrido del paciente...</p>}

      {data && (
        <>
          <section className="sd-card" aria-label="Etapas del trámite">
            <h2 style={{ marginTop: 0 }}>Etapa actual del trámite</h2>
            <div className="sd-stepper">
              {ETAPAS_STEPPER.map((etapa, idx) => {
                const activa = etapa.clave === data.estadoActual;
                const completada = indiceEtapa > idx;
                return (
                  <span
                    key={etapa.clave}
                    className={`sd-step ${activa ? 'sd-step-active' : completada ? 'sd-step-done' : ''}`}
                  >
                    {completada ? '✓ ' : ''}
                    {etapa.etiqueta}
                  </span>
                );
              })}
            </div>
          </section>

          <section className="sd-card" aria-label="Mapa de canales recorridos">
            <h2 style={{ marginTop: 0 }}>
              Recorrido por canales (Web → WhatsApp → Call Center → App)
            </h2>
            <div className="sd-canal-map">
              {NODOS_CANAL.map((nodo, idx) => {
                const visita = [...data.canalesRecorridos]
                  .reverse()
                  .find((c) => c.canal === nodo.canal);
                const esActual = data.ultimoCanal === nodo.canal;
                return (
                  <div key={nodo.canal} className="sd-canal-step">
                    <div
                      className={`sd-canal-node ${esActual ? 'sd-canal-node-active' : visita ? 'sd-canal-node-visited' : ''}`}
                    >
                      <span style={{ fontSize: '1.5rem' }} aria-hidden="true">
                        {nodo.icono}
                      </span>
                      <strong>{nodo.etiqueta}</strong>
                      <span className="sd-muted">
                        {visita
                          ? new Date(visita.hora).toLocaleTimeString('es-MX', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'Sin paso aún'}
                      </span>
                    </div>
                    {idx < NODOS_CANAL.length - 1 && (
                      <span
                        className={`sd-canal-arrow ${visita ? 'sd-canal-arrow-live' : ''}`}
                        aria-hidden="true"
                      >
                        ➔
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <div className="sd-grid">
            <section className="sd-card">
              <h2 style={{ marginTop: 0 }}>Contexto acumulado (sin repetir datos)</h2>
              <p>
                <strong>Estudio:</strong> {data.contexto.estudio ?? 'Por elegir'}
              </p>
              <p>
                <strong>Clínica:</strong> {data.contexto.clinica ?? 'Por elegir'}
              </p>
              <p>
                <strong>Fecha / Cita:</strong>{' '}
                {data.contexto.fechaTentativa
                  ? new Date(data.contexto.fechaTentativa).toLocaleString('es-MX')
                  : 'Pendiente de agendar'}
              </p>
              <p>
                <strong>Datos pendientes:</strong>{' '}
                {data.contexto.pendientes.length > 0
                  ? data.contexto.pendientes.join(', ')
                  : 'Ninguno — trámite completo'}
              </p>
              {data.procesoDiagnostico && (
                <p>
                  <strong>Proceso diagnóstico:</strong> {data.procesoDiagnostico.etiquetaEtapa} (
                  {data.procesoDiagnostico.progresoPct}%)
                </p>
              )}
            </section>

            <section className="sd-card">
              <h2 style={{ marginTop: 0 }}>Línea de tiempo en vivo</h2>
              <TimelinePanel items={data.timeline} />
            </section>
          </div>
        </>
      )}
    </div>
  );
}
