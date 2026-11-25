'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiWeb } from '../../lib/api';
import { useAppWeb } from '../../lib/providers';

export default function ResultadosPage() {
  const { t, token, usuario } = useAppWeb();
  const queryClient = useQueryClient();
  const [resultadoChatId, setResultadoChatId] = useState<string | null>(null);
  const [pregunta, setPregunta] = useState('');

  const { data } = useQuery({
    queryKey: ['resultados', usuario?.id],
    queryFn: () => apiWeb.listarResultados(token!),
    enabled: Boolean(token && usuario),
  });

  const { data: hilo } = useQuery({
    queryKey: ['resultados', 'mensajes', resultadoChatId],
    queryFn: () => apiWeb.listarMensajesResultado(token!, resultadoChatId!),
    enabled: Boolean(token && resultadoChatId),
  });

  const descargarPdf = async (id: string) => {
    if (!token) return;
    const blob = await apiWeb.descargarResultadoPdfBlob(token, id);
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const enviarPregunta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !resultadoChatId || !pregunta.trim()) return;
    await apiWeb.enviarMensajeResultado(token, resultadoChatId, pregunta.trim());
    setPregunta('');
    await queryClient.invalidateQueries({ queryKey: ['resultados', 'mensajes', resultadoChatId] });
  };

  return (
    <div>
      <section className="sd-card">
        <h1 style={{ marginTop: 0 }}>{t.resultados.titulo}</h1>
        <p className="sd-muted">{t.resultados.subtitulo}</p>

        {!usuario && (
          <Link href="/login" className="sd-btn-primary">
            {t.app.nav.iniciarSesion}
          </Link>
        )}

        {usuario && (data?.resultados ?? []).length === 0 && (
          <div className="sd-alert-warn" role="status">
            {t.resultados.sinResultados}
          </div>
        )}
      </section>

      <div className="sd-grid">
        {(data?.resultados ?? []).map((r) => (
          <article key={r.id} className="sd-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>{r.estudioNombre}</strong>
              <span className="sd-badge">{r.estado}</span>
            </div>
            <p className="sd-muted">Folio: {r.folioTramite}</p>
            <p>{r.resumenClinico}</p>
            <ul>
              {r.valores.map((v) => (
                <li key={v.parametro}>
                  <strong>{v.parametro}:</strong> {v.valor} (Ref: {v.referencia})
                </li>
              ))}
            </ul>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {r.estado === 'liberado' && (
                <button
                  type="button"
                  className="sd-btn-primary"
                  onClick={() => void descargarPdf(r.id)}
                >
                  Descargar PDF
                </button>
              )}
              <button
                type="button"
                className="sd-btn-secondary"
                onClick={() => setResultadoChatId(r.id)}
              >
                Preguntar al médico
              </button>
            </div>
          </article>
        ))}
      </div>

      {resultadoChatId && (
        <section className="sd-card">
          <h2 style={{ marginTop: 0 }}>Mensajes con el médico</h2>
          <p className="sd-muted">
            Tiempo esperado de respuesta: ~{hilo?.tiempoEsperadoRespuestaMinutos ?? 30} minutos.
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
                className={`sd-chat-bubble ${m.emisorRol === 'paciente' ? 'sd-chat-usuario' : 'sd-chat-bot'}`}
              >
                <strong>{m.emisorNombre}:</strong> {m.contenido}
              </div>
            ))}
          </div>
          <form onSubmit={(e) => void enviarPregunta(e)} style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              value={pregunta}
              onChange={(e) => setPregunta(e.target.value)}
              placeholder="Escribe tu duda sobre este resultado..."
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
