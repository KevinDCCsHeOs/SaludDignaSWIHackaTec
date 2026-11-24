'use client';

import { construirModeloTimeline } from '@salud-digna/ui';
import type { EntradaTimelineDto } from '../lib/api';

export function TimelinePanel({ items }: { items: EntradaTimelineDto[] }) {
  const nodos = construirModeloTimeline(items);

  if (nodos.length === 0) {
    return <p className="sd-muted">Sin eventos registrados todavía.</p>;
  }

  return (
    <ol className="sd-timeline-list" aria-label="Línea de tiempo unificada">
      {nodos.map((n) => (
        <li key={n.eventId} className="sd-timeline-item">
          <div className="sd-timeline-badge" style={{ backgroundColor: n.metaCanal.color }}>
            {n.canal}
          </div>
          <div className="sd-timeline-body">
            <div className="sd-timeline-meta">
              <strong>{n.actor}</strong>
              <time dateTime={n.fecha}>{new Date(n.fecha).toLocaleString('es-MX')}</time>
            </div>
            <p>{n.accion}</p>
            {n.esCambioDeCanal && <span className="sd-chip-cambio">Cambio de canal</span>}
          </div>
        </li>
      ))}
    </ol>
  );
}
