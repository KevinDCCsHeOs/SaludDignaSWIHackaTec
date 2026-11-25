'use client';

import Link from 'next/link';
import { construirMenuPorRol } from '../lib/navegacion-rol';
import { useAppWeb } from '../lib/providers';

export function Navbar() {
  const { usuario, locale, t, cerrarSesion, cambiarIdioma } = useAppWeb();
  const menu = construirMenuPorRol(usuario?.rol, usuario?.permisos);

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
          {menu.map((item) => (
            <Link key={item.href} href={item.href}>
              {t.app.nav[item.claveNav]}
            </Link>
          ))}
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
