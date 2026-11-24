import { Link } from 'expo-router';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useMobileSession } from '../../src/lib/session-context';
import type { EscalaFuente } from '../../src/theme/theme';

const WHATSAPP_DEMO_URL =
  'https://wa.me/522221234567?text=Hola%2C%20necesito%20ayuda%20con%20mi%20tr%C3%A1mite';

export default function AyudaScreen() {
  const {
    sesion,
    pushToken,
    escalaFuente,
    cambiarEscalaFuente,
    cerrarSesion,
    paleta,
    factorFuente,
    t,
  } = useMobileSession();

  const escalas: EscalaFuente[] = ['normal', 'grande', 'extra_grande'];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: paleta.fondo }}
      contentContainerStyle={{ padding: 16, gap: 14 }}
    >
      <View
        style={{
          backgroundColor: paleta.superficie,
          padding: 16,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: paleta.borde,
          gap: 10,
        }}
      >
        <Text style={{ color: paleta.texto, fontWeight: '700', fontSize: 18 * factorFuente }}>
          {t.ayuda.titulo}
        </Text>

        <Pressable
          onPress={() => void Linking.openURL(WHATSAPP_DEMO_URL)}
          style={{
            backgroundColor: '#15803d',
            padding: 12,
            borderRadius: 8,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 * factorFuente }}>
            {t.ayuda.abrirWhatsapp}
          </Text>
        </Pressable>

        <Link href="/(auth)/verificar" asChild>
          <Pressable
            style={{
              borderWidth: 1,
              borderColor: paleta.borde,
              padding: 10,
              borderRadius: 8,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: paleta.texto, fontSize: 14 * factorFuente }}>
              {t.verificar.titulo}
            </Text>
          </Pressable>
        </Link>
      </View>

      <View
        style={{
          backgroundColor: paleta.superficie,
          padding: 16,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: paleta.borde,
          gap: 8,
        }}
      >
        <Text style={{ color: paleta.texto, fontWeight: '700', fontSize: 15 * factorFuente }}>
          {t.ayuda.tamanoFuente}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {escalas.map((esc) => (
            <Pressable
              key={esc}
              onPress={() => cambiarEscalaFuente(esc)}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: 8,
                backgroundColor: escalaFuente === esc ? paleta.primario : paleta.fondo,
              }}
            >
              <Text
                style={{
                  color: escalaFuente === esc ? '#fff' : paleta.texto,
                  fontSize: 13 * factorFuente,
                }}
              >
                {esc}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={{ color: paleta.textoSecundario, fontSize: 12 * factorFuente }}>
          {t.ayuda.notificaciones}: {pushToken ? 'Activas' : 'Pendiente en dispositivo físico'}
        </Text>
        {sesion && (
          <Pressable onPress={() => void cerrarSesion()} style={{ paddingTop: 8 }}>
            <Text style={{ color: '#dc2626', fontWeight: '700', fontSize: 14 * factorFuente }}>
              {t.ayuda.cerrarSesion}
            </Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}
