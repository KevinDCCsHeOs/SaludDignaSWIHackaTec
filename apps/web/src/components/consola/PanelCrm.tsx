'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { EstadoTramite } from '@salud-digna/shared';
import { apiWeb, type EntradaTimelineDto, type TramiteDto } from '../../lib/api';
import {
  calcularPrioridad,
  calcularTramos,
  estadoCanales,
  origenDetencion,
  porcentajeAvance,
  siguienteMejorAccion,
  tramoPendiente,
  ultimaActividadPaciente,
} from '../../lib/crm';

const NOMBRE_CANAL: Record<string, string> = {
  web: 'Web',
  app: 'App',
  whatsapp: 'WhatsApp',
  call_center: 'Teléfono',
  email: 'Correo',
};

interface Props {
  token: string;
  pacienteId: string;
  tramiteId: string;
  folio: string;
  estado: EstadoTramite;
  contexto: TramiteDto['contexto'];
  timeline: EntradaTimelineDto[];
  usuarioId: string;
  onAviso: (texto: string) => void;
  onError: (texto: string) => void;
}

function segundosRestantes(hasta: string | undefined, ahora: number): number {
  if (!hasta) return 0;
  return Math.max(0, Math.round((Date.parse(hasta) - ahora) / 1000));
}

/**
 * Vista del operador tipo CRM (traspaso v2, sección 8): avance por tramos con el canal de cada paso,
 * semáforo de canales, detención, siguiente mejor acción, estudios con candado y la llamada como
 * canal propietario. El operador ve estados, nunca resultados clínicos.
 */
