'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { TimelinePanel } from '../../../components/TimelinePanel';
import { apiWeb } from '../../../lib/api';
import { useAppWeb } from '../../../lib/providers';

export default function DetalleTramitePage() {
  const { folio } = useParams<{ folio: string }>();
  const { t, token } = useAppWeb();
  const queryClient = useQueryClient();

  const [rfc, setRfc] = useState('');
  const [razonSocial, setRazonSocial] = useState('');
  const [regimenFiscal, setRegimenFiscal] = useState('605');
  const [codigoPostal, setCodigoPostal] = useState('');
  const [avisoFactura, setAvisoFactura] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(
    null,
  );

  const { data: tramite, isLoading } = useQuery({
    queryKey: ['tramites', folio],
    queryFn: () => apiWeb.obtenerTramite(token!, folio),
    enabled: Boolean(token && folio),
  });

  const { data: timeline } = useQuery({
    queryKey: ['timeline', tramite?.pacienteId, tramite?.id],
    queryFn: () => apiWeb.obtenerTimeline(token!, tramite!.pacienteId, tramite!.id),
    enabled: Boolean(token && tramite?.pacienteId),
  });

  const { data: facturaData } = useQuery({
    queryKey: ['factura', folio],
    queryFn: () => apiWeb.consultarFacturaTramite(token!, folio),
    enabled: Boolean(token && folio),
  });

  const { data: datosFiscales } = useQuery({
    queryKey: ['datos-fiscales', tramite?.pacienteId],
    queryFn: () => apiWeb.obtenerDatosFiscales(token!, tramite!.pacienteId),
    enabled: Boolean(token && tramite?.pacienteId),
  });

  useEffect(() => {
    if (datosFiscales?.datosFiscales) {
      setRfc(datosFiscales.datosFiscales.rfc);
      setRazonSocial(datosFiscales.datosFiscales.razonSocial);
      setRegimenFiscal(datosFiscales.datosFiscales.regimenFiscal);
      setCodigoPostal(datosFiscales.datosFiscales.codigoPostal);
    }
  }, [datosFiscales]);

  const solicitarFactura = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !tramite) return;
    setAvisoFactura(null);
    try {
      const usarGuardados = Boolean(datosFiscales?.guardados) && !rfc.trim();
      const res = await apiWeb.solicitarFactura(token, {
        tramiteId: tramite.id,
        pacienteId: tramite.pacienteId,
        ...(usarGuardados
          ? {}
          : {
              datosFiscales: {
                rfc,
                razonSocial,
                regimenFiscal,
                codigoPostal,
                usoCfdi: 'D01',
              },
            }),
      });
      setAvisoFactura({
        tipo: 'ok',
        texto: `Factura simulada ${res.factura.folioFiscalSimulado} emitida correctamente.`,
      });
      await queryClient.invalidateQueries({ queryKey: ['factura', folio] });
      await queryClient.invalidateQueries({ queryKey: ['datos-fiscales', tramite.pacienteId] });
    } catch (err) {
      setAvisoFactura({
        tipo: 'error',
        texto: err instanceof Error ? err.message : 'Error al emitir factura',
      });
    }
  };

  const descargarFacturaPdf = async (facturaId: string) => {
    if (!token) return;
    try {
      const blob = await apiWeb.descargarFacturaPdfBlob(token, facturaId);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      // Liberar la memoria del PDF cuando la pestaña nueva ya lo cargó
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setAvisoFactura({
        tipo: 'error',
        texto: err instanceof Error ? err.message : 'No se pudo descargar la factura',
      });
    }
  };

  if (isLoading) return <p>{t.estados.cargando}</p>;
  if (!tramite) return <p className="sd-muted">Trámite no encontrado o requiere iniciar sesión.</p>;

  return (
    <div>
      <section className="sd-card">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <h1 style={{ margin: 0 }}>Trámite {tramite.folio}</h1>
          <span className="sd-badge">{tramite.estado}</span>
        </div>
        <p className="sd-muted">
          Estudio: <strong>{tramite.contexto.estudio?.nombre ?? 'Por definir'}</strong> · Clínica:{' '}
          <strong>{tramite.contexto.clinica?.nombre ?? 'Por definir'}</strong> · Canal actual:{' '}
          <strong>{tramite.ultimoCanal}</strong>
        </p>
        {tramite.cita && (
          <div className="sd-banner-pendiente">
            <div>
              <strong>Cita {tramite.cita.estatus}</strong> —{' '}
              {new Date(tramite.cita.fechaHora).toLocaleString('es-MX')}
              <div className="sd-muted">
                Código de confirmación: {tramite.cita.codigoConfirmacion}
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="sd-card">
        <h2 style={{ marginTop: 0 }}>Facturación simulada (#33)</h2>
        {avisoFactura && (
          <div
            className={avisoFactura.tipo === 'error' ? 'sd-alert-error' : 'sd-banner-pendiente'}
            role={avisoFactura.tipo === 'error' ? 'alert' : 'status'}
          >
            {avisoFactura.texto}
          </div>
        )}

        {facturaData?.existe && facturaData.factura ? (
          <div>
            <p>
              <strong>Folio:</strong> {facturaData.factura.folioFiscalSimulado} ·{' '}
              <span className="sd-badge">{facturaData.factura.estatus}</span>
            </p>
            <p className="sd-muted">
              RFC: {facturaData.factura.rfc} · Total: ${facturaData.factura.total.toFixed(2)} MXN
              {facturaData.factura.reutilizoDatosGuardados
                ? ' · Reutilizó tus datos fiscales guardados'
                : ''}
            </p>
            <button
              type="button"
              className="sd-btn-primary"
              onClick={() => void descargarFacturaPdf(facturaData.factura!.id)}
            >
              Descargar factura PDF (simulada)
            </button>
          </div>
        ) : (
          <form onSubmit={(e) => void solicitarFactura(e)}>
            <p className="sd-muted">
              Tus datos fiscales se cifran (AES-256-GCM) para que puedas pedir facturas desde
              WhatsApp, Web o App sin volver a capturarlos.
            </p>
            <div className="sd-grid">
              <div className="sd-field">
                <label htmlFor="fac-rfc">RFC</label>
                <input
                  id="fac-rfc"
                  required
                  value={rfc}
                  onChange={(e) => setRfc(e.target.value.toUpperCase())}
                  placeholder="LOPA950412AB1"
                />
              </div>
              <div className="sd-field">
                <label htmlFor="fac-razon">Nombre / Razón social</label>
                <input
                  id="fac-razon"
                  required
                  value={razonSocial}
                  onChange={(e) => setRazonSocial(e.target.value)}
                  placeholder="Ana López Demo"
                />
              </div>
              <div className="sd-field">
                <label htmlFor="fac-regimen">Régimen fiscal</label>
                <select
                  id="fac-regimen"
                  value={regimenFiscal}
                  onChange={(e) => setRegimenFiscal(e.target.value)}
                >
                  <option value="605">605 - Sueldos y Salarios</option>
                  <option value="612">612 - Personas Físicas con Actividad Empresarial</option>
                  <option value="616">616 - Sin obligaciones fiscales</option>
                  <option value="626">626 - RESICO</option>
                  <option value="601">601 - General de Ley Personas Morales</option>
                </select>
              </div>
              <div className="sd-field">
                <label htmlFor="fac-cp">Código Postal</label>
                <input
                  id="fac-cp"
                  required
                  pattern="\d{5}"
                  maxLength={5}
                  value={codigoPostal}
                  onChange={(e) => setCodigoPostal(e.target.value)}
                  placeholder="72000"
                />
              </div>
            </div>
            <button type="submit" className="sd-btn-primary">
              Solicitar factura simulada (PDF)
            </button>
          </form>
        )}
      </section>

      <section className="sd-card">
        <h2 style={{ marginTop: 0 }}>{t.tramites.timelineTitulo}</h2>
        <TimelinePanel items={timeline?.items ?? []} />
      </section>
    </div>
  );
}
