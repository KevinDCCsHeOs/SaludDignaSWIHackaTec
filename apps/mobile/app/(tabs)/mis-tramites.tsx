import { Link } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useMobileSession } from '../../src/lib/session-context';

export default function MisTramitesScreen() {
  const { tramites, paleta, factorFuente, t } = useMobileSession();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: paleta.fondo }}
      contentContainerStyle={{ padding: 16, gap: 10 }}
    >
      {tramites.length === 0 ? (
        <Text style={{ color: paleta.textoSecundario, fontSize: 15 * factorFuente }}>
          {t.inicio.sinTramite}
        </Text>
      ) : (
        tramites.map((trm) => (
          <Link key={trm.id} href={`/tramite/${trm.folio}`} asChild>
            <Pressable
              style={{
                backgroundColor: paleta.superficie,
                padding: 14,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: paleta.borde,
                gap: 4,
              }}
            >
              <Text style={{ color: paleta.texto, fontWeight: '700', fontSize: 16 * factorFuente }}>
                {trm.folio} · {trm.estado}
              </Text>
              <Text style={{ color: paleta.textoSecundario, fontSize: 14 * factorFuente }}>
                {trm.contexto.estudio?.nombre ?? 'Cotización'} —{' '}
                {trm.contexto.clinica?.nombre ?? 'Sin clínica'}
              </Text>
              <View>
                <Text style={{ color: paleta.primario, fontSize: 12 * factorFuente }}>
                  Último canal: {trm.ultimoCanal}
                </Text>
              </View>
            </Pressable>
          </Link>
        ))
      )}
    </ScrollView>
  );
}
