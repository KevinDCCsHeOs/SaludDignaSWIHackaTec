import type { Metadata } from 'next';
import { Nunito_Sans } from 'next/font/google';
import './globals.css';
import { ChatWidgetLazy } from '../components/ChatWidgetLazy';
import { Navbar } from '../components/Navbar';
import { Providers } from '../lib/providers';

// Tipografía del traspaso v2 (sección 11); se descarga en la compilación y se sirve desde el sitio
const nunito = Nunito_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--sd-fuente',
});

export const metadata: Metadata = {
  title: 'Salud Digna Omnicanal — Portal y Consola',
  description: 'Un paciente, una sola conversación (Web, WhatsApp, Call Center y App).',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={nunito.variable}>
      <body>
        <Providers>
          <Navbar />
          <main id="contenido-principal" className="sd-main">
            {children}
          </main>
          <ChatWidgetLazy />
        </Providers>
      </body>
    </html>
  );
}
