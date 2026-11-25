'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { rutaInicioPorRol } from '../../lib/navegacion-rol';
import { useAppWeb } from '../../lib/providers';

export default function LoginPage() {
  const { t, iniciarSesion } = useAppWeb();
  const router = useRouter();
  const [email, setEmail] = useState('ana.lopez@demo.saluddigna.local');
  const [contrasena, setContrasena] = useState('DemoPaciente2026!');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const entrar = async (correo: string, clave: string) => {
    setError(null);
    setCargando(true);
    try {
      const usr = await iniciarSesion(correo, clave);
      router.push(rutaInicioPorRol(usr.rol));
    } catch (err) {
      setError(err instanceof Error ? err.message : t.estados.errorGenerico);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div style={{ maxWidth: 480, margin: '0 auto' }}>
      <section className="sd-card">
        <h1 style={{ marginTop: 0 }}>{t.login.titulo}</h1>
        <p className="sd-muted">{t.login.subtitulo}</p>

        {error && (
          <div className="sd-alert-error" role="alert">
            {error}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void entrar(email, contrasena);
          }}
        >
          <div className="sd-field">
            <label htmlFor="email">{t.login.email}</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="sd-field">
            <label htmlFor="contrasena">{t.login.contrasena}</label>
            <input
              id="contrasena"
              type="password"
              required
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
            />
          </div>
          <button type="submit" className="sd-btn-primary" disabled={cargando}>
            {cargando ? t.login.cargando : t.login.entrar}
          </button>
        </form>

        <hr style={{ margin: '1.25rem 0', borderColor: 'var(--sd-border)' }} />
        <p className="sd-muted" style={{ marginTop: 0 }}>
          {t.login.accesosRapidos}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <button
            type="button"
            className="sd-btn-secondary"
            onClick={() => void entrar('ana.lopez@demo.saluddigna.local', 'DemoPaciente2026!')}
          >
            {t.login.comoAna}
          </button>
          <button
            type="button"
            className="sd-btn-secondary"
            onClick={() => void entrar('asesor.puebla@demo.saluddigna.local', 'DemoAsesor2026!')}
          >
            {t.login.comoAsesor}
          </button>
          <button
            type="button"
            className="sd-btn-secondary"
            onClick={() => void entrar('admin@demo.saluddigna.local', 'DemoAdmin2026!')}
          >
            {t.login.comoAdmin}
          </button>
          <button
            type="button"
            className="sd-btn-secondary"
            onClick={() => void entrar('medico.puebla@demo.saluddigna.local', 'DemoMedico2026!')}
          >
            Entrar como Dr. Javier (Médico)
          </button>
          <button
            type="button"
            className="sd-btn-secondary"
            onClick={() => void entrar('revisor.lab@demo.saluddigna.local', 'DemoRevisor2026!')}
          >
            Entrar como QFB Sofía (Revisor técnico)
          </button>
        </div>
      </section>
    </div>
  );
}
