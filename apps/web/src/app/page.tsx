'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiWeb } from '../lib/api';
import { useAppWeb } from '../lib/providers';

export default function InicioPage() {
  const { t, token, usuario } = useAppWeb();

  const { data: contextoActivo } = useQuery({
    queryKey: ['contexto', usuario?.pacienteId],
    queryFn: () => apiWeb.obtenerContextoPaciente(token!, usuario!.pacienteId!),
    enabled: Boolean(token && usuario?.pacienteId),
    retry: false,
  });

  return (
    <div>
      {contextoActivo && (
        <section className="sd-banner-pendiente" role="status" aria-live="polite">
          <div>
            <strong>{t.inicio.bannerPendienteTitulo}</strong>
            <p className="sd-muted" style={{ margin: '0.25rem 0 0' }}>
              {contextoActivo.resumen}
            </p>
          </div>
          <Link
            href={
              contextoActivo.contexto.clinica
                ? `/cotizar/cita?tramiteId=${contextoActivo.tramiteId}`
                : `/cotizar/clinica?tramiteId=${contextoActivo.tramiteId}`
            }
            className="sd-btn-primary"
          >
            {t.inicio.bannerPendienteBtn}
          </Link>
        </section>
      )}

      <section className="sd-card">
        <h1 style={{ marginTop: 0 }}>{t.inicio.titulo}</h1>
        <p className="sd-muted">{t.inicio.subtitulo}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '1rem' }}>
          <Link href="/cotizar" className="sd-btn-primary">
            {t.inicio.ctaCotizar}
          </Link>
          <Link href="/mis-tramites" className="sd-btn-secondary">
            {t.inicio.ctaTramites}
          </Link>
          {usuario &&
            (usuario.rol === 'asesor' ||
              usuario.rol === 'asesor_pro' ||
              usuario.rol === 'admin') && (
              <Link href="/consola" className="sd-btn-secondary">
                {t.inicio.ctaConsola}
              </Link>
            )}
        </div>
      </section>

      <section className="sd-grid" aria-label="Pilares de la plataforma">
        {t.inicio.pilares.map((pilar, idx) => (
          <article key={pilar} className="sd-card">
            <span className="sd-badge">Pilar {idx + 1}</span>
            <h2 style={{ fontSize: '1.05rem', marginBottom: 0 }}>{pilar}</h2>
          </article>
        ))}
      </section>
    </div>
  );
}
