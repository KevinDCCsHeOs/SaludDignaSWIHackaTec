import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { obtenerTextosMobile } from '../i18n';
import { EscalaFuente, FACTOR_FUENTE, obtenerPaleta } from '../theme/theme';
import { apiMobile, TramiteMobileDto } from './api';
import { registrarNotificacionesPush } from './notifications';
import {
  borrarSesionSegura,
  guardarCacheOffline,
  guardarSesionSegura,
  leerCacheOffline,
  leerSesionSegura,
  SesionGuardadaMobile,
} from './storage';

interface ContextoMobile {
  sesion: SesionGuardadaMobile | null;
  tramites: TramiteMobileDto[];
  sinConexion: boolean;
  pushToken: string | null;
  escalaFuente: EscalaFuente;
  factorFuente: number;
  paleta: ReturnType<typeof obtenerPaleta>;
  t: ReturnType<typeof obtenerTextosMobile>;
  iniciarSesion: (email: string, contrasena: string) => Promise<void>;
  cerrarSesion: () => Promise<void>;
  recargarTramites: () => Promise<void>;
  cambiarEscalaFuente: (escala: EscalaFuente) => void;
}

const SessionContext = createContext<ContextoMobile | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const esquema = useColorScheme();
  const [sesion, setSesion] = useState<SesionGuardadaMobile | null>(null);
  const [tramites, setTramites] = useState<TramiteMobileDto[]>([]);
  const [sinConexion, setSinConexion] = useState(false);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [escalaFuente, setEscalaFuente] = useState<EscalaFuente>('normal');

  const recargarTramitesConSesion = useCallback(async (s: SesionGuardadaMobile) => {
    if (!s.usuario.pacienteId) return;
    try {
      const res = await apiMobile.listarTramites(s.accessToken, s.usuario.pacienteId);
      setTramites(res.tramites);
      setSinConexion(false);
      await guardarCacheOffline(res.tramites);
    } catch {
      const enCache = await leerCacheOffline<TramiteMobileDto[]>();
      if (enCache) setTramites(enCache);
      setSinConexion(true);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const guardada = await leerSesionSegura();
      if (guardada) {
        setSesion(guardada);
        await recargarTramitesConSesion(guardada);
      }
    })();
  }, [recargarTramitesConSesion]);

  const iniciarSesion = async (email: string, contrasena: string) => {
    const res = await apiMobile.login(email, contrasena);
    const nueva: SesionGuardadaMobile = {
      accessToken: res.accessToken,
      refreshToken: res.refreshToken,
      usuario: res.usuario,
    };
    await guardarSesionSegura(nueva);
    setSesion(nueva);
    await recargarTramitesConSesion(nueva);
    if (res.usuario.pacienteId) {
      const pToken = await registrarNotificacionesPush(res.accessToken, res.usuario.pacienteId);
      setPushToken(pToken);
    }
  };

  const cerrarSesion = async () => {
    await borrarSesionSegura();
    setSesion(null);
    setTramites([]);
  };

  const recargarTramites = async () => {
    if (sesion) await recargarTramitesConSesion(sesion);
  };

  return (
    <SessionContext.Provider
      value={{
        sesion,
        tramites,
        sinConexion,
        pushToken,
        escalaFuente,
        factorFuente: FACTOR_FUENTE[escalaFuente],
        paleta: obtenerPaleta(esquema === 'dark'),
        t: obtenerTextosMobile('es'),
        iniciarSesion,
        cerrarSesion,
        recargarTramites,
        cambiarEscalaFuente: setEscalaFuente,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useMobileSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useMobileSession debe usarse dentro de SessionProvider');
  return ctx;
}
