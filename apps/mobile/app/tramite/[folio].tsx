import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { construirModeloTimeline } from '@salud-digna/ui';
import { API_URL_MOBILE, apiMobile, TimelineMobileDto, TramiteMobileDto } from '../../src/lib/api';
import { useMobileSession } from '../../src/lib/session-context';

export default function DetalleTramiteScreen() {
  const { folio } = useLocalSearchParams<{ folio: string }>();
  const { sesion, tramites, paleta, factorFuente } = useMobileSession();
  const [tramite, setTramite] = useState<TramiteMobileDto | null>(
    () => tramites.find((t) => t.folio === folio) ?? null,
  );
  const [timeline, setTimeline] = useState<TimelineMobileDto[]>([]);
  const [factura, setFactura] = useState<{
    folioFiscalSimulado: string;
    estatus: string;
    total: number;
    pdfUrl: string;
  } | null>(null);

  useEffect(() => {
    if (!sesion || !folio) return;
    void (async () => {
      try {
        const det = await apiMobile.obtenerTramite(sesion.accessToken, folio);
        setTramite(det);
        const tl = await apiMobile.obtenerTimeline(sesion.accessToken, det.pacienteId, det.id);
        setTimeline(tl.items);
        const fac = await apiMobile.consultarFacturaTramite(sesion.accessToken, det.folio);
        if (fac.existe && fac.factura && fac.pdfUrl) {
          setFactura({ ...fac.factura, pdfUrl: fac.pdfUrl });
        }
      } catch {
        // Mantiene versión en caché si está sin conexión
      }
    })();
  }, [sesion, folio]);

  const nodos = construirModeloTimeline(timeline);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: paleta.fondo }}
      contentContainerStyle={{ padding: 16, gap: 12 }}
    >
      {tramite && (
        <View
          style={{
            backgroundColor: paleta.superficie,
            padding: 14,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: paleta.borde,
            gap: 4,
          }}
        >
          <Text style={{ color: paleta.texto, fontWeight: '700', fontSize: 18 * factorFuente }}>
            {tramite.folio} · {tramite.estado}
          </Text>
          <Text style={{ color: paleta.textoSecundario, fontSize: 14 * factorFuente }}>
            {tramite.contexto.estudio?.nombre} — {tramite.contexto.clinica?.nombre}
          </Text>
        </View>
      )}

      {factura && (
        <View
          style={{
            backgroundColor: paleta.superficie,
            padding: 14,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: paleta.borde,
            gap: 8,
          }}
        >
          <Text style={{ color: paleta.primario, fontWeight: '700', fontSize: 15 * factorFuente }}>
            Factura simulada ({factura.estatus})
          </Text>
          <Text style={{ color: paleta.textoSecundario, fontSize: 13 * factorFuente }}>
            Folio: {factura.folioFiscalSimulado} · Total: ${factura.total.toFixed(2)} MXN
          </Text>
          <Pressable
            onPress={() => void Linking.openURL(`${API_URL_MOBILE}${factura.pdfUrl}`)}
            style={{
              backgroundColor: paleta.primario,
              padding: 10,
              borderRadius: 8,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 * factorFuente }}>
              Descargar factura PDF
            </Text>
          </Pressable>
        </View>
      )}

      <View
        style={{
          backgroundColor: paleta.superficie,
          padding: 14,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: paleta.borde,
          gap: 10,
        }}
      >
        <Text style={{ color: paleta.texto, fontWeight: '700', fontSize: 16 * factorFuente }}>
          Línea de tiempo unificada
        </Text>
        {nodos.map((n) => (
          <View
            key={n.eventId}
            style={{ borderLeftWidth: 3, borderLeftColor: n.metaCanal.color, paddingLeft: 10 }}
          >
            <Text style={{ color: paleta.texto, fontWeight: '600', fontSize: 14 * factorFuente }}>
              [{n.canal}] {n.actor}: {n.accion}
            </Text>
            <Text style={{ color: paleta.textoSecundario, fontSize: 12 * factorFuente }}>
              {n.fecha}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
