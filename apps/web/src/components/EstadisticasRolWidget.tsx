'use client';

import { useQuery } from '@tanstack/react-query';
import { apiWeb } from '../lib/api';
import { useAppWeb } from '../lib/providers';

/**
 * Widget "Mis estadísticas" diferenciado por rol (#29).
 */
export function EstadisticasRolWidget() {
  const { token, usuario } = useAppWeb();

  const { data } = useQuery({
    queryKey: ['estadisticas', usuario?.id, usuario?.rol],
    queryFn: () => apiWeb.obtenerEstadisticasMiRol(token!),
    enabled: Boolean(token && usuario),
  });

  if (!usuario || !data) return null;

  return (
    <section className="sd-card" aria-label="Mis estadísticas">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.75rem',
        }}
      >
        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Mis estadísticas</h2>
        <span className="sd-badge">{data.rol}</span>
      </div>
      <div className="sd-kpi-grid">
        {data.tarjetas.map((item) => (
          <div key={item.clave} className="sd-kpi-box">
            <span className="sd-muted">{item.etiqueta}</span>
            <strong className="sd-kpi-valor">{item.valor}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
