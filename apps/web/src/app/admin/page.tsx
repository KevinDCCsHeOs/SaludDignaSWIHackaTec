'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { EstadisticasRolWidget } from '../../components/EstadisticasRolWidget';
import { apiWeb } from '../../lib/api';
import { useAppWeb } from '../../lib/providers';

const COLORES_CANAL = ['#0b6e4f', '#16a34a', '#1d4ed8', '#7c3aed', '#d97706'];

export default function AdminDashboardPage() {
  const { token, usuario } = useAppWeb();
  const queryClient = useQueryClient();
  const [region, setRegion] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [alertaTitulo, setAlertaTitulo] = useState('');
  const [alertaMensaje, setAlertaMensaje] = useState('');
  const [alertaRegion, setAlertaRegion] = useState('Puebla');
  const [alertaNivel, setAlertaNivel] = useState<'informativa' | 'preventiva' | 'urgente'>(
    'preventiva',
  );

  const autorizado = usuario && (usuario.rol === 'admin' || usuario.rol === 'asesor_pro');

  const { data, isLoading } = useQuery({
    queryKey: ['metricas', 'admin', region, desde, hasta],
    queryFn: () =>
      apiWeb.obtenerMetricasAdmin(token!, {
        region: region || undefined,
        desde: desde ? new Date(desde).toISOString() : undefined,
        hasta: hasta ? new Date(hasta).toISOString() : undefined,
      }),
    enabled: Boolean(token && autorizado),
  });

  const { data: servicio } = useQuery({
    queryKey: ['servicio-estatus', region || 'todas'],
    queryFn: () => apiWeb.obtenerEstatusServicio(region || undefined),
    enabled: Boolean(autorizado),
  });

  const { data: alertasData } = useQuery({
    queryKey: ['alertas', 'activas', region || 'todas'],
    queryFn: () => apiWeb.listarAlertasActivas(region || undefined),
    enabled: Boolean(autorizado),
  });

  const enviarAlerta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !alertaTitulo.trim() || !alertaMensaje.trim()) return;
    try {
      const res = await apiWeb.publicarAlerta(token, {
        titulo: alertaTitulo.trim(),
        mensaje: alertaMensaje.trim(),
        region: alertaRegion,
        nivel: alertaNivel,
      });
      setMensaje(
        `Alerta "${res.alerta.titulo}" publicada para ${alertaRegion} (${res.alerta.destinatariosNotificados} paciente(s) notificados por su canal preferido).`,
      );
      setAlertaTitulo('');
      setAlertaMensaje('');
      await queryClient.invalidateQueries({ queryKey: ['alertas'] });
    } catch (err) {
      setMensaje(err instanceof Error ? err.message : 'No se pudo publicar la alerta');
    }
  };

  const descargarCsv = async () => {
    if (!token) return;
    try {
      const csv = await apiWeb.exportarMetricasCsv(token, {
        region: region || undefined,
        desde: desde ? new Date(desde).toISOString() : undefined,
        hasta: hasta ? new Date(hasta).toISOString() : undefined,
      });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'metricas-salud-digna.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setMensaje(err instanceof Error ? err.message : 'No se pudo exportar el CSV');
    }
  };

  const cambiarEstatusClinica = async (
    clinicaId: string,
    estatus: 'operando' | 'retraso' | 'fuera_de_servicio',
  ) => {
    if (!token) return;
    const texto =
      estatus === 'operando'
        ? null
        : estatus === 'retraso'
          ? 'Alta demanda temporal en clínica; espera estimada +20 min.'
          : 'Mantenimiento temporal en equipos; redirigiendo a sucursal cercana.';
    await apiWeb.actualizarEstatusClinica(token, clinicaId, estatus, texto);
    await queryClient.invalidateQueries({ queryKey: ['servicio-estatus'] });
    await queryClient.invalidateQueries({ queryKey: ['metricas'] });
  };

  if (!usuario || !autorizado) {
    return (
      <section className="sd-card">
        <h1>Dashboard de KPIs (Admin)</h1>
        <p className="sd-muted">
          Inicia sesión como administrador para consultar métricas operativas.
        </p>
        <Link href="/login" className="sd-btn-primary">
          Iniciar sesión
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
          <h1 style={{ marginBottom: '0.25rem' }}>Dashboard Admin de KPIs</h1>
          <p className="sd-muted" style={{ marginTop: 0 }}>
            Indicadores calculados en tiempo real desde eventos, trámites y tickets del sistema.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Link href="/journey" className="sd-btn-secondary">
            Ver Patient Journey
          </Link>
          {usuario.rol === 'admin' && (
            <button type="button" className="sd-btn-primary" onClick={() => void descargarCsv()}>
              Exportar CSV
            </button>
          )}
        </div>
      </div>

      {mensaje && <div className="sd-alert-warn">{mensaje}</div>}

      <EstadisticasRolWidget />

      <section
        className="sd-card"
        style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'end' }}
      >
        <div className="sd-field" style={{ marginBottom: 0 }}>
          <label htmlFor="f-region">Región</label>
          <select id="f-region" value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="">Todas las regiones</option>
            <option value="Puebla">Puebla</option>
            <option value="CDMX">CDMX</option>
            <option value="Monterrey">Monterrey</option>
          </select>
        </div>
        <div className="sd-field" style={{ marginBottom: 0 }}>
          <label htmlFor="f-desde">Desde</label>
          <input
            id="f-desde"
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
          />
        </div>
        <div className="sd-field" style={{ marginBottom: 0 }}>
          <label htmlFor="f-hasta">Hasta</label>
          <input
            id="f-hasta"
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
          />
        </div>
      </section>

      {isLoading && <p>Calculando KPIs...</p>}

      {data && (
        <>
          <section className="sd-kpi-grid" style={{ marginBottom: '1rem' }}>
            <article className="sd-card">
              <span className="sd-muted">Trámites retomados en otro canal</span>
              <div className="sd-kpi-valor">{data.kpis.tramitesRetomadosOtroCanalPct}%</div>
              <span className="sd-muted">
                {data.kpis.tramitesRetomadosOtroCanal} de {data.kpis.tramitesTotales} trámites
              </span>
            </article>
            <article className="sd-card">
              <span className="sd-muted">Cambios de canal registrados</span>
              <div className="sd-kpi-valor">{data.kpis.cambiosDeCanalTotal}</div>
              <span className="sd-muted">Sin pérdida de contexto</span>
            </article>
            <article className="sd-card">
              <span className="sd-muted">Tiempo promedio de atención</span>
              <div className="sd-kpi-valor">{data.kpis.tiempoPromedioAtencionMinutos} min</div>
              <span className="sd-muted">
                1ra respuesta: {data.kpis.tiempoPromedioPrimeraRespuestaMinutos} min
              </span>
            </article>
            <article className="sd-card">
              <span className="sd-muted">Resolución en primer contacto</span>
              <div className="sd-kpi-valor">{data.kpis.resolucionPrimerContactoPct}%</div>
              <span className="sd-muted">Tickets abiertos: {data.kpis.ticketsAbiertos}</span>
            </article>
          </section>

          <div className="sd-grid">
            <section className="sd-card">
              <h2 style={{ marginTop: 0 }}>Tickets por región</h2>
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.ticketsPorRegion}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="region" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="abiertos" name="Abiertos" fill="#f59e0b" />
                    <Bar dataKey="enAtencion" name="En atención" fill="#1d4ed8" />
                    <Bar dataKey="escalados" name="Escalados" fill="#dc2626" />
                    <Bar dataKey="cerrados" name="Cerrados" fill="#0b6e4f" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="sd-card">
              <h2 style={{ marginTop: 0 }}>Interacciones por canal</h2>
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.interaccionesPorCanal}
                      dataKey="total"
                      nameKey="canal"
                      cx="50%"
                      cy="50%"
                      outerRadius={85}
                      label
                    >
                      {data.interaccionesPorCanal.map((entry, idx) => (
                        <Cell key={entry.canal} fill={COLORES_CANAL[idx % COLORES_CANAL.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>

          <section className="sd-card">
            <h2 style={{ marginTop: 0 }}>Estatus operativo por clínica (#31)</h2>
            <p className="sd-muted">
              Operando: <strong>{data.estatusClinicas.operando}</strong> · Con retraso:{' '}
              <strong>{data.estatusClinicas.retraso}</strong> · Fuera de servicio:{' '}
              <strong>{data.estatusClinicas.fuera_de_servicio}</strong>
            </p>
            <div className="sd-grid">
              {(servicio?.clinicas ?? []).map((cli) => (
                <article key={cli.id} className="sd-card" style={{ marginBottom: 0 }}>
                  <strong>{cli.nombre}</strong>
                  <p className="sd-muted" style={{ margin: '0.25rem 0' }}>
                    {cli.region} · {cli.mensajeEstatus ?? 'Operación normal'}
                  </p>
                  <select
                    aria-label={`Estatus de ${cli.nombre}`}
                    value={cli.estatus}
                    onChange={(e) =>
                      void cambiarEstatusClinica(
                        cli.id,
                        e.target.value as 'operando' | 'retraso' | 'fuera_de_servicio',
                      )
                    }
                    style={{
                      padding: '0.35rem 0.5rem',
                      borderRadius: 8,
                      border: '1px solid var(--sd-border)',
                    }}
                  >
                    <option value="operando">Operando</option>
                    <option value="retraso">Con retraso</option>
                    <option value="fuera_de_servicio">Fuera de servicio</option>
                  </select>
                </article>
              ))}
            </div>
          </section>

          <section className="sd-card">
            <h2 style={{ marginTop: 0 }}>Alertas epidemiológicas y prevención (#32)</h2>
            {usuario.rol === 'admin' && (
              <form onSubmit={(e) => void enviarAlerta(e)} style={{ marginBottom: '1rem' }}>
                <div className="sd-grid">
                  <div className="sd-field">
                    <label htmlFor="alr-titulo">Título de la alerta</label>
                    <input
                      id="alr-titulo"
                      required
                      minLength={4}
                      value={alertaTitulo}
                      onChange={(e) => setAlertaTitulo(e.target.value)}
                      placeholder="Ej. Prevención de dengue en Puebla"
                    />
                  </div>
                  <div className="sd-field">
                    <label htmlFor="alr-region">Región destinataria</label>
                    <select
                      id="alr-region"
                      value={alertaRegion}
                      onChange={(e) => setAlertaRegion(e.target.value)}
                    >
                      <option value="Puebla">Puebla</option>
                      <option value="CDMX">CDMX</option>
                      <option value="Monterrey">Monterrey</option>
                      <option value="todas">Todas las regiones</option>
                    </select>
                  </div>
                  <div className="sd-field">
                    <label htmlFor="alr-nivel">Nivel</label>
                    <select
                      id="alr-nivel"
                      value={alertaNivel}
                      onChange={(e) =>
                        setAlertaNivel(e.target.value as 'informativa' | 'preventiva' | 'urgente')
                      }
                    >
                      <option value="informativa">Informativa</option>
                      <option value="preventiva">Preventiva</option>
                      <option value="urgente">Urgente</option>
                    </select>
                  </div>
                </div>
                <div className="sd-field">
                  <label htmlFor="alr-msg">Mensaje preventivo</label>
                  <textarea
                    id="alr-msg"
                    rows={2}
                    required
                    minLength={10}
                    value={alertaMensaje}
                    onChange={(e) => setAlertaMensaje(e.target.value)}
                    placeholder="Indica recomendaciones preventivas para los pacientes de la región..."
                  />
                </div>
                <button type="submit" className="sd-btn-primary">
                  Publicar y notificar región
                </button>
              </form>
            )}
            <div className="sd-grid">
              {(alertasData?.alertas ?? []).map((a) => (
                <article key={a.id} className="sd-card" style={{ marginBottom: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <strong>{a.titulo}</strong>
                    <span className="sd-badge">{a.nivel}</span>
                  </div>
                  <p className="sd-muted" style={{ margin: '0.35rem 0' }}>
                    Región: {a.region} · Notificados: {a.destinatariosNotificados}
                  </p>
                  <p style={{ margin: 0 }}>{a.mensaje}</p>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
