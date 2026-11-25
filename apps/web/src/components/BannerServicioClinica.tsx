'use client';

import { useQuery } from '@tanstack/react-query';
import { apiWeb } from '../lib/api';

/**
 * Banner de incidencia operativa de la clínica del paciente (#31).
 */
export function BannerServicioClinica({
  clinicaId,
  region,
}: {
  clinicaId?: string | null;
  region?: string | null;
}) {
  const { data } = useQuery({
    queryKey: ['servicio-estatus', region ?? 'todas'],
    queryFn: () => apiWeb.obtenerEstatusServicio(region ?? undefined),
  });

  if (!data) return null;
  const incidencia = clinicaId
    ? data.incidencias.find((i) => i.clinicaId === clinicaId)
    : data.incidencias[0];

  if (!incidencia) return null;

  return (
    <div
      className={incidencia.estatus === 'fuera_de_servicio' ? 'sd-alert-error' : 'sd-alert-warn'}
      role="status"
      aria-live="polite"
    >
      <strong>
        Aviso de servicio ({incidencia.nombre} — {incidencia.estatus.replace('_', ' ')}):
      </strong>{' '}
      {incidencia.mensaje}
    </div>
  );
}
