import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useMobileSession } from '../../src/lib/session-context';

export default function LoginScreen() {
  const { iniciarSesion, paleta, factorFuente, t } = useMobileSession();
  const router = useRouter();
  const [email, setEmail] = useState('ana.lopez@demo.saluddigna.local');
  const [contrasena, setContrasena] = useState('DemoPaciente2026!');
  const [error, setError] = useState<string | null>(null);

  const entrar = async () => {
    setError(null);
    try {
      await iniciarSesion(email, contrasena);
      router.replace('/(tabs)');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de acceso');
    }
  };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: paleta.fondo,
        justifyContent: 'center',
        padding: 20,
        gap: 12,
      }}
    >
      <Text style={{ color: paleta.texto, fontSize: 22 * factorFuente, fontWeight: '700' }}>
        {t.login.titulo}
      </Text>
      {error && <Text style={{ color: '#dc2626' }}>{error}</Text>}
      <TextInput
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        placeholder={t.login.email}
        style={{
          backgroundColor: paleta.superficie,
          color: paleta.texto,
          borderColor: paleta.borde,
          borderWidth: 1,
          borderRadius: 8,
          padding: 12,
        }}
      />
      <TextInput
        value={contrasena}
        onChangeText={setContrasena}
        secureTextEntry
        placeholder={t.login.contrasena}
        style={{
          backgroundColor: paleta.superficie,
          color: paleta.texto,
          borderColor: paleta.borde,
          borderWidth: 1,
          borderRadius: 8,
          padding: 12,
        }}
      />
      <Pressable
        onPress={() => void entrar()}
        style={{
          backgroundColor: paleta.primario,
          padding: 14,
          borderRadius: 8,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 * factorFuente }}>
          {t.login.demoAna}
        </Text>
      </Pressable>
    </View>
  );
}