export function PanelCrm(props: Props) {
  const { token, pacienteId, tramiteId, folio, estado, contexto, timeline } = props;
  const queryClient = useQueryClient();
  const [ahora, setAhora] = useState(() => Date.now());
  // Referencia estable al callback de error para no reiniciar el latido en cada render
  const onErrorRef = useRef(props.onError);
  onErrorRef.current = props.onError;

  // Reloj de la vista (cronómetro del permiso y estados "hace X min")
  useEffect(() => {
    const id = window.setInterval(() => setAhora(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const { data: estudios } = useQuery({
    queryKey: ['estado-estudios', pacienteId],
    queryFn: () => apiWeb.estadoEstudios(token, pacienteId),
    retry: false,
  });
  const { data: plazos } = useQuery({
    queryKey: ['plazos'],
    queryFn: () => apiWeb.obtenerPlazos(token),
    staleTime: Infinity,
  });

  const propietario = contexto.propietario ?? null;
  const enLlamadaMia =
    Boolean(propietario?.exclusivo) &&
    propietario?.actorId === props.usuarioId &&
    segundosRestantes(propietario?.hasta, ahora) > 0;

  // Latido mientras dura la llamada: renueva el permiso a la mitad de su vigencia
  const lease = plazos?.plazos.lease ?? 120;
  useEffect(() => {
    if (!enLlamadaMia) return;
    const id = window.setInterval(
      () => {
        void apiWeb
          .renovarLlamada(token, tramiteId)
          .then(() => queryClient.invalidateQueries({ queryKey: ['contexto'] }))
          .catch(() =>
            onErrorRef.current('Se perdió el permiso de la llamada; vuelve a atenderla.'),
          );
      },
      Math.max(5, lease / 2) * 1000,
    );
    return () => window.clearInterval(id);
  }, [enLlamadaMia, lease, token, tramiteId, queryClient]);

  const refrescar = () => {
    void queryClient.invalidateQueries({ queryKey: ['contexto'] });
    void queryClient.invalidateQueries({ queryKey: ['timeline'] });
  };

  const atender = async () => {
    try {
      await apiWeb.atenderLlamada(token, tramiteId, contexto.versionTramite);
      props.onAviso(
        `Atiendes la llamada del folio ${folio}: el bot de WhatsApp deja de escribir mientras dure.`,
      );
      refrescar();
    } catch (err) {
      props.onError(err instanceof Error ? err.message : 'No se pudo tomar el trámite');
      refrescar();
    }
  };

  const colgar = async () => {
    try {
      await apiWeb.colgarLlamada(token, tramiteId);
      props.onAviso('Llamada terminada: el trámite queda libre para cualquier canal.');
      refrescar();
    } catch (err) {
      props.onError(err instanceof Error ? err.message : 'No se pudo liberar el trámite');
    }
  };

  const tramos = calcularTramos(estado, null, timeline);
  const avance = porcentajeAvance(tramos);
  const pendiente = tramoPendiente(tramos);
  const canales = estadoCanales(timeline, propietario, ahora);
  const origen = origenDetencion(estado, timeline, ahora);
  const orden = estudios?.ordenes.find((o) => o.tramiteId === tramiteId) ?? null;
  const prioridad = calcularPrioridad({
    salidaNoConforme: false,
    avance,
    ultimaActividad: ultimaActividadPaciente(timeline),
    resultadosIncompletos: Boolean(orden?.enlaceBloqueado && orden.total > 1),
    ahora,
  });
  const accion = siguienteMejorAccion({ estado, tramos, canales, origen, orden, timeline, ahora });

  return (
    <section className="sd-card sd-crm" aria-label="Seguimiento del trámite">
      <div className="sd-crm-encabezado">
        <h3 style={{ margin: 0, fontSize: '1rem' }}>Seguimiento del trámite {folio}</h3>
        <span
          className="sd-badge"
          title="Aumenta con cada cambio; evita escrituras con datos viejos"
        >
          Versión {contexto.versionTramite ?? 1}
        </span>
      </div>

      {/* Canal propietario: la llamada toma el trámite en exclusiva */}
      <div className={`sd-crm-llamada${enLlamadaMia ? ' sd-crm-llamada-activa' : ''}`}>
        {enLlamadaMia ? (
          <>
            <span>
              <strong>En llamada.</strong> El bot de WhatsApp guarda silencio. Permiso vigente{' '}
              {segundosRestantes(propietario?.hasta, ahora)} s (se renueva solo).
            </span>
            <button type="button" className="sd-btn-secondary" onClick={() => void colgar()}>
              Colgar y liberar
            </button>
          </>
        ) : propietario?.exclusivo && segundosRestantes(propietario.hasta, ahora) > 0 ? (
          <span>
            Otro asesor atiende este trámite por teléfono (
            {segundosRestantes(propietario.hasta, ahora)} s).
          </span>
        ) : (
          <>
            <span>
              Canal propietario:{' '}
              <strong>
                {propietario && segundosRestantes(propietario.hasta, ahora) > 0
                  ? NOMBRE_CANAL[propietario.canal]
                  : 'ninguno (cualquier canal puede retomar)'}
              </strong>
            </span>
            <button type="button" className="sd-btn-primary" onClick={() => void atender()}>
              Atender llamada
            </button>
          </>
        )}
      </div>

      {/* Barra de avance por tramos */}
      <div className="sd-crm-bloque">
        <div className="sd-crm-fila">
          <strong>Avance {avance} %</strong>
          {origen === 'paciente' && (
            <span className="sd-chip sd-chip-ambar">Detenido por el paciente</span>
          )}
          {origen === 'interno' && (
            <span className="sd-chip sd-chip-rojo">Detenido por proceso interno</span>
          )}
        </div>
        <ol className="sd-tramos" aria-label="Pasos del proceso">
          {tramos.map((t) => {
            const aqui = pendiente?.clave === t.clave;
            return (
              <li
                key={t.clave}
                className={`sd-tramo${t.completado ? ' sd-tramo-hecho' : ''}${aqui ? ' sd-tramo-aqui' : ''}`}
              >
                <span className="sd-tramo-canal">
                  {t.canal ? NOMBRE_CANAL[t.canal] : t.completado ? '—' : ''}
                </span>
                <span className="sd-tramo-barra" aria-hidden="true" />
                <span className="sd-tramo-etiqueta">
                  {t.etiqueta}
                  {aqui && <em> · aquí se quedó</em>}
                  <span className="sd-sr-only">
                    {t.completado ? ' (completado)' : aqui ? ' (pendiente actual)' : ' (pendiente)'}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Semáforo de canales */}
      <div className="sd-crm-bloque">
        <strong>Canales</strong>
        <ul className="sd-semaforo">
          {canales.map((c) => (
            <li key={c.canal} className="sd-semaforo-item" title={c.detalle}>
              <span className={`sd-luz sd-luz-${c.color}`} aria-hidden="true" />
              <span>
                <strong>{c.etiqueta}</strong>
                <br />
                <span className="sd-muted">{c.estado}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Estudios de la orden con candado: estados, nunca valores */}
      {orden && (
        <div className="sd-crm-bloque">
          <div className="sd-crm-fila">
            <strong>Estudios de la orden</strong>
            {orden.enlaceBloqueado ? (
              <span className="sd-chip sd-chip-ambar">
                🔒 Bloqueado: {orden.liberados} de {orden.total}
              </span>
            ) : (
              <span className="sd-chip sd-chip-verde">Enlace de resultados disponible</span>
            )}
          </div>
          <ul className="sd-lista-simple">
            {orden.estudios.map((e, i) => (
              <li key={`${e.estudioNombre}-${i}`}>
                {e.estudioNombre}:{' '}
                <strong>{e.estado === 'liberado' ? 'liberado' : 'pendiente'}</strong>
                {e.estado !== 'liberado' && (
                  <span className="sd-muted"> ({e.estado.replace('_', ' ')})</span>
                )}
              </li>
            ))}
          </ul>
          <p className="sd-muted" style={{ margin: 0, fontSize: '0.85rem' }}>
            Tu rol ve el estado de cada estudio, no su contenido clínico.
          </p>
        </div>
      )}

      {/* Siguiente mejor acción y prioridad */}
      <div className="sd-crm-bloque sd-crm-accion">
        <div className="sd-crm-fila">
          <strong>Siguiente mejor acción: {accion.titulo}</strong>
          <span
            className={`sd-chip ${prioridad.nivel === 'Alta' ? 'sd-chip-rojo' : prioridad.nivel === 'Media' ? 'sd-chip-ambar' : 'sd-chip-gris'}`}
            title={prioridad.razones.join(' · ')}
          >
            Prioridad {prioridad.nivel} ({prioridad.puntos})
          </span>
        </div>
        <ul className="sd-lista-simple">
          {accion.porque.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p style={{ margin: '0.25rem 0 0' }}>
          Canal sugerido: <strong>{accion.canalSugerido}</strong>
        </p>
        <p className="sd-muted" style={{ margin: '0.25rem 0 0', fontSize: '0.8rem' }}>
          Reglas de prioridad y de siguiente acción: propuesta del equipo por validar con Salud
          Digna.
        </p>
      </div>
    </section>
  );
}
