'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiWeb } from '../../../lib/api';
import { useAppWeb } from '../../../lib/providers';

function AgendaCitaContenido() {
  const { t, token } = useAppWeb();
  const params = useSearchParams();
  const tramiteId = params.get('tramiteId');
  const [fechaHora, setFechaHora] = useState('2026-11-26T09:00');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);

  const { data: tramite, refetch } = useQuery({
    queryKey: ['tramites', tramiteId],
    queryFn: () => apiWeb.obtenerTramite(token!, tramiteId!),
    enabled: Boolean(token && tramiteId),
  });

  const agendar = async () => {
    if (!token || !tramiteId) return;
    setError(null);
    setProcesando(true);
    try {
      if (tramite?.estado === 'pausado') {
        await apiWeb.retomarTramite(token, tramiteId, 'web');
      }
      await apiWeb.avanzarTramite(token, tramiteId, {
        estadoDestino: 'cita_agendada',
        canal: 'web',
        fechaHora: new Date(fechaHora).toISOString(),
      });
      await refetch();
      setMensaje('Cita agendada. Ahora puedes confirmarla o hacerlo por Call Center.');
    } catch (err) {
      setError(err instanceof Error ? err.message : t.estados.errorGenerico);
    } finally {
      setProcesando(false);
    }
  };

  const confirmar = async () => {
    if (!token || !tramiteId) return;
    setError(null);
    setProcesando(true);
    try {
      await apiWeb.avanzarTramite(token, tramiteId, {
        estadoDestino: 'cita_confirmada',
        canal: 'web',
      });
      await refetch();
      setMensaje(t.cotizar.citaConfirmadaOk);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.estados.errorGenerico);
    } finally {
      setProcesando(false);
    }
  };

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <div className="sd-stepper" aria-label="Progreso de cotización">
        <span className="sd-step">{t.cotizar.paso1}</span>
        <span className="sd-step">{t.cotizar.paso2}</span>
        <span className="sd-step sd-step-active">{t.cotizar.paso3}</span>
      </div>

      <section className="sd-card">
        <h1 style={{ marginTop: 0 }}>{t.cotizar.tituloCita}</h1>
        <p className="sd-muted">{t.cotizar.subtituloCita}</p>

        {tramite && (
          <div className="sd-card" style={{ background: '#f8fafc' }}>
            <p style={{ margin: '0 0 0.25rem' }}>
              <strong>Folio:</strong> {tramite.folio} ·{' '}
              <span className="sd-badge">{tramite.estado}</span>
            </p>
            <p style={{ margin: '0 0 0.25rem' }}>
              <strong>Estudio:</strong> {tramite.contexto.estudio?.nombre ?? 'Sin elegir'}
            </p>
            <p style={{ margin: 0 }}>
              <strong>Clínica:</strong> {tramite.contexto.clinica?.nombre ?? 'Sin elegir'}
            </p>
          </div>
        )}

        {mensaje && (
          <div className="sd-banner-pendiente" role="status">
            {mensaje}
          </div>
        )}
        {error && (
          <div className="sd-alert-error" role="alert">
            {error}
          </div>
        )}

        <div className="sd-field">
          <label htmlFor="fecha-hora">{t.cotizar.fechaLabel}</label>
          <input
            id="fecha-hora"
            type="datetime-local"
            value={fechaHora}
            onChange={(e) => setFechaHora(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {tramite?.estado !== 'cita_agendada' && tramite?.estado !== 'cita_confirmada' && (
            <button
              type="button"
              className="sd-btn-primary"
              disabled={procesando}
              onClick={() => void agendar()}
            >
              {t.cotizar.agendarBtn}
            </button>
          )}
          {tramite?.estado === 'cita_agendada' && (
            <button
              type="button"
              className="sd-btn-primary"
              disabled={procesando}
              onClick={() => void confirmar()}
            >
              {t.cotizar.confirmarBtn}
            </button>
          )}
          {tramite && (
            <Link href={`/mis-tramites/${tramite.folio}`} className="sd-btn-secondary">
              {t.tramites.verDetalle}
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}

export default function CitaPage() {
  return (
    <Suspense fallback={<p>Cargando agenda...</p>}>
      <AgendaCitaContenido />
    </Suspense>
  );
}
