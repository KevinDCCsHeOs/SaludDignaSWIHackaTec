import type { CanalAtencion } from '@salud-digna/shared';
import type { EntidadesIa, IntencionIa } from './clasificador-nlp';

export interface TurnoConversacionIa {
  emisor: 'paciente' | 'ia';
  texto: string;
  intencion?: IntencionIa;
  confianza?: number;
  en: string;
}

export interface ContextoMinimoPacienteIa {
  primerNombre?: string;
  folio?: string;
  estadoTramite?: string;
  pasoActual?: string;
  estudioNombre?: string;
  clinicaNombre?: string;
  region?: string;
}

/**
 * Construye un resumen automático de máximo 5 líneas para el asesor humano (#25).
 * Nunca incluye CURP, teléfono, correo ni datos clínicos sensibles.
 */
export function generarResumenParaAsesor(entrada: {
  canal: CanalAtencion;
  motivo: string;
  intencion: IntencionIa;
  entidades: EntidadesIa;
  contexto?: ContextoMinimoPacienteIa | null;
  historialReciente: readonly TurnoConversacionIa[];
}): string {
  const lineas: string[] = [];

  lineas.push(
    `Canal: ${entrada.canal} | Motivo: ${entrada.motivo} (intención: ${entrada.intencion}).`,
  );

  if (entrada.contexto?.folio) {
    const est = entrada.contexto.estudioNombre ?? 'sin estudio';
    const cli = entrada.contexto.clinicaNombre ?? 'sin clínica';
    lineas.push(
      `Trámite activo: ${entrada.contexto.folio} (${entrada.contexto.estadoTramite ?? 'activo'}) — ${est} en ${cli}.`,
    );
  } else if (entrada.entidades.estudioNombre || entrada.entidades.clinicaNombre) {
    const partes = [
      entrada.entidades.estudioNombre ? `estudio: ${entrada.entidades.estudioNombre}` : null,
      entrada.entidades.clinicaNombre ? `clínica: ${entrada.entidades.clinicaNombre}` : null,
      entrada.entidades.fecha ? `fecha mencionada: ${entrada.entidades.fecha}` : null,
    ].filter(Boolean);
    lineas.push(`Entidades detectadas: ${partes.join(', ')}.`);
  }

  const mensajesPaciente = entrada.historialReciente
    .filter((t) => t.emisor === 'paciente')
    .slice(-3)
    .map((t) => t.texto.replace(/\s+/g, ' ').trim().slice(0, 110));

  for (const msg of mensajesPaciente) {
    if (lineas.length >= 5) break;
    lineas.push(`Paciente dijo: "${msg}"`);
  }

  return lineas.slice(0, 5).join('\n');
}
