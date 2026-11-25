'use client';

import Link from 'next/link';
import { rutaInicioPorRol } from '../../lib/navegacion-rol';
import { useAppWeb } from '../../lib/providers';

export default function AccesoDenegadoPage() {
  const { usuario } = useAppWeb();
  const inicio = usuario ? rutaInicioPorRol(usuario.rol) : '/';

  return (
    <section
      className="sd-card"
      style={{ maxWidth: 560, margin: '2rem auto', textAlign: 'center' }}
    >
      <span className="sd-badge">403 · Acceso restringido</span>
      <h1>No tienes permisos para esta vista</h1>
      <p className="sd-muted">
        Tu sesión actual{usuario ? ` (${usuario.rol})` : ''} solo tiene acceso a las herramientas y
        datos autorizados para tu rol conforme a la matriz RBAC de Salud Digna Omnicanal.
      </p>
      <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', marginTop: '1rem' }}>
        <Link href={inicio} className="sd-btn-primary">
          Ir a mi panel
        </Link>
        <Link href="/login" className="sd-btn-secondary">
          Cambiar de cuenta demo
        </Link>
      </div>
    </section>
  );
}
