import * as SecureStore from 'expo-secure-store';

const CLAVE_SESION = 'sd_mobile_sesion';
const CLAVE_CACHE_TRAMITES = 'sd_mobile_cache_tramites';

export interface SesionGuardadaMobile {
  accessToken: string;
  refreshToken: string;
  usuario: {
    id: string;
    email: string;
    nombre: string;
    rol: string;
    pacienteId: string | null;
  };
}

export async function guardarSesionSegura(sesion: SesionGuardadaMobile): Promise<void> {
  await SecureStore.setItemAsync(CLAVE_SESION, JSON.stringify(sesion));
}

export async function leerSesionSegura(): Promise<SesionGuardadaMobile | null> {
  const raw = await SecureStore.getItemAsync(CLAVE_SESION);
  return raw ? (JSON.parse(raw) as SesionGuardadaMobile) : null;
}

export async function borrarSesionSegura(): Promise<void> {
  await SecureStore.deleteItemAsync(CLAVE_SESION);
}

export async function guardarCacheOffline(datos: unknown): Promise<void> {
  await SecureStore.setItemAsync(CLAVE_CACHE_TRAMITES, JSON.stringify(datos));
}

export async function leerCacheOffline<T>(): Promise<T | null> {
  const raw = await SecureStore.getItemAsync(CLAVE_CACHE_TRAMITES);
  return raw ? (JSON.parse(raw) as T) : null;
}
