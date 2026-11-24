'use client';

import { useState } from 'react';
import { useAppWeb } from '../lib/providers';
import { apiWeb } from '../lib/api';

interface MensajeChat {
  emisor: 'bot' | 'usuario';
  texto: string;
}

const REGEX_ALARMA = /(dolor de pecho|no puedo respirar|sangrado intenso|desmayo|infarto)/i;

export function ChatWidget() {
  const { t, token, usuario } = useAppWeb();
  const [abierto, setAbierto] = useState(false);
  const [entrada, setEntrada] = useState('');
  const [mensajes, setMensajes] = useState<MensajeChat[]>([
    { emisor: 'bot', texto: t.chat.bienvenida },
  ]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const texto = entrada.trim();
    if (!texto) return;
    setEntrada('');
    setMensajes((prev) => [...prev, { emisor: 'usuario', texto }]);

    if (REGEX_ALARMA.test(texto)) {
      setMensajes((prev) => [...prev, { emisor: 'bot', texto: t.chat.respuestaUrgencia }]);
      return;
    }

    if (/asesor|humano/i.test(texto) && token && usuario?.pacienteId) {
      try {
        const ticket = await apiWeb.crearTicket(token, {
          pacienteId: usuario.pacienteId,
          canalOrigen: 'web',
          tipo: 'duda',
          region: usuario.region ?? 'Puebla',
          resumenIa: `Solicitud de asesor desde chat web: ${texto.slice(0, 120)}`,
        });
        setMensajes((prev) => [
          ...prev,
          {
            emisor: 'bot',
            texto: `Abrimos tu ticket ${ticket.folio} para un asesor humano sin que repitas tus datos.`,
          },
        ]);
        return;
      } catch {
        // Fallback amigable
      }
    }

    setMensajes((prev) => [...prev, { emisor: 'bot', texto: t.chat.respuestaDefault }]);
  };

  return (
    <div className="sd-chat-widget">
      {abierto && (
        <section className="sd-chat-panel" aria-label={t.chat.titulo}>
          <header className="sd-chat-header">
            <strong>{t.chat.titulo}</strong>
            <button
              type="button"
              className="sd-btn-ghost"
              onClick={() => setAbierto(false)}
              aria-label="Cerrar asistente"
            >
              ✕
            </button>
          </header>
          <div className="sd-chat-messages" role="log" aria-live="polite">
            {mensajes.map((m, idx) => (
              <div key={idx} className={`sd-chat-bubble sd-chat-${m.emisor}`}>
                {m.texto}
              </div>
            ))}
          </div>
          <form className="sd-chat-form" onSubmit={(e) => void enviar(e)}>
            <input
              value={entrada}
              onChange={(e) => setEntrada(e.target.value)}
              placeholder={t.chat.placeholder}
              aria-label={t.chat.placeholder}
            />
            <button type="submit" className="sd-btn-primary">
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
