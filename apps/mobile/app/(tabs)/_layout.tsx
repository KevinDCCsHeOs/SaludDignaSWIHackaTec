import { Tabs } from 'expo-router';
import { useMobileSession } from '../../src/lib/session-context';

export default function TabsLayout() {
  const { paleta, t } = useMobileSession();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: paleta.primario,
        tabBarStyle: { backgroundColor: paleta.superficie, borderTopColor: paleta.borde },
        headerStyle: { backgroundColor: paleta.superficie },
        headerTintColor: paleta.texto,
      }}
    >
      <Tabs.Screen name="index" options={{ title: t.tabs.inicio }} />
      <Tabs.Screen name="mis-tramites" options={{ title: t.tabs.misTramites }} />
      <Tabs.Screen name="citas" options={{ title: t.tabs.citas }} />
      <Tabs.Screen name="resultados" options={{ title: t.tabs.resultados }} />
      <Tabs.Screen name="ayuda" options={{ title: t.tabs.ayuda }} />
    </Tabs>
  );
}
