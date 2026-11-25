'use client';

import { useState } from 'react';
import { apiWeb } from '../lib/api';
import { useAppWeb } from '../lib/providers';

interface MensajeChat {
  emisor: 'bot' | 'usuario';
  texto: string;
  mostrarMenu?: boolean;
}

const REGEX_ALARMA =
  /(dolor de pecho|chest pain|no puedo respirar|can't breathe|sangrado intenso|desmayo|infarto)/i;

export function ChatWidget() {
  const { t, locale, token, usuario } = useAppWeb();
  const [abierto, setAbierto] = useState(false);
  const [entrada, setEntrada] = useState('');
  const [modoSencillo, setModoSencillo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [sesionId] = useState(() => `web_${Math.random().toString(36).slice(2, 10)}`);
  const [mensajes, setMensajes] = useState<MensajeChat[]>([
    { emisor: 'bot', texto: t.chat.bienvenida },
  ]);

  const consultarTexto = async (texto: string) => {
    const limpio = texto.trim();
    if (!limpio || enviando) return;
    setEntrada('');
    setMensajes((prev) => [...prev, { emisor: 'usuario', texto: limpio }]);
    setEnviando(true);

    try {
      const res = await apiWeb.consultarAsistenteIa(
        {
          mensaje: limpio,
          pacienteId: usuario?.pacienteId ?? null,
          sesionId,
          idioma: locale,
          modoSencillo,
          region: usuario?.region ?? undefined,
        },
        token,
      );
      setMensajes((prev) => [
        ...prev,
        {
          emisor: 'bot',
          texto: res.respuesta,
          mostrarMenu: res.mostrarMenu,
        },
      ]);
    } catch {
      if (REGEX_ALARMA.test(limpio)) {
        setMensajes((prev) => [...prev, { emisor: 'bot', texto: t.chat.respuestaUrgencia }]);
      } else {
        setMensajes((prev) => [...prev, { emisor: 'bot', texto: t.chat.respuestaDefault }]);
      }
    } finally {
      setEnviando(false);
    }
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    await consultarTexto(entrada);
  };

  const opcionesRapidas =
    locale === 'en'
      ? [
          'Quote abdominal ultrasound',
          'My status',
          'Clinic location',
          'Explain fasting simply',
          'Talk to an advisor',
        ]
      : [
          'Cotizar ultrasonido abdominal',
          'Estatus de mi trámite',
          'Ubicación clínica',
          'Explícame fácil el ayuno',
          'Hablar con asesor',
        ];

  return (
    <div className="sd-chat-widget">
      {abierto && (
        <section className="sd-chat-panel" aria-label={t.chat.titulo}>
          <header className="sd-chat-header">
            <strong>{t.chat.titulo}</strong>
            <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
              <button
                type="button"
                className="sd-btn-ghost"
                onClick={() => setModoSencillo((v) => !v)}
                aria-pressed={modoSencillo}
                style={{ fontSize: '0.75rem', padding: '0.2rem 0.45rem' }}
              >
                {modoSencillo ? `✓ ${t.chat.modoFacil}` : t.chat.modoFacil}
              </button>
              <button
                type="button"
                className="sd-btn-ghost"
                onClick={() => setAbierto(false)}
                aria-label="Cerrar asistente"
              >
                ✕
              </button>
            </div>
          </header>
          <div className="sd-chat-messages" role="log" aria-live="polite">
            {mensajes.map((m, idx) => (
              <div key={idx} className={`sd-chat-bubble sd-chat-${m.emisor}`}>
                <div>{m.texto}</div>
                {m.mostrarMenu && (
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '0.35rem',
                      marginTop: '0.5rem',
                    }}
                  >
                    {opcionesRapidas.map((op) => (
                      <button
                        key={op}
                        type="button"
                        className="sd-btn-ghost"
                        style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                        onClick={() => void consultarTexto(op)}
                      >
                        {op}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <form className="sd-chat-form" onSubmit={(e) => void enviar(e)}>
            <input
              value={entrada}
              onChange={(e) => setEntrada(e.target.value)}
              placeholder={t.chat.placeholder}
              aria-label={t.chat.placeholder}
              disabled={enviando}
            />
            <button type="submit" className="sd-btn-primary" disabled={enviando}>
              {t.chat.enviar}
            </button>
          </form>
        </section>
      )}
      <button
        type="button"
        className="sd-chat-fab"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
      >
        💬 {t.chat.boton}
      </button>
    </div>
  );
}
