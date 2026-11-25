import type { Metadata } from 'next';
import './globals.css';
import { ChatWidgetLazy } from '../components/ChatWidgetLazy';
import { Navbar } from '../components/Navbar';
import { Providers } from '../lib/providers';

export const metadata: Metadata = {
  title: 'Salud Digna Omnicanal — Portal y Consola',
  description: 'Un paciente, una sola conversación (Web, WhatsApp, Call Center y App).',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
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
