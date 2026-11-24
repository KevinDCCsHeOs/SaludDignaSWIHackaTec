import type { CanalAtencion, TipoActor } from '@salud-digna/shared';
import { META_CANAL_VISUAL, MetaCanalVisual } from './index';

export interface ItemTimelineApi {
  eventId: string;
  fecha: string;
  canal: CanalAtencion;
  actor: string;
  actorTipo: TipoActor;
  accion: string;
  estado?: string | null;
}

export interface NodoTimelineRenderizable extends ItemTimelineApi {
  metaCanal: MetaCanalVisual;
  esCambioDeCanal: boolean;
}

/**
 * Construye el modelo visual reutilizable del componente `<Timeline />` para `apps/web` y `apps/mobile` (#15).
 * Enriquece cada entrada con el ícono y color de su canal e indica visualmente cada salto de canal.
 */
export function construirModeloTimeline(
  items: readonly ItemTimelineApi[],
): NodoTimelineRenderizable[] {
  return items.map((item, idx) => ({
    ...item,
    metaCanal: META_CANAL_VISUAL[item.canal],
    esCambioDeCanal: idx > 0 && items[idx - 1].canal !== item.canal,
  }));
}

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Renderizador HTML ligero del componente `<Timeline />` (reutilizable para SSR/preview/web).
 */
export function renderizarTimelineHtml(items: readonly ItemTimelineApi[]): string {
  const nodos = construirModeloTimeline(items);
  const filas = nodos
    .map(
      (n) =>
        `<li data-canal="${n.canal}" data-cambio-canal="${n.esCambioDeCanal}">` +
        `<span style="color:${n.metaCanal.color}">[${n.metaCanal.icono}]</span> ` +
        `<time>${escaparHtml(n.fecha)}</time> — ` +
        `<strong>${escaparHtml(n.actor)}</strong>: ${escaparHtml(n.accion)}` +
        (n.estado ? ` <em>(${escaparHtml(n.estado)})</em>` : '') +
        `</li>`,
    )
    .join('');

  return `<ol class="sd-timeline" aria-label="Línea de tiempo del paciente">${filas}</ol>`;
}
