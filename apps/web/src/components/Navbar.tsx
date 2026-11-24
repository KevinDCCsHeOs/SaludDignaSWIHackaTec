'use client';

import Link from 'next/link';
import { useAppWeb } from '../lib/providers';

export function Navbar() {
  const { usuario, locale, t, cerrarSesion, cambiarIdioma } = useAppWeb();
  const puedeVerConsola =
    usuario &&
    (usuario.rol === 'asesor' || usuario.rol === 'asesor_pro' || usuario.rol === 'admin');

  return (
    <header className="sd-header">
      <a href="#contenido-principal" className="sd-skip-link">
        {t.app.saltarContenido}
      </a>
      <div className="sd-header-inner">
        <Link href="/" className="sd-brand">
          <span className="sd-brand-dot" aria-hidden="true" />
          {t.app.marca}
        </Link>

        <nav aria-label="Navegación principal" className="sd-nav">
          <Link href="/">{t.app.nav.inicio}</Link>
          <Link href="/cotizar">{t.app.nav.cotizar}</Link>
          <Link href="/mis-tramites">{t.app.nav.misTramites}</Link>
          <Link href="/resultados">{t.app.nav.resultados}</Link>
          {puedeVerConsola && <Link href="/consola">{t.app.nav.consola}</Link>}
        </nav>

        <div className="sd-header-actions">
          <button
            type="button"
            className="sd-btn-ghost"
            onClick={() => cambiarIdioma(locale === 'es' ? 'en' : 'es')}
            aria-label="Cambiar idioma"
          >
            {locale.toUpperCase()}
          </button>

          {usuario ? (
            <div className="sd-user-chip">
              <span>
                {usuario.nombre} ({usuario.rol})
              </span>
              <button type="button" className="sd-btn-secondary" onClick={cerrarSesion}>
                {t.app.nav.cerrarSesion}
              </button>
            </div>
          ) : (
            <Link href="/login" className="sd-btn-primary">
              {t.app.nav.iniciarSesion}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
