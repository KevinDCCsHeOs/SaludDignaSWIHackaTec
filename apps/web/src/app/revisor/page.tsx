'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EstadisticasRolWidget } from '../../components/EstadisticasRolWidget';
import { apiWeb } from '../../lib/api';
import { useAppWeb } from '../../lib/providers';

export default function VistaRevisorPage() {
  const { token, usuario } = useAppWeb();
  const queryClient = useQueryClient();
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);

  const autorizado = usuario && (usuario.rol === 'revisor_tecnico' || usuario.rol === 'admin');

  const { data } = useQuery({
    queryKey: ['resultados', 'revisor'],
    queryFn: () => apiWeb.listarResultados(token!),
    enabled: Boolean(token && autorizado),
  });

  const aprobar = async (id: string) => {
    if (!token) return;
    await apiWeb.revisarResultado(token, id, { aprobado: true });
    setAviso(`Estudio ${id} aprobado técnicamente y turnado a validación médica.`);
    await queryClient.invalidateQueries({ queryKey: ['resultados'] });
    await queryClient.invalidateQueries({ queryKey: ['estadisticas'] });
  };

  const rechazar = async (id: string) => {
    if (!token) return;
    const motivo =
      motivoRechazo.trim() || 'Muestra con calidad insuficiente; repetir captura técnica.';
    await apiWeb.revisarResultado(token, id, { aprobado: false, motivoRechazo: motivo });
    setMotivoRechazo('');
    setAviso(`Estudio ${id} rechazado técnicamente con motivo registrado en auditoría.`);
    await queryClient.invalidateQueries({ queryKey: ['resultados'] });
    await queryClient.invalidateQueries({ queryKey: ['estadisticas'] });
  };

  if (!usuario || !autorizado) {
    return (
      <section className="sd-card">
        <h1>Revisión técnica de estudios</h1>
        <p className="sd-muted">
          Inicia sesión como revisor técnico para evaluar estudios en captura.
        </p>
        <Link href="/login" className="sd-btn-primary">
          Iniciar sesión
        </Link>
      </section>
    );
  }

  return (
    <div>
      <h1>Revisión técnica de estudios</h1>
      <p className="sd-muted">
        Verifica calidad técnica de muestras e imágenes antes de turnar a validación médica.
      </p>

      <EstadisticasRolWidget />

      {aviso && (
        <div className="sd-banner-pendiente" role="status">
          {aviso}
        </div>
      )}

      <div className="sd-card">
        <label htmlFor="motivo-rechazo">Motivo de rechazo (solo si se rechaza un estudio)</label>
        <input
          id="motivo-rechazo"
          value={motivoRechazo}
          onChange={(e) => setMotivoRechazo(e.target.value)}
          placeholder="Ej. Imagen borrosa, repetir toma..."
          style={{
            width: '100%',
            padding: '0.5rem',
            marginTop: '0.35rem',
            borderRadius: 8,
            border: '1px solid var(--sd-border)',
          }}
        />
      </div>

      <div className="sd-grid">
        {(data?.resultados ?? []).map((r) => (
          <article key={r.id} className="sd-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>{r.estudioNombre}</strong>
              <span className="sd-badge">{r.estado}</span>
            </div>
            <p className="sd-muted">
              Folio: {r.folioTramite} · Paciente: {r.pacienteId}
            </p>
            <p>{r.resumenClinico}</p>
            {r.motivoRechazo && (
              <div className="sd-alert-warn">Motivo previo: {r.motivoRechazo}</div>
            )}
            {usuario.rol === 'revisor_tecnico' &&
              (r.estado === 'captura' || r.estado === 'rechazado') && (
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="sd-btn-primary"
                    onClick={() => void aprobar(r.id)}
                  >
                    Aprobar revisión técnica
                  </button>
                  <button
                    type="button"
                    className="sd-btn-secondary"
                    onClick={() => void rechazar(r.id)}
                  >
                    Rechazar
                  </button>
                </div>
              )}
          </article>
        ))}
      </div>
    </div>
  );
}
