'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { CANALES_ATENCION, ESTADOS_TRAMITE } from '@salud-digna/shared';
import { EstadisticasRolWidget } from '../../components/EstadisticasRolWidget';
import { apiWeb } from '../../lib/api';
import { useAppWeb } from '../../lib/providers';

export default function JourneyListaPage() {
  const { token, usuario } = useAppWeb();
  const [region, setRegion] = useState('');
  const [estado, setEstado] = useState('');
  const [canal, setCanal] = useState('');
  const [q, setQ] = useState('');

  const autorizado =
    usuario &&
    (usuario.rol === 'admin' || usuario.rol === 'asesor' || usuario.rol === 'asesor_pro');

  const { data, isLoading } = useQuery({
    queryKey: ['journey', 'lista', region, estado, canal, q],
    queryFn: () =>
      apiWeb.listarJourneyPacientes(token!, {
        region: region || undefined,
        estado: estado || undefined,
        canal: canal || undefined,
        q: q || undefined,
      }),
    enabled: Boolean(token && autorizado),
    refetchInterval: 5000,
  });

  if (!usuario) {
    return (
      <section className="sd-card">
        <h1>Patient Journey en tiempo real</h1>
        <p className="sd-muted">
          Inicia sesión como asesor o administrador para monitorear recorridos.
        </p>
        <Link href="/login" className="sd-btn-primary">
          Iniciar sesión
        </Link>
      </section>
    );
  }

  if (!autorizado) {
    return (
      <section className="sd-card">
        <h1>Acceso restringido (403)</h1>
        <p className="sd-muted">
          Esta vista está disponible únicamente para asesores y administradores.
        </p>
        <Link href="/403" className="sd-btn-secondary">
          Ver detalles de permisos
        </Link>
      </section>
    );
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        <div>
          <h1 style={{ marginBottom: '0.25rem' }}>Patient Journey en tiempo real</h1>
          <p className="sd-muted" style={{ marginTop: 0 }}>
            Monitorea en vivo en qué etapa se encuentra cada paciente y qué canales ha recorrido sin
            recargar.
          </p>
        </div>
        <Link href="/journey/pac_ana_demo" className="sd-btn-primary">
          Abrir Journey de Ana (Demo)
        </Link>
      </div>

      <EstadisticasRolWidget />

      <section className="sd-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem' }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar paciente o folio..."
          aria-label="Buscar paciente o folio"
          style={{
            flex: '1 1 200px',
            padding: '0.5rem 0.7rem',
            borderRadius: 8,
            border: '1px solid var(--sd-border)',
          }}
        />
        <select
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          aria-label="Filtrar por región"
          style={{ padding: '0.5rem', borderRadius: 8, border: '1px solid var(--sd-border)' }}
        >
          <option value="">Todas las regiones</option>
          <option value="Puebla">Puebla</option>
          <option value="CDMX">CDMX</option>
          <option value="Monterrey">Monterrey</option>
        </select>
        <select
          value={canal}
          onChange={(e) => setCanal(e.target.value)}
          aria-label="Filtrar por canal"
          style={{ padding: '0.5rem', borderRadius: 8, border: '1px solid var(--sd-border)' }}
        >
          <option value="">Todos los canales</option>
          {CANALES_ATENCION.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
          aria-label="Filtrar por estado"
          style={{ padding: '0.5rem', borderRadius: 8, border: '1px solid var(--sd-border)' }}
        >
          <option value="">Todas las etapas</option>
          {ESTADOS_TRAMITE.map((est) => (
            <option key={est} value={est}>
              {est}
            </option>
          ))}
        </select>
      </section>

      {isLoading && <p>Cargando pacientes activos...</p>}

      <div className="sd-grid">
        {(data?.pacientes ?? []).map((p) => (
          <article key={p.pacienteId} className="sd-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>{p.nombre}</strong>
              <span className="sd-badge">{p.ultimoCanal}</span>
            </div>
            <p className="sd-muted" style={{ margin: '0.35rem 0' }}>
              {p.folio ? `Folio ${p.folio}` : 'Sin trámite activo'} · Etapa:{' '}
              <strong>{p.estadoActual}</strong>
            </p>
            <p className="sd-muted" style={{ margin: '0.35rem 0' }}>
              {p.contexto.estudio ?? 'Estudio pendiente'} ·{' '}
              {p.contexto.clinica ?? 'Clínica pendiente'}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', margin: '0.6rem 0' }}>
              {p.canalesRecorridos.map((c, idx) => (
                <span key={`${c.canal}-${idx}`} className="sd-chip-cambio">
                  {idx > 0 ? '→ ' : ''}
                  {c.canal}
                </span>
              ))}
            </div>
            <Link href={`/journey/${encodeURIComponent(p.pacienteId)}`} className="sd-btn-primary">
              Ver tablero en vivo
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}
