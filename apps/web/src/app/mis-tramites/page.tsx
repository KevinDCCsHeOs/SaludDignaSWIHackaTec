'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiWeb } from '../../lib/api';
import { useAppWeb } from '../../lib/providers';

export default function MisTramitesPage() {
  const { t, token, usuario } = useAppWeb();

  const { data, isLoading } = useQuery({
    queryKey: ['tramites', usuario?.pacienteId],
    queryFn: () => apiWeb.listarTramitesPaciente(token!, usuario!.pacienteId!),
    enabled: Boolean(token && usuario?.pacienteId),
  });

  if (!usuario) {
    return (
      <section className="sd-card">
        <h1>{t.tramites.titulo}</h1>
        <p className="sd-muted">Inicia sesión para consultar tus trámites y citas.</p>
        <Link href="/login" className="sd-btn-primary">
          {t.app.nav.iniciarSesion}
        </Link>
      </section>
    );
  }

  return (
    <div>
      <h1>{t.tramites.titulo}</h1>
      {isLoading && <p>{t.estados.cargando}</p>}
      {!isLoading && (data?.tramites.length ?? 0) === 0 && (
        <div className="sd-card">
          <p>{t.tramites.vacio}</p>
          <Link href="/cotizar" className="sd-btn-primary">
            {t.inicio.ctaCotizar}
          </Link>
        </div>
      )}

      <div className="sd-grid">
        {(data?.tramites ?? []).map((trm) => (
          <article key={trm.id} className="sd-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>{trm.folio}</strong>
              <span className="sd-badge">{trm.estado}</span>
            </div>
            <p style={{ margin: '0.5rem 0 0.2rem', fontWeight: 600 }}>
              {trm.contexto.estudio?.nombre ?? 'Cotización en curso'}
            </p>
            <p className="sd-muted" style={{ margin: '0 0 0.75rem' }}>
              {trm.contexto.clinica?.nombre ?? 'Clínica pendiente'} · Último canal:{' '}
              {trm.ultimoCanal}
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <Link href={`/mis-tramites/${trm.folio}`} className="sd-btn-secondary">
                {t.tramites.verDetalle}
              </Link>
              {trm.estado !== 'cita_confirmada' && trm.estado !== 'cerrado' && (
                <Link href={`/cotizar/cita?tramiteId=${trm.id}`} className="sd-btn-primary">
                  {t.tramites.retomar}
                </Link>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
