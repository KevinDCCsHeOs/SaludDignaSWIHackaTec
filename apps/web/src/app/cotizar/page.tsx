'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { CATEGORIAS_ESTUDIO } from '@salud-digna/shared';
import { apiWeb, EstudioDto } from '../../lib/api';
import { useAppWeb } from '../../lib/providers';

export default function CotizarPage() {
  const { t, locale, token, usuario } = useAppWeb();
  const router = useRouter();
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState('');
  const [guardandoId, setGuardandoId] = useState<string | null>(null);
  const [explicacionFacil, setExplicacionFacil] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const alternarExplicacionFacil = async (estudioId: string) => {
    if (explicacionFacil[estudioId]) {
      setExplicacionFacil((prev) => {
        const next = { ...prev };
        delete next[estudioId];
        return next;
      });
      return;
    }
    try {
      const res = await apiWeb.obtenerPreparacionSencilla(estudioId, locale);
      setExplicacionFacil((prev) => ({ ...prev, [estudioId]: res.preparacionSencilla }));
    } catch {
      // Mantiene preparación clínica si falla la consulta
    }
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ['estudios', categoria, busqueda],
    queryFn: () => apiWeb.listarEstudios(categoria || undefined, busqueda || undefined),
  });

  const seleccionarEstudio = async (estudio: EstudioDto) => {
    setError(null);
    if (!token || !usuario?.pacienteId) {
      router.push('/login');
      return;
    }

    setGuardandoId(estudio.id);
    try {
      const tramite = await apiWeb.crearTramite(token, {
        pacienteId: usuario.pacienteId,
        canal: 'web',
        estudioId: estudio.id,
      });
      router.push(`/cotizar/clinica?tramiteId=${tramite.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.estados.errorGenerico);
    } finally {
      setGuardandoId(null);
    }
  };

  return (
    <div>
      <div className="sd-stepper" aria-label="Progreso de cotización">
        <span className="sd-step sd-step-active">{t.cotizar.paso1}</span>
        <span className="sd-step">{t.cotizar.paso2}</span>
        <span className="sd-step">{t.cotizar.paso3}</span>
      </div>

      <h1>{t.cotizar.tituloEstudios}</h1>
      <p className="sd-muted">{t.cotizar.subtituloEstudios}</p>

      {error && (
        <div className="sd-alert-error" role="alert">
          {error}
        </div>
      )}

      <div className="sd-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
        <input
          style={{
            flex: '1 1 240px',
            padding: '0.55rem 0.75rem',
            borderRadius: 8,
            border: '1px solid var(--sd-border)',
          }}
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder={t.cotizar.buscarPlaceholder}
          aria-label={t.cotizar.buscarPlaceholder}
        />
        <select
          style={{
            padding: '0.55rem 0.75rem',
            borderRadius: 8,
            border: '1px solid var(--sd-border)',
          }}
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          aria-label="Filtrar por categoría"
        >
          <option value="">{t.cotizar.todasCategorias}</option>
          {CATEGORIAS_ESTUDIO.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <p>{t.estados.cargando}</p>}
      {isError && (
        <div className="sd-alert-error" role="alert">
          {t.estados.errorGenerico}
        </div>
      )}

      <div className="sd-grid">
        {(data?.estudios ?? []).map((est) => (
          <article key={est.id} className="sd-card">
            <span className="sd-badge">{est.categoria}</span>
            <h2 style={{ fontSize: '1.05rem', margin: '0.5rem 0' }}>{est.nombre}</h2>
            <p style={{ fontWeight: 700, fontSize: '1.15rem', color: 'var(--sd-primary)' }}>
              ${est.precio} MXN
            </p>
            <p className="sd-muted">
              <strong>{t.cotizar.preparacion}:</strong>{' '}
              {explicacionFacil[est.id] ?? est.preparacion}
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="sd-btn-primary"
                disabled={guardandoId === est.id}
                onClick={() => void seleccionarEstudio(est)}
              >
                {guardandoId === est.id ? t.cotizar.guardando : t.cotizar.seleccionar}
              </button>
              <button
                type="button"
                className="sd-btn-ghost"
                onClick={() => void alternarExplicacionFacil(est.id)}
              >
                {explicacionFacil[est.id] ? t.cotizar.verOriginal : t.cotizar.explicameFacil}
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
