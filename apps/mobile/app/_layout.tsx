import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SessionProvider } from '../src/lib/session-context';

export default function RootLayout() {
  return (
    <SessionProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)/login" />
        <Stack.Screen name="(auth)/verificar" />
        <Stack.Screen name="tramite/[folio]" options={{ headerShown: true, title: 'Detalle' }} />
      </Stack>
    </SessionProvider>
  );
}
