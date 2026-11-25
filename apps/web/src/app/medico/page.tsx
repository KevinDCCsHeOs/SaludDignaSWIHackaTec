'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EstadisticasRolWidget } from '../../components/EstadisticasRolWidget';
import { apiWeb } from '../../lib/api';
import { useAppWeb } from '../../lib/providers';

export default function VistaMedicoPage() {
  const { token, usuario } = useAppWeb();
  const queryClient = useQueryClient();
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);
  const [mensajeTexto, setMensajeTexto] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);

  const autorizado = usuario && (usuario.rol === 'medico' || usuario.rol === 'admin');

  const { data } = useQuery({
    queryKey: ['resultados', 'medico'],
    queryFn: () => apiWeb.listarResultados(token!),
    enabled: Boolean(token && autorizado),
  });

  const { data: hilo } = useQuery({
    queryKey: ['resultados', 'mensajes', seleccionadoId],
    queryFn: () => apiWeb.listarMensajesResultado(token!, seleccionadoId!),
    enabled: Boolean(token && seleccionadoId),
  });

  const validar = async (id: string) => {
    if (!token) return;
    await apiWeb.validarResultado(token, id, { aprobado: true });
    setAviso(`Resultado ${id} validado médicamente. Ahora puedes liberarlo al paciente.`);
    await queryClient.invalidateQueries({ queryKey: ['resultados'] });
    await queryClient.invalidateQueries({ queryKey: ['estadisticas'] });
  };

  const liberar = async (id: string) => {
    if (!token) return;
    const res = await apiWeb.liberarResultado(token, id);
    setAviso(
      `Resultado ${id} liberado con PDF generado. Notificación enviada por ${res.canalNotificacion}.`,
    );
    await queryClient.invalidateQueries({ queryKey: ['resultados'] });
    await queryClient.invalidateQueries({ queryKey: ['estadisticas'] });
  };

  const enviarMensaje = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !seleccionadoId || !mensajeTexto.trim()) return;
    await apiWeb.enviarMensajeResultado(token, seleccionadoId, mensajeTexto.trim());
    setMensajeTexto('');
    await queryClient.invalidateQueries({ queryKey: ['resultados', 'mensajes', seleccionadoId] });
  };

  if (!usuario || !autorizado) {
    return (
      <section className="sd-card">
        <h1>Vista médica</h1>
        <p className="sd-muted">
          Inicia sesión con una cuenta de médico para validar y liberar resultados.
        </p>
        <Link href="/login" className="sd-btn-primary">
          Iniciar sesión
        </Link>
      </section>
    );
  }

  return (
    <div>
      <h1>Vista médica y liberación de resultados</h1>
      <p className="sd-muted">
        Jerarquía oficial: captura → revisión técnica → validación médica → liberación con
        notificación y PDF.
      </p>

      <EstadisticasRolWidget />

      {aviso && (
        <div className="sd-banner-pendiente" role="status">
          {aviso}
        </div>
      )}

      <div className="sd-grid">
        {(data?.resultados ?? []).map((r) => (
          <article key={r.id} className="sd-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>{r.estudioNombre}</strong>
              <span className="sd-badge">{r.estado}</span>
            </div>
            <p className="sd-muted">
              Folio: {r.folioTramite} · Paciente: {r.pacienteId}
            </p>
            <p>{r.resumenClinico}</p>
            <ul>
              {r.valores.map((v) => (
                <li key={v.parametro}>
                  <strong>{v.parametro}:</strong> {v.valor} (Ref: {v.referencia})
                </li>
              ))}
            </ul>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {usuario.rol === 'medico' && r.estado === 'revision_tecnica' && (
                <button type="button" className="sd-btn-primary" onClick={() => void validar(r.id)}>
                  Validar médicamente
                </button>
              )}
              {usuario.rol === 'medico' && r.estado === 'validacion_medica' && (
                <button type="button" className="sd-btn-primary" onClick={() => void liberar(r.id)}>
                  Liberar al paciente y generar PDF
                </button>
              )}
              <button
                type="button"
                className="sd-btn-secondary"
                onClick={() => setSeleccionadoId(r.id)}
              >
                Mensajes con paciente
              </button>
            </div>
          </article>
        ))}
      </div>

      {seleccionadoId && (
        <section className="sd-card">
          <h2 style={{ marginTop: 0 }}>Comunicación rápida paciente ↔ médico ({seleccionadoId})</h2>
          <p className="sd-muted">
            Tiempo esperado de respuesta al paciente: {hilo?.tiempoEsperadoRespuestaMinutos ?? 30}{' '}
            min.
          </p>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              marginBottom: '0.75rem',
            }}
          >
            {(hilo?.mensajes ?? []).map((m) => (
              <div
                key={m.id}
                className={`sd-chat-bubble ${m.emisorRol === 'medico' ? 'sd-chat-usuario' : 'sd-chat-bot'}`}
              >
                <strong>{m.emisorNombre}:</strong> {m.contenido}
              </div>
            ))}
            {(hilo?.mensajes ?? []).length === 0 && (
              <p className="sd-muted">Sin mensajes en este resultado aún.</p>
            )}
          </div>
          <form onSubmit={(e) => void enviarMensaje(e)} style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              value={mensajeTexto}
              onChange={(e) => setMensajeTexto(e.target.value)}
              placeholder="Escribe una orientación para el paciente..."
              style={{
                flex: 1,
                padding: '0.55rem',
                borderRadius: 8,
                border: '1px solid var(--sd-border)',
              }}
            />
            <button type="submit" className="sd-btn-primary">
              Enviar
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
