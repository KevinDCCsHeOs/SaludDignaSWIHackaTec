'use client';

import { useEffect, useRef } from 'react';
import type { ClinicaDto } from '../lib/api';

interface MapaClinicasProps {
  clinicas: ClinicaDto[];
  seleccionadaId: string | null;
  onSeleccionar: (clinica: ClinicaDto) => void;
}

/**
 * Mapa interactivo de clínicas con Leaflet + OpenStreetMap (#18).
 * Se carga dinámicamente en el cliente para evitar errores SSR.
 */
export function MapaClinicas({ clinicas, seleccionadaId, onSeleccionar }: MapaClinicasProps) {
  const contenedorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelado = false;
    let mapa: import('leaflet').Map | null = null;

    async function inicializar() {
      if (!contenedorRef.current || clinicas.length === 0) return;
      const L = await import('leaflet');
      if (cancelado || !contenedorRef.current) return;

      const primera = clinicas.find((c) => c.id === seleccionadaId) ?? clinicas[0];
      mapa = L.map(contenedorRef.current).setView([primera.lat, primera.lng], 11);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(mapa);

      for (const cli of clinicas) {
        const esActiva = cli.id === seleccionadaId;
        const marcador = L.circleMarker([cli.lat, cli.lng], {
          radius: esActiva ? 11 : 8,
          color: esActiva ? '#0b6e4f' : '#1d4ed8',
          fillColor: esActiva ? '#10b981' : '#3b82f6',
          fillOpacity: 0.85,
        }).addTo(mapa);

        marcador.bindPopup(`<strong>${cli.nombre}</strong><br/>${cli.direccion}`);
        marcador.on('click', () => onSeleccionar(cli));
      }
    }

    void inicializar();
    return () => {
      cancelado = true;
      mapa?.remove();
    };
  }, [clinicas, seleccionadaId, onSeleccionar]);

  return (
    <div
      ref={contenedorRef}
      className="sd-map-box"
      role="region"
      aria-label="Mapa interactivo de clínicas Salud Digna"
    />
  );
}
