'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { crearConfigSocketCliente } from '@salud-digna/ui';
import { io, Socket } from 'socket.io-client';
import { DiccionarioWeb, LocaleWeb, obtenerDiccionario } from '../i18n';
import { apiWeb, UsuarioSesion, WS_URL } from './api';

interface ContextoAppWeb {
  token: string | null;
  usuario: UsuarioSesion | null;
  locale: LocaleWeb;
  t: DiccionarioWeb;
  ultimoEventoRt: Record<string, unknown> | null;
  suscribirPacienteRt: (pacienteId: string) => void;
  iniciarSesion: (email: string, contrasena: string) => Promise<UsuarioSesion>;
  cerrarSesion: () => void;
  cambiarIdioma: (nuevo: LocaleWeb) => void;
}

const AppWebContext = createContext<ContextoAppWeb | null>(null);
const CLAVE_STORAGE = 'sd_web_sesion_demo';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 10_000, retry: 1 } },
      }),
  );
  const [token, setToken] = useState<string | null>(null);
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(null);
  const [locale, setLocale] = useState<LocaleWeb>('es');
  const [ultimoEventoRt, setUltimoEventoRt] = useState<Record<string, unknown> | null>(null);
  const [socketActivo, setSocketActivo] = useState<Socket | null>(null);

  const guardarCookieRol = (rol: string | null) => {
    try {
      if (rol) {
        document.cookie = `sd_web_rol=${encodeURIComponent(rol)}; Path=/; SameSite=Lax`;
      } else {
        document.cookie = 'sd_web_rol=; Path=/; Max-Age=0; SameSite=Lax';
      }
    } catch {
      // No-op en entornos sin document.cookie
    }
  };

  useEffect(() => {
    try {
      const guardado = window.sessionStorage.getItem(CLAVE_STORAGE);
      if (guardado) {
        const parsed = JSON.parse(guardado) as { token: string; usuario: UsuarioSesion };
        setToken(parsed.token);
        setUsuario(parsed.usuario);
        guardarCookieRol(parsed.usuario.rol);
      }
    } catch {
      // Ignorar si sessionStorage no está disponible
    }
  }, []);

  useEffect(() => {
    if (!token) {
      setSocketActivo(null);
      return;
    }
    const cfg = crearConfigSocketCliente(WS_URL, token);
    const socket: Socket = io(cfg.url, {
      ...cfg.options,
      transports: ['websocket', 'polling'],
    });
    setSocketActivo(socket);
    socket.on('evento:omnicanal', (evento: Record<string, unknown>) => {
      setUltimoEventoRt(evento);
      void queryClient.invalidateQueries({ queryKey: ['timeline'] });
      void queryClient.invalidateQueries({ queryKey: ['tramites'] });
      void queryClient.invalidateQueries({ queryKey: ['tickets'] });
      void queryClient.invalidateQueries({ queryKey: ['contexto'] });
      void queryClient.invalidateQueries({ queryKey: ['journey'] });
      void queryClient.invalidateQueries({ queryKey: ['metricas'] });
      void queryClient.invalidateQueries({ queryKey: ['resultados'] });
      void queryClient.invalidateQueries({ queryKey: ['estadisticas'] });
    });
    return () => {
      socket.disconnect();
      setSocketActivo(null);
    };
  }, [token, queryClient]);

  const suscribirPacienteRt = (pacienteId: string) => {
    if (socketActivo && pacienteId) {
      socketActivo.emit('suscribir:paciente', pacienteId);
    }
  };

  const iniciarSesion = async (email: string, contrasena: string) => {
    const res = await apiWeb.login(email, contrasena);
    setToken(res.accessToken);
    setUsuario(res.usuario);
    guardarCookieRol(res.usuario.rol);
    try {
      window.sessionStorage.setItem(
        CLAVE_STORAGE,
        JSON.stringify({ token: res.accessToken, usuario: res.usuario }),
      );
    } catch {
      // No-op
    }
    return res.usuario;
  };

  const cerrarSesion = () => {
    setToken(null);
    setUsuario(null);
    guardarCookieRol(null);
    try {
      window.sessionStorage.removeItem(CLAVE_STORAGE);
    } catch {
      // No-op
    }
  };

  const cambiarIdioma = (nuevo: LocaleWeb) => {
    setLocale(nuevo);
    if (token && usuario?.pacienteId) {
      void apiWeb.actualizarIdiomaPaciente(token, usuario.pacienteId, nuevo).catch(() => undefined);
    }
  };

  const valor = useMemo<ContextoAppWeb>(
    () => ({
      token,
      usuario,
      locale,
      t: obtenerDiccionario(locale),
      ultimoEventoRt,
      suscribirPacienteRt,
      iniciarSesion,
      cerrarSesion,
      cambiarIdioma,
    }),
    [token, usuario, locale, ultimoEventoRt, socketActivo],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AppWebContext.Provider value={valor}>{children}</AppWebContext.Provider>
    </QueryClientProvider>
  );
}

export function useAppWeb(): ContextoAppWeb {
  const ctx = useContext(AppWebContext);
  if (!ctx) throw new Error('useAppWeb debe usarse dentro de Providers');
  return ctx;
}
