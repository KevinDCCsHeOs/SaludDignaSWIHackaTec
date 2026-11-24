import { ScrollView, Text, View } from 'react-native';
import { useMobileSession } from '../../src/lib/session-context';

export default function CitasScreen() {
  const { tramites, paleta, factorFuente, t } = useMobileSession();
  const conCita = tramites.filter((tr) => tr.cita !== null);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: paleta.fondo }}
      contentContainerStyle={{ padding: 16, gap: 12 }}
    >
      {conCita.length === 0 ? (
        <Text style={{ color: paleta.textoSecundario, fontSize: 15 * factorFuente }}>
          {t.citas.vacio}
        </Text>
      ) : (
        conCita.map((tr) => (
          <View
            key={tr.id}
            style={{
              backgroundColor: paleta.superficie,
              padding: 14,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: paleta.borde,
              gap: 4,
            }}
          >
            <Text
              style={{ color: paleta.primario, fontWeight: '700', fontSize: 13 * factorFuente }}
            >
              {tr.cita?.estatus.toUpperCase()} · {tr.cita?.codigoConfirmacion}
            </Text>
            <Text style={{ color: paleta.texto, fontWeight: '700', fontSize: 16 * factorFuente }}>
              {tr.contexto.estudio?.nombre}
            </Text>
            <Text style={{ color: paleta.textoSecundario, fontSize: 14 * factorFuente }}>
              {tr.contexto.clinica?.nombre} · {tr.cita?.fechaHora}
            </Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}
