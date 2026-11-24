import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, Text, TextInput, View } from 'react-native';
import { apiMobile } from '../../src/lib/api';
import { useMobileSession } from '../../src/lib/session-context';

export default function VerificarScreen() {
  const { sesion, paleta, factorFuente, t } = useMobileSession();
  const router = useRouter();
  const [codigo, setCodigo] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);

  const solicitar = async () => {
    if (!sesion?.usuario.pacienteId) return;
    await apiMobile.solicitarOtp(sesion.accessToken, sesion.usuario.pacienteId);
    setMensaje('Código OTP de 6 dígitos enviado.');
  };

  const confirmar = async () => {
    if (!sesion?.usuario.pacienteId) return;
    try {
      await apiMobile.verificarOtp(sesion.accessToken, sesion.usuario.pacienteId, codigo);
      router.replace('/(tabs)');
    } catch (err) {
      setMensaje(err instanceof Error ? err.message : 'Código inválido');
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
      <Text style={{ color: paleta.texto, fontSize: 20 * factorFuente, fontWeight: '700' }}>
        {t.verificar.titulo}
      </Text>
      <Text style={{ color: paleta.textoSecundario, fontSize: 14 * factorFuente }}>
        {t.verificar.subtitulo}
      </Text>
      {mensaje && <Text style={{ color: paleta.primario }}>{mensaje}</Text>}
      <TextInput
        value={codigo}
        onChangeText={setCodigo}
        keyboardType="number-pad"
        maxLength={6}
        placeholder="482913"
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
        onPress={() => void solicitar()}
        style={{
          borderWidth: 1,
          borderColor: paleta.borde,
          padding: 12,
          borderRadius: 8,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: paleta.texto }}>{t.verificar.solicitar}</Text>
      </Pressable>
      <Pressable
        onPress={() => void confirmar()}
        style={{
          backgroundColor: paleta.primario,
          padding: 14,
          borderRadius: 8,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>{t.verificar.confirmar}</Text>
      </Pressable>
    </View>
  );
}
