'use client';

import { Suspense, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiWeb, ClinicaDto } from '../../../lib/api';
import { useAppWeb } from '../../../lib/providers';

const MapaClinicas = dynamic(
  () => import('../../../components/MapaClinicas').then((m) => m.MapaClinicas),
  {
    ssr: false,
    loading: () => (
      <div className="sd-card" role="status">
        Cargando mapa interactivo de clínicas...
      </div>
    ),
  },
);

function SeleccionClinicaContenido() {
  const { t, token } = useAppWeb();
  const params = useSearchParams();
  const tramiteId = params.get('tramiteId');
  const [region, setRegion] = useState('');
  const [clinicaSeleccionada, setClinicaSeleccionada] = useState<ClinicaDto | null>(null);
  const [autoguardado, setAutoguardado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['clinicas', region],
    queryFn: () => apiWeb.listarClinicas(region || undefined),
  });

  const seleccionarYAutoguardar = async (clinica: ClinicaDto) => {
    setClinicaSeleccionada(clinica);
    setError(null);
    if (!token || !tramiteId) return;

    try {
      // Autoguardado inmediato del avance sin esperar a "Confirmar" (#13, #18)
      const res = await apiWeb.autoguardarContexto(token, tramiteId, {
        canal: 'web',
        clinicaId: clinica.id,
        pendientes: ['confirmar_fecha', 'aceptar_preparacion'],
      });
      setAutoguardado(res.resumen);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.estados.errorGenerico);
    }
  };

  return (
    <div>
      <div className="sd-stepper" aria-label="Progreso de cotización">
        <span className="sd-step">{t.cotizar.paso1}</span>
        <span className="sd-step sd-step-active">{t.cotizar.paso2}</span>
        <span className="sd-step">{t.cotizar.paso3}</span>
      </div>

      <h1>{t.cotizar.tituloClinicas}</h1>
      <p className="sd-muted">{t.cotizar.subtituloClinicas}</p>

      {autoguardado && (
        <div className="sd-banner-pendiente" role="status" aria-live="polite">
          <div>
            <strong>{t.cotizar.autoguardadoOk}</strong>
            <p className="sd-muted" style={{ margin: '0.2rem 0 0' }}>
              {autoguardado}
            </p>
          </div>
          {tramiteId && (
            <Link href={`/cotizar/cita?tramiteId=${tramiteId}`} className="sd-btn-primary">
              {t.cotizar.continuarCita}
            </Link>
          )}
        </div>
      )}

      {error && (
        <div className="sd-alert-error" role="alert">
          {error}
        </div>
      )}

      <div className="sd-card">
        <label htmlFor="filtro-region" style={{ marginRight: '0.75rem', fontWeight: 600 }}>
          Región:
        </label>
        <select
          id="filtro-region"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          style={{
            padding: '0.45rem 0.7rem',
            borderRadius: 8,
            border: '1px solid var(--sd-border)',
          }}
        >
          <option value="">{t.cotizar.todasRegiones}</option>
          <option value="Puebla">Puebla</option>
          <option value="CDMX">CDMX</option>
          <option value="Monterrey">Monterrey</option>
        </select>
      </div>

      {!isLoading && data?.clinicas && (
        <MapaClinicas
          clinicas={data.clinicas}
          seleccionadaId={clinicaSeleccionada?.id ?? null}
          onSeleccionar={(cli) => void seleccionarYAutoguardar(cli)}
        />
      )}

      <div className="sd-grid">
        {(data?.clinicas ?? []).map((cli) => (
          <article
            key={cli.id}
            className="sd-card"
            style={{
              borderColor:
                clinicaSeleccionada?.id === cli.id ? 'var(--sd-primary)' : 'var(--sd-border)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
              <span className="sd-badge">{cli.region}</span>
              <span className="sd-muted">{cli.estatus}</span>
            </div>
            <h2 style={{ fontSize: '1.05rem', margin: '0.5rem 0' }}>{cli.nombre}</h2>
            <p className="sd-muted">{cli.direccion}</p>
            {cli.mensajeEstatus && (
              <p className="sd-alert-warn" role="status">
                {cli.mensajeEstatus}
              </p>
            )}
            <button
              type="button"
              className="sd-btn-primary"
              onClick={() => void seleccionarYAutoguardar(cli)}
            >
              {clinicaSeleccionada?.id === cli.id ? 'Clínica seleccionada ✓' : 'Elegir clínica'}
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}

export default function ClinicaPage() {
  return (
    <Suspense fallback={<p>Cargando clínicas...</p>}>
      <SeleccionClinicaContenido />
    </Suspense>
  );
}
