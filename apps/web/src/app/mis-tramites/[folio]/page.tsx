'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { TimelinePanel } from '../../../components/TimelinePanel';
import { apiWeb } from '../../../lib/api';
import { useAppWeb } from '../../../lib/providers';

export default function DetalleTramitePage() {
  const { folio } = useParams<{ folio: string }>();
  const { t, token } = useAppWeb();

  const { data: tramite, isLoading } = useQuery({
    queryKey: ['tramites', folio],
    queryFn: () => apiWeb.obtenerTramite(token!, folio),
    enabled: Boolean(token && folio),
  });

  const { data: timeline } = useQuery({
    queryKey: ['timeline', tramite?.pacienteId, tramite?.id],
    queryFn: () => apiWeb.obtenerTimeline(token!, tramite!.pacienteId, tramite!.id),
    enabled: Boolean(token && tramite?.pacienteId),
  });

  if (isLoading) return <p>{t.estados.cargando}</p>;
  if (!tramite) return <p className="sd-muted">Trámite no encontrado o requiere iniciar sesión.</p>;

  return (
    <div>
      <section className="sd-card">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <h1 style={{ margin: 0 }}>Trámite {tramite.folio}</h1>
          <span className="sd-badge">{tramite.estado}</span>
        </div>
        <p className="sd-muted">
          Estudio: <strong>{tramite.contexto.estudio?.nombre ?? 'Por definir'}</strong> · Clínica:{' '}
          <strong>{tramite.contexto.clinica?.nombre ?? 'Por definir'}</strong> · Canal actual:{' '}
          <strong>{tramite.ultimoCanal}</strong>
        </p>
        {tramite.cita && (
          <div className="sd-banner-pendiente">
            <div>
              <strong>Cita {tramite.cita.estatus}</strong> —{' '}
              {new Date(tramite.cita.fechaHora).toLocaleString('es-MX')}
              <div className="sd-muted">
                Código de confirmación: {tramite.cita.codigoConfirmacion}
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="sd-card">
        <h2 style={{ marginTop: 0 }}>{t.tramites.timelineTitulo}</h2>
        <TimelinePanel items={timeline?.items ?? []} />
      </section>
    </div>
  );
}
