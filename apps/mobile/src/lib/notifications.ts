import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { apiMobile } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Solicita permiso de notificaciones push (Expo Notifications) y registra el `expoPushToken`
 * del paciente en `apps/api` (`POST /canales/push-tokens`, #22).
 */
export async function registrarNotificacionesPush(
  tokenJwt: string,
  pacienteId: string,
): Promise<string | null> {
  try {
    const permisosActuales = await Notifications.getPermissionsAsync();
    let estatus = permisosActuales.status;
    if (estatus !== 'granted') {
      const solicitado = await Notifications.requestPermissionsAsync();
      estatus = solicitado.status;
    }
    if (estatus !== 'granted') return null;

    const pushToken = (await Notifications.getExpoPushTokenAsync()).data;
    const plataforma = Platform.OS === 'ios' ? 'ios' : 'android';
    await apiMobile.registrarPushToken(tokenJwt, {
      pacienteId,
      expoPushToken: pushToken,
      plataforma,
    });
    return pushToken;
  } catch {
    return null;
  }
}
