import { Injectable } from '@nestjs/common';
import type { AccionAuditoria, CanalAtencion, RolUsuario } from '@salud-digna/shared';
import { sanitizarObjetoParaLog } from '../privacidad/sanitizador-logs';

export interface EntradaAuditoriaInput {
  usuarioId?: string | null;
  rol?: RolUsuario | null;
  accion: AccionAuditoria;
  entidad: string;
  entidadId: string;
  pacienteId?: string | null;
  canal: CanalAtencion;
  ip?: string | null;
  exitoso?: boolean;
  detalleSinPii?: Record<string, unknown> | null;
}

export interface RegistroAuditoria {
  id: number;
  usuarioId: string | null;
  rol: RolUsuario | null;
  accion: AccionAuditoria;
  entidad: string;
  entidadId: string;
  pacienteId: string | null;
  canal: CanalAtencion;
  ip: string | null;
  exitoso: boolean;
  detalleSinPii: Record<string, unknown> | null;
  creadoEn: string;
}

export interface FiltrosAuditoria {
  pacienteId?: string;
  usuarioId?: string;
  canal?: CanalAtencion;
  accion?: AccionAuditoria;
  desde?: string;
  hasta?: string;
  limit?: number;
}

function escaparCsv(valor: unknown): string {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  // Previene CSV / Formula Injection en Excel
  const seguro = /^[=+\-@]/.test(texto) ? `'${texto}` : texto;
  return `"${seguro.replace(/"/g, '""')}"`;
}

/**
 * Bitácora de auditoría append-only (#11).
 * Solo expone inserción (asíncrona vía cola interna) y lectura/exportación para admin.
 * Intencionalmente NO implementa update ni delete.
 */
@Injectable()
export class AuditoriaService {
  private secuenciaId = 1;
  private readonly registros: RegistroAuditoria[] = [];
  private readonly colaPendiente: EntradaAuditoriaInput[] = [];
  private drenando = false;
  private persistidorExterno?: (registro: RegistroAuditoria) => Promise<void>;

  configurarPersistidor(fn: (registro: RegistroAuditoria) => Promise<void>): void {
    this.persistidorExterno = fn;
  }

  /**
   * Encola la inserción para no bloquear la respuesta HTTP del API.
   */
  registrarAsync(entrada: EntradaAuditoriaInput): void {
    this.colaPendiente.push(entrada);
    if (!this.drenando) {
      this.drenando = true;
      setImmediate(() => {
        void this.flush();
      });
    }
  }

  /**
   * Inserción directa (útil para eventos críticos de seguridad o pruebas deterministas).
   */
  async registrar(entrada: EntradaAuditoriaInput): Promise<RegistroAuditoria> {
    const detalleSanitizado = entrada.detalleSinPii
      ? (sanitizarObjetoParaLog(entrada.detalleSinPii) as Record<string, unknown>)
      : null;

    const registro: RegistroAuditoria = {
      id: this.secuenciaId++,
      usuarioId: entrada.usuarioId ?? null,
      rol: entrada.rol ?? null,
      accion: entrada.accion,
      entidad: entrada.entidad,
      entidadId: entrada.entidadId,
      pacienteId: entrada.pacienteId ?? null,
      canal: entrada.canal,
      ip: entrada.ip ?? null,
      exitoso: entrada.exitoso ?? true,
      detalleSinPii: detalleSanitizado,
      creadoEn: new Date().toISOString(),
    };

    this.registros.push(registro);

    if (this.persistidorExterno) {
      try {
        await this.persistidorExterno(registro);
      } catch {
        // Conserva el registro en memoria si MySQL no está conectado en modo local/test
      }
    }

    return registro;
  }

  async flush(): Promise<void> {
    try {
      while (this.colaPendiente.length > 0) {
        const siguiente = this.colaPendiente.shift();
        if (siguiente) {
          await this.registrar(siguiente);
        }
      }
    } finally {
      this.drenando = false;
    }
  }

  consultar(filtros: FiltrosAuditoria = {}): RegistroAuditoria[] {
    const desdeMs = filtros.desde ? Date.parse(filtros.desde) : null;
    const hastaMs = filtros.hasta ? Date.parse(filtros.hasta) : null;
    const limit = Math.min(Math.max(Number(filtros.limit ?? 100), 1), 500);

    return this.registros
      .filter((r) => {
        if (filtros.pacienteId && r.pacienteId !== filtros.pacienteId) return false;
        if (filtros.usuarioId && r.usuarioId !== filtros.usuarioId) return false;
        if (filtros.canal && r.canal !== filtros.canal) return false;
        if (filtros.accion && r.accion !== filtros.accion) return false;
        const ts = Date.parse(r.creadoEn);
        if (desdeMs !== null && !Number.isNaN(desdeMs) && ts < desdeMs) return false;
        if (hastaMs !== null && !Number.isNaN(hastaMs) && ts > hastaMs) return false;
        return true;
      })
      .slice(-limit)
      .reverse();
  }

  exportarCsv(filtros: FiltrosAuditoria = {}): string {
    const encabezados = [
      'id',
      'creado_en',
      'usuario_id',
      'rol',
      'accion',
      'entidad',
      'entidad_id',
      'paciente_id',
      'canal',
      'ip',
      'exitoso',
    ];
    const filas = this.consultar(filtros).map((r) =>
      [
        r.id,
        r.creadoEn,
        r.usuarioId,
        r.rol,
        r.accion,
        r.entidad,
        r.entidadId,
        r.pacienteId,
        r.canal,
        r.ip,
        r.exitoso,
      ]
        .map(escaparCsv)
        .join(','),
    );
    return [encabezados.join(','), ...filas].join('\n');
  }

  limpiarParaPruebas(): void {
    this.registros.length = 0;
    this.colaPendiente.length = 0;
    this.secuenciaId = 1;
  }
}
