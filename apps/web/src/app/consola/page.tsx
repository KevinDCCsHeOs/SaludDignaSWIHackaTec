'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { TimelinePanel } from '../../components/TimelinePanel';
import { PanelCrm } from '../../components/consola/PanelCrm';
import { apiWeb, PacienteResumenDto, TicketDto } from '../../lib/api';
import { useAppWeb } from '../../lib/providers';

export default function ConsolaAsesorPage() {
  const { token, usuario } = useAppWeb();
  const queryClient = useQueryClient();
  const inputBusquedaRef = useRef<HTMLInputElement | null>(null);

  const [regionFiltro, setRegionFiltro] = useState('Puebla');
  const [busqueda, setBusqueda] = useState('');
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState<PacienteResumenDto | null>(null);
  const [verificadoCallCenter, setVerificadoCallCenter] = useState(false);
  const [fechaNacVerif, setFechaNacVerif] = useState('1995-04-12');
  const [ultimos4Verif, setUltimos4Verif] = useState('4567');
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Modal / panel de registro de llamada (#19, #23)
  const [mostrarLlamada, setMostrarLlamada] = useState(false);
  const [motivoLlamada, setMotivoLlamada] = useState('Confirmación de cita y preparación');
  const [notasLlamada, setNotasLlamada] = useState(
    'Se aclaró ayuno de 6 horas sin volver a pedir estudio ni clínica.',
  );
  const [resultadoLlamada, setResultadoLlamada] = useState('Cita confirmada');

  // Simulador de correo entrante (#23)
  const [mostrarCorreo, setMostrarCorreo] = useState(false);
  const [correoRemitente, setCorreoRemitente] = useState('ana.lopez@demo.saluddigna.local');
  const [correoAsunto, setCorreoAsunto] = useState('Confirmación de horario');
  const [correoCuerpo, setCorreoCuerpo] = useState(
    'Confirmo mi cita para mañana en Puebla Centro.',
  );

  const autorizado = Boolean(
    usuario &&
    (usuario.rol === 'asesor' || usuario.rol === 'asesor_pro' || usuario.rol === 'admin'),
  );

  const { data: ticketsData } = useQuery({
    queryKey: ['tickets', regionFiltro],
    queryFn: () => apiWeb.listarTickets(token!, regionFiltro || undefined),
    enabled: Boolean(token && autorizado),
  });

  const { data: pacientesData } = useQuery({
    queryKey: ['pacientes-busqueda', busqueda],
    queryFn: () => apiWeb.buscarPacientes(token!, busqueda),
    enabled: Boolean(token && autorizado),
  });

  const pacienteIdActivo = pacienteSeleccionado?.id ?? pacientesData?.pacientes[0]?.id ?? null;

  const { data: contexto } = useQuery({
    queryKey: ['contexto', pacienteIdActivo],
    queryFn: () => apiWeb.obtenerContextoPaciente(token!, pacienteIdActivo!),
    enabled: Boolean(token && autorizado && pacienteIdActivo),
    retry: false,
  });

  const { data: timeline } = useQuery({
    queryKey: ['timeline', pacienteIdActivo],
    queryFn: () => apiWeb.obtenerTimeline(token!, pacienteIdActivo!),
    enabled: Boolean(token && autorizado && pacienteIdActivo),
  });

  // Atajos de teclado frecuentes (#19): Alt+B buscar, Alt+L llamada, Alt+E correo
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'b') {
        e.preventDefault();
        inputBusquedaRef.current?.focus();
      } else if (k === 'l') {
        e.preventDefault();
        setMostrarLlamada((v) => !v);
      } else if (k === 'e') {
        e.preventDefault();
        setMostrarCorreo((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (!autorizado || !token) {
    return (
      <section className="sd-card">
        <h1>Consola de Call Center / Asesor</h1>
        <p className="sd-muted">
          Esta vista está protegida para roles <code>asesor</code>, <code>asesor_pro</code> y{' '}
          <code>admin</code>.
        </p>
        <Link href="/login" className="sd-btn-primary">
          Iniciar sesión como asesor
        </Link>
      </section>
    );
  }

  const ficha =
    pacienteSeleccionado ?? pacientesData?.pacientes.find((p) => p.id === pacienteIdActivo) ?? null;

  const ticketDelPaciente: TicketDto | undefined = (ticketsData?.tickets ?? []).find(
    (tk) => tk.pacienteId === pacienteIdActivo,
  );

  const verificarIdentidadCallCenter = async () => {
    if (!pacienteIdActivo) return;
    setError(null);
    setAviso(null);
    try {
      await apiWeb.verificarCallCenter(token, {
        pacienteId: pacienteIdActivo,
        fechaNacimiento: fechaNacVerif,
        ultimosDigitosTelefono: ultimos4Verif,
      });
      setVerificadoCallCenter(true);
      setAviso('Identidad del paciente verificada en Call Center por 30 minutos.');
      void queryClient.invalidateQueries({ queryKey: ['timeline'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verificación fallida');
    }
  };

  const confirmarCitaDesdeConsola = async () => {
    if (!contexto) return;
    setError(null);
    setAviso(null);
    try {
      if (contexto.estado === 'pausado') {
        await apiWeb.retomarTramite(token, contexto.tramiteId, 'call_center');
      }
      if (contexto.estado === 'seleccion_clinica' || contexto.estado === 'pausado') {
        await apiWeb.avanzarTramite(token, contexto.tramiteId, {
          estadoDestino: 'cita_agendada',
          canal: 'call_center',
          fechaHora: contexto.contexto.fechaTentativa ?? '2026-11-26T09:00:00Z',
        });
      }
      await apiWeb.avanzarTramite(token, contexto.tramiteId, {
        estadoDestino: 'cita_confirmada',
        canal: 'call_center',
      });
      setAviso(`Cita confirmada para el folio ${contexto.folio} sin pedir datos repetidos.`);
      void queryClient.invalidateQueries({ queryKey: ['contexto'] });
      void queryClient.invalidateQueries({ queryKey: ['timeline'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo confirmar la cita');
    }
  };

  const guardarLlamada = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pacienteIdActivo) return;
    setError(null);
    try {
      await apiWeb.registrarLlamada(token, {
        pacienteId: pacienteIdActivo,
        tramiteId: contexto?.tramiteId ?? null,
        motivo: motivoLlamada,
        notas: notasLlamada,
        resultado: resultadoLlamada,
        duracionSegundos: 180,
      });
      setMostrarLlamada(false);
      setAviso('Llamada registrada en el canal call_center y agregada al timeline.');
      void queryClient.invalidateQueries({ queryKey: ['timeline'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar llamada');
    }
  };

  const enviarCorreoSimulado = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await apiWeb.simularCorreoEntrante({
        remitente: correoRemitente,
        asunto: correoAsunto,
        cuerpo: correoCuerpo,
        region: regionFiltro || 'Puebla',
      });
      setMostrarCorreo(false);
      setAviso(
        `Correo procesado (${res.ticket.folio}). Acuse automático enviado: "${res.acuseAutomatico.asunto}"`,
      );
      void queryClient.invalidateQueries({ queryKey: ['tickets'] });
      void queryClient.invalidateQueries({ queryKey: ['timeline'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al simular correo');
    }
  };

  return (
    <div>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
          marginBottom: '1rem',
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>Consola de Call Center / Asesor</h1>
          <p className="sd-muted" style={{ margin: '0.2rem 0 0' }}>
            Atajos: <code>Alt+B</code> buscar · <code>Alt+L</code> registrar llamada ·{' '}
            <code>Alt+E</code> simular correo
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="sd-btn-primary"
            onClick={() => setMostrarLlamada((v) => !v)}
          >
            📞 Registrar llamada
          </button>
          <button
            type="button"
            className="sd-btn-secondary"
            onClick={() => setMostrarCorreo((v) => !v)}
          >
            ✉️ Simular correo entrante
          </button>
        </div>
      </header>

      {aviso && (
        <div className="sd-banner-pendiente" role="status" aria-live="polite">
          {aviso}
        </div>
      )}
      {error && (
        <div className="sd-alert-error" role="alert">
          {error}
        </div>
      )}

      <div className="sd-console-grid">
        {/* PANEL IZQUIERDO: Búsqueda de paciente y cola de tickets */}
        <aside aria-label="Búsqueda y cola de tickets">
          <section className="sd-card">
            <h2 style={{ marginTop: 0, fontSize: '1rem' }}>Buscar paciente</h2>
            <div className="sd-field">
              <input
                ref={inputBusquedaRef}
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Teléfono, nombre o folio SD-2026-..."
                aria-label="Buscar paciente por teléfono, nombre o folio"
              />
            </div>
            {(pacientesData?.pacientes ?? []).map((p) => (
              <button
                key={p.id}
                type="button"
                className="sd-btn-secondary"
                style={{
                  width: '100%',
                  justifyContent: 'space-between',
                  marginBottom: '0.4rem',
                  borderColor: p.id === pacienteIdActivo ? 'var(--sd-primary)' : undefined,
                }}
                onClick={() => {
                  setPacienteSeleccionado(p);
                  setVerificadoCallCenter(false);
                }}
              >
                <span>
                  {p.nombre} {p.apellidos}
                </span>
                <span className="sd-muted">{p.telefonoE164}</span>
              </button>
            ))}
          </section>

          <section className="sd-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: '1rem' }}>Cola de tickets</h2>
              <select
                value={regionFiltro}
                onChange={(e) => setRegionFiltro(e.target.value)}
                aria-label="Filtrar tickets por región"
              >
                <option value="">Todas</option>
                <option value="Puebla">Puebla</option>
                <option value="CDMX">CDMX</option>
                <option value="Monterrey">Monterrey</option>
              </select>
            </div>
            <div
              style={{
                marginTop: '0.75rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}
            >
              {(ticketsData?.tickets ?? []).length === 0 && (
                <p className="sd-muted">Sin tickets abiertos en esta región.</p>
              )}
              {(ticketsData?.tickets ?? []).map((tk) => (
                <div
                  key={tk.id}
                  className="sd-card"
                  style={{ marginBottom: 0, padding: '0.75rem' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <strong>{tk.folio}</strong>
                    <span className="sd-badge">{tk.prioridad}</span>
                  </div>
                  <p className="sd-muted" style={{ margin: '0.25rem 0' }}>
                    {tk.tipo} · {tk.canalOrigen} · {tk.estatus}
                  </p>
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="sd-btn-secondary"
                      onClick={async () => {
                        await apiWeb.resolverTicket(
                          token,
                          tk.id,
                          'Atendido desde consola del asesor',
                        );
                        void queryClient.invalidateQueries({ queryKey: ['tickets'] });
                        setAviso(`Ticket ${tk.folio} resuelto.`);
                      }}
                    >
                      Resolver
                    </button>
                    <button
                      type="button"
                      className="sd-btn-ghost"
                      onClick={async () => {
                        await apiWeb.escalarTicket(token, tk.id, 'Escalado a segundo nivel');
                        void queryClient.invalidateQueries({ queryKey: ['tickets'] });
                        setAviso(`Ticket ${tk.folio} escalado a asesor_pro.`);
                      }}
                    >
                      Escalar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>

        {/* PANEL CENTRAL: Ficha enmascarada, verificación Call Center, contexto y acciones */}
        <section aria-label="Ficha y acciones del paciente">
          <div className="sd-card">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.5rem',
              }}
            >
              <h2 style={{ margin: 0 }}>
                {ficha ? `${ficha.nombre} ${ficha.apellidos}` : 'Selecciona un paciente'}
              </h2>
              {contexto && (
                <span className="sd-badge">Canal actual: {contexto.contexto.ultimoCanal}</span>
              )}
            </div>

            {ficha && (
              <dl
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                  gap: '0.5rem',
                  marginTop: '0.75rem',
                }}
              >
                <div>
                  <dt className="sd-muted">CURP (enmascarada #10)</dt>
                  <dd style={{ margin: 0, fontWeight: 600 }}>{ficha.curp ?? '—'}</dd>
                </div>
                <div>
                  <dt className="sd-muted">Teléfono</dt>
                  <dd style={{ margin: 0, fontWeight: 600 }}>{ficha.telefonoE164 ?? '—'}</dd>
                </div>
                <div>
                  <dt className="sd-muted">Correo</dt>
                  <dd style={{ margin: 0, fontWeight: 600 }}>{ficha.email ?? '—'}</dd>
                </div>
                <div>
                  <dt className="sd-muted">Región</dt>
                  <dd style={{ margin: 0, fontWeight: 600 }}>{ficha.region ?? '—'}</dd>
                </div>
              </dl>
            )}

            {/* Verificación por preguntas de seguridad antes de mostrar/operar datos completos (#8, #19) */}
            {ficha && !verificadoCallCenter && (
              <div className="sd-alert-warn" style={{ marginTop: '0.75rem' }}>
                <strong>Verificación de seguridad (Call Center · #8)</strong>
                <p style={{ margin: '0.25rem 0 0.5rem' }}>
                  Valida fecha de nacimiento y últimos 4 dígitos del teléfono antes de concluir
                  acciones.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <input
                    value={fechaNacVerif}
                    onChange={(e) => setFechaNacVerif(e.target.value)}
                    placeholder="YYYY-MM-DD"
                    aria-label="Fecha de nacimiento"
                  />
                  <input
                    value={ultimos4Verif}
                    onChange={(e) => setUltimos4Verif(e.target.value)}
                    placeholder="Últimos 4 dígitos"
                    aria-label="Últimos 4 dígitos del teléfono"
                  />
                  <button
                    type="button"
                    className="sd-btn-primary"
                    onClick={() => void verificarIdentidadCallCenter()}
                  >
                    Verificar paciente
                  </button>
                </div>
              </div>
            )}

            {/* Contexto acumulado del trámite */}
            <div style={{ marginTop: '1rem' }}>
              <h3 style={{ marginBottom: '0.35rem' }}>Contexto acumulado del trámite</h3>
              {contexto ? (
                <div className="sd-card" style={{ background: '#f8fafc', marginBottom: 0 }}>
                  <p style={{ margin: '0 0 0.35rem' }}>
                    <strong>{contexto.folio}</strong> ·{' '}
                    <span className="sd-badge">{contexto.estado}</span>
                  </p>
                  <p style={{ margin: '0 0 0.5rem' }}>{contexto.resumen}</p>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="sd-btn-primary"
                      disabled={!verificadoCallCenter}
                      onClick={() => void confirmarCitaDesdeConsola()}
                    >
                      Confirmar cita sin repetir datos
                    </button>
                    {ficha && (
                      <button
                        type="button"
                        className="sd-btn-secondary"
                        onClick={async () => {
                          const r = await apiWeb.asistirRecuperacion(token, ficha.id, 'email');
                          setAviso(r.mensaje);
                        }}
                      >
                        Enviar enlace de recuperación (#9)
                      </button>
                    )}
                  </div>
                </div>
              ) : null}
              {contexto && pacienteIdActivo && usuario ? (
                <PanelCrm
                  token={token}
                  pacienteId={pacienteIdActivo}
                  tramiteId={contexto.tramiteId}
                  folio={contexto.folio}
                  estado={contexto.estado}
                  contexto={contexto.contexto}
                  timeline={timeline?.items ?? []}
                  usuarioId={usuario.id}
                  onAviso={(t) => {
                    setError(null);
                    setAviso(t);
                  }}
                  onError={(t) => {
                    setAviso(null);
                    setError(t);
                  }}
                />
              ) : !contexto ? (
                <p className="sd-muted">Este paciente no tiene un trámite activo todavía.</p>
              ) : null}
            </div>
          </div>

          {mostrarLlamada && (
            <form className="sd-card" onSubmit={(e) => void guardarLlamada(e)}>
              <h3 style={{ marginTop: 0 }}>Registrar llamada entrante (canal call_center)</h3>
              <div className="sd-field">
                <label htmlFor="motivo-llamada">Motivo</label>
                <input
                  id="motivo-llamada"
                  value={motivoLlamada}
                  onChange={(e) => setMotivoLlamada(e.target.value)}
                  required
                />
              </div>
              <div className="sd-field">
                <label htmlFor="notas-llamada">Notas</label>
                <textarea
                  id="notas-llamada"
                  rows={2}
                  value={notasLlamada}
                  onChange={(e) => setNotasLlamada(e.target.value)}
                  required
                />
              </div>
              <div className="sd-field">
                <label htmlFor="resultado-llamada">Resultado</label>
                <input
                  id="resultado-llamada"
                  value={resultadoLlamada}
                  onChange={(e) => setResultadoLlamada(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="sd-btn-primary">
                Guardar interacción de llamada
              </button>
            </form>
          )}

          {mostrarCorreo && (
            <form className="sd-card" onSubmit={(e) => void enviarCorreoSimulado(e)}>
              <h3 style={{ marginTop: 0 }}>Simular correo entrante (#23)</h3>
              <div className="sd-field">
                <label htmlFor="correo-remitente">Remitente</label>
                <input
                  id="correo-remitente"
                  type="email"
                  value={correoRemitente}
                  onChange={(e) => setCorreoRemitente(e.target.value)}
                  required
                />
              </div>
              <div className="sd-field">
                <label htmlFor="correo-asunto">Asunto</label>
                <input
                  id="correo-asunto"
                  value={correoAsunto}
                  onChange={(e) => setCorreoAsunto(e.target.value)}
                  required
                />
              </div>
              <div className="sd-field">
                <label htmlFor="correo-cuerpo">Cuerpo</label>
                <textarea
                  id="correo-cuerpo"
                  rows={2}
                  value={correoCuerpo}
                  onChange={(e) => setCorreoCuerpo(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="sd-btn-primary">
                Procesar correo y enviar acuse
              </button>
            </form>
          )}
        </section>

        {/* PANEL DERECHO: Resumen IA + Timeline en vivo */}
        <aside aria-label="Resumen IA y línea de tiempo en vivo">
          <section className="sd-card">
            <h2 style={{ marginTop: 0, fontSize: '1rem' }}>Resumen previo (IA / Contexto)</h2>
            <p className="sd-muted" style={{ margin: 0 }}>
              {ticketDelPaciente?.resumenIa ??
                contexto?.resumen ??
                'Sin resumen conversacional previo.'}
            </p>
          </section>

          <section className="sd-card">
            <h2 style={{ marginTop: 0, fontSize: '1rem' }}>Timeline en vivo</h2>
            <TimelinePanel items={timeline?.items ?? []} />
          </section>
        </aside>
      </div>
    </div>
  );
}
