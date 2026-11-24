import { ScrollView, Text, View } from 'react-native';
import { useMobileSession } from '../../src/lib/session-context';

export default function ResultadosScreen() {
  const { paleta, factorFuente, t } = useMobileSession();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: paleta.fondo }}
      contentContainerStyle={{ padding: 16 }}
    >
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
        <Text style={{ color: paleta.texto, fontWeight: '700', fontSize: 18 * factorFuente }}>
          {t.resultados.titulo}
        </Text>
        <Text style={{ color: paleta.textoSecundario, fontSize: 14 * factorFuente }}>
          {t.resultados.info}
        </Text>
      </View>
    </ScrollView>
  );
}
