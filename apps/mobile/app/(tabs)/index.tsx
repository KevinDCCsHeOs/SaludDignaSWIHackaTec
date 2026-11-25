import { useEffect, useState } from 'react';
import { Link } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { apiMobile } from '../../src/lib/api';
import { useMobileSession } from '../../src/lib/session-context';

export default function InicioScreen() {
  const { sesion, tramites, sinConexion, paleta, factorFuente, t, recargarTramites } =
    useMobileSession();
  const activo = tramites.find((tr) => tr.estado !== 'cerrado' && tr.estado !== 'cancelado');
  const [avisoClinica, setAvisoClinica] = useState<string | null>(null);

  useEffect(() => {
    const clinicaId = activo?.contexto.clinica?.id;
    apiMobile
      .obtenerEstatusServicio()
      .then((res) => {
        const inc = clinicaId
          ? res.incidencias.find((i) => i.clinicaId === clinicaId)
          : res.incidencias[0];
        setAvisoClinica(inc ? `${inc.nombre}: ${inc.mensaje}` : null);
      })
      .catch(() => undefined);
  }, [activo?.contexto.clinica?.id]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: paleta.fondo }}
      contentContainerStyle={{ padding: 16, gap: 12 }}
    >
      {sinConexion && (
        <View style={{ backgroundColor: paleta.alertaFondo, padding: 12, borderRadius: 10 }}>
          <Text style={{ color: paleta.alertaTexto, fontSize: 14 * factorFuente }}>
            {t.app.sinConexion}
          </Text>
        </View>
      )}

      {avisoClinica && (
        <View style={{ backgroundColor: paleta.alertaFondo, padding: 12, borderRadius: 10 }}>
          <Text
            style={{ color: paleta.alertaTexto, fontSize: 13 * factorFuente, fontWeight: '600' }}
          >
            Aviso de servicio en clínica: {avisoClinica}
          </Text>
        </View>
      )}

      {!sesion ? (
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
          <Text style={{ color: paleta.texto, fontSize: 20 * factorFuente, fontWeight: '700' }}>
            {t.login.titulo}
          </Text>
          <Text style={{ color: paleta.textoSecundario, fontSize: 14 * factorFuente }}>
            {t.login.subtitulo}
          </Text>
          <Link href="/(auth)/login" asChild>
            <Pressable
              style={{
                backgroundColor: paleta.primario,
                padding: 12,
                borderRadius: 8,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 * factorFuente }}>
                {t.login.entrar}
              </Text>
            </Pressable>
          </Link>
        </View>
      ) : (
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
          <Text style={{ color: paleta.primario, fontWeight: '700', fontSize: 13 * factorFuente }}>
            {t.inicio.tramiteActivo}
          </Text>
          {activo ? (
            <>
              <Text style={{ color: paleta.texto, fontSize: 18 * factorFuente, fontWeight: '700' }}>
                {activo.contexto.estudio?.nombre ?? activo.folio}
              </Text>
              <Text style={{ color: paleta.textoSecundario, fontSize: 14 * factorFuente }}>
                {activo.contexto.clinica?.nombre ?? 'Clínica pendiente'} · Estado: {activo.estado}
              </Text>
              {activo.cita && (
                <Text
                  style={{ color: paleta.primario, fontWeight: '600', fontSize: 14 * factorFuente }}
                >
                  {t.inicio.citaConfirmada}: {activo.cita.fechaHora} (
                  {activo.cita.codigoConfirmacion})
                </Text>
              )}
              <Link href={`/tramite/${activo.folio}`} asChild>
                <Pressable
                  style={{
                    backgroundColor: paleta.primario,
                    padding: 12,
                    borderRadius: 8,
                    alignItems: 'center',
                    marginTop: 6,
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 * factorFuente }}>
                    {t.inicio.retomar}
                  </Text>
                </Pressable>
              </Link>
            </>
          ) : (
            <Text style={{ color: paleta.textoSecundario, fontSize: 14 * factorFuente }}>
              {t.inicio.sinTramite}
            </Text>
          )}
          <Pressable onPress={() => void recargarTramites()} style={{ paddingTop: 6 }}>
            <Text style={{ color: paleta.primario, fontSize: 13 * factorFuente }}>Actualizar</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}
