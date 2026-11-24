import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { CanalAtencion, TipoConsentimiento } from '@salud-digna/shared';
import { CANALES_ATENCION, TIPOS_CONSENTIMIENTO } from '@salud-digna/shared';
import { z } from 'zod';
import { EventPublisherService } from '../common/eventos/event-publisher.service';
import { VERSION_AVISO_VIGENTE } from './aviso-privacidad';

export const RegistrarConsentimientoSchema = z.object({
  pacienteId: z.string().min(1).max(36),
  canal: z.enum(CANALES_ATENCION),
  tipo: z.enum(TIPOS_CONSENTIMIENTO).default('aviso_privacidad'),
  versionAviso: z.string().min(1).max(32).default(VERSION_AVISO_VIGENTE),
  ip: z.string().max(45).optional(),
});

export type RegistrarConsentimientoInput = z.input<typeof RegistrarConsentimientoSchema>;

export interface RegistroConsentimiento {
  id: string;
  pacienteId: string;
  tipo: TipoConsentimiento;
  versionAviso: string;
  canal: CanalAtencion;
  otorgadoEn: string;
  revocadoEn: string | null;
  ip: string | null;
}

@Injectable()
export class ConsentimientoService {
  private readonly registros: RegistroConsentimiento[] = [];

  constructor(private readonly eventPublisher: EventPublisherService) {}

  async registrar(entrada: RegistrarConsentimientoInput): Promise<RegistroConsentimiento> {
    const parsed = RegistrarConsentimientoSchema.safeParse(entrada);
    if (!parsed.success) {
      throw new BadRequestException({
        mensaje: 'Datos de consentimiento inválidos',
        errores: parsed.error.flatten().fieldErrors,
      });
    }

    const registro: RegistroConsentimiento = {
      id: `con_${randomUUID().slice(0, 12)}`,
      pacienteId: parsed.data.pacienteId,
      tipo: parsed.data.tipo,
      versionAviso: parsed.data.versionAviso,
      canal: parsed.data.canal,
      otorgadoEn: new Date().toISOString(),
      revocadoEn: null,
      ip: parsed.data.ip ?? null,
    };

    this.registros.push(registro);

    await this.eventPublisher.publicar({
      tipo: 'consentimiento.otorgado',
      version: 1,
      pacienteId: registro.pacienteId,
      tramiteId: null,
      canal: registro.canal,
      actor: { tipo: 'paciente', id: registro.pacienteId },
      datos: {
        consentimientoId: registro.id,
        tipo: registro.tipo,
        versionAviso: registro.versionAviso,
      },
    });

    return registro;
  }

  listarPorPaciente(pacienteId: string): RegistroConsentimiento[] {
    return this.registros.filter((r) => r.pacienteId === pacienteId);
  }

  tieneConsentimientoVigente(
    pacienteId: string,
    tipo: TipoConsentimiento = 'aviso_privacidad',
  ): boolean {
    return this.registros.some(
      (r) => r.pacienteId === pacienteId && r.tipo === tipo && r.revocadoEn === null,
    );
  }

  revocar(pacienteId: string, tipo: TipoConsentimiento): number {
    let revocados = 0;
    const ahora = new Date().toISOString();
    for (const r of this.registros) {
      if (r.pacienteId === pacienteId && r.tipo === tipo && r.revocadoEn === null) {
        r.revocadoEn = ahora;
        revocados += 1;
      }
    }
    return revocados;
  }

  limpiarParaPruebas(): void {
    this.registros.length = 0;
  }
}
