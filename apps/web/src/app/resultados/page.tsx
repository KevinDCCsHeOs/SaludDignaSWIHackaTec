'use client';

import { useAppWeb } from '../../lib/providers';

export default function ResultadosPage() {
  const { t } = useAppWeb();

  return (
    <section className="sd-card">
      <h1 style={{ marginTop: 0 }}>{t.resultados.titulo}</h1>
      <p className="sd-muted">{t.resultados.subtitulo}</p>
      <div className="sd-alert-warn" role="status">
        {t.resultados.sinResultados}
      </div>
    </section>
  );
}
