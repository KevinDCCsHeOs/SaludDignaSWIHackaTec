import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { CanalAtencion } from '@salud-digna/shared';
import { CANALES_ATENCION } from '@salud-digna/shared';
import PDFDocument from 'pdfkit';
import { z } from 'zod';
import { AuditoriaService } from '../auditoria/auditoria.service';
import type { UsuarioAutenticado } from '../auth/guards';
import { CanalesService } from '../canales/canales.service';
import { PacienteStoreService } from '../identidad/paciente-store.service';
import { TramitesService } from '../tramites/tramites.service';

export type EstatusFactura = 'solicitada' | 'emitida';

const REGEX_RFC_MX =
  /^([A-ZÑ&]{3,4})(\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01]))([A-Z\d]{2})([A\d])$/i;

export const REGIMENES_FISCALES_SAT = [
  '601',
  '603',
  '605',
  '606',
  '608',
  '610',
  '611',
  '612',
  '614',
  '616',
  '621',
  '625',
  '626',
] as const;

export const DatosFiscalesSchema = z.object({
  rfc: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .refine((v) => REGEX_RFC_MX.test(v), 'RFC mexicano inválido (formato SAT 12 o 13 caracteres)'),
  razonSocial: z.string().trim().min(2).max(160),
  regimenFiscal: z.enum(REGIMENES_FISCALES_SAT),
  codigoPostal: z.string().regex(/^\d{5}$/, 'El código postal debe tener 5 dígitos'),
  usoCfdi: z.string().trim().min(3).max(5).default('D01'),
});

export type DatosFiscalesPaciente = z.infer<typeof DatosFiscalesSchema>;

export const SolicitarFacturaSchema = z.object({
  tramiteId: z.string().min(1).max(36),
  pacienteId: z.string().min(1).max(36),
  canal: z.enum(CANALES_ATENCION).default('web'),
  datosFiscales: DatosFiscalesSchema.optional(),
});

export interface FacturaSimuladaRegistro {
  id: string;
  folioFiscalSimulado: string;
  tramiteId: string;
  folioTramite: string;
  pacienteId: string;
  canalSolicitud: CanalAtencion;
  estatus: EstatusFactura;
  estudioNombre: string;
  subtotal: number;
  iva: number;
  total: number;
  rfc: string;
  razonSocial: string;
  regimenFiscal: string;
  codigoPostal: string;
  usoCfdi: string;
  reutilizoDatosGuardados: boolean;
  esDemo: true;
  solicitadaEn: string;
  emitidaEn: string;
}

/**
 * Genera el PDF simulado de factura usando `pdfkit` (#33).
 * Deja explícito que es una factura demostrativa sin timbrado ante el SAT.
 */
export async function generarPdfFacturaSimulada(factura: FacturaSimuladaRegistro): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 48 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).text('SALUD DIGNA OMNICANAL — FACTURA SIMULADA (DEMO)', { align: 'center' });
    doc.moveDown(0.3);
    doc
      .fontSize(9)
      .fillColor('#666666')
      .text('Documento demostrativo sin validez fiscal — No timbrado ante el SAT (esDemo: true)', {
        align: 'center',
      });
    doc.fillColor('#000000').moveDown(1);

    doc.fontSize(11).text(`Folio de factura: ${factura.folioFiscalSimulado}`);
    doc.text(`Trámite vinculado: ${factura.folioTramite}`);
    doc.text(
      `Estatus: ${factura.estatus.toUpperCase()} | Canal de solicitud: ${factura.canalSolicitud}`,
    );
    doc.text(`Fecha de emisión: ${factura.emitidaEn}`);
    doc.moveDown(0.8);

    doc.fontSize(12).text('Datos fiscales del receptor', { underline: true });
    doc.fontSize(11);
    doc.text(`RFC: ${factura.rfc}`);
    doc.text(`Nombre / Razón social: ${factura.razonSocial}`);
    doc.text(
      `Régimen fiscal SAT: ${factura.regimenFiscal} | Código Postal: ${factura.codigoPostal}`,
    );
    doc.text(`Uso CFDI: ${factura.usoCfdi}`);
    doc.moveDown(0.8);

    doc.fontSize(12).text('Concepto facturado', { underline: true });
    doc.fontSize(11);
    doc.text(`Estudio: ${factura.estudioNombre}`);
    doc.text(`Subtotal: $${factura.subtotal.toFixed(2)} MXN`);
    doc.text(`IVA (16%): $${factura.iva.toFixed(2)} MXN`);
    doc.fontSize(13).text(`Total: $${factura.total.toFixed(2)} MXN`);
    doc.moveDown(1);
    doc
      .fontSize(9)
      .fillColor('#555555')
      .text(
        factura.reutilizoDatosGuardados
          ? 'Continuidad omnicanal: emitida reutilizando los datos fiscales cifrados del paciente.'
          : 'Datos fiscales validados y guardados cifrados (AES-256-GCM) para futuras solicitudes.',
      );

    doc.end();
  });
}

/**
 * Servicio de facturación simulada omnicanal (#33):
 * Valida RFC/régimen/CP, guarda datos fiscales cifrados en el paciente para reutilizarlos
 * en cualquier canal y genera un PDF simulado con `pdfkit`.
 */
@Injectable()
export class FacturacionService {
  private readonly facturas = new Map<string, FacturaSimuladaRegistro>();
  private readonly pdfs = new Map<string, Buffer>();

  constructor(
    private readonly pacientes: PacienteStoreService,
    private readonly tramites: TramitesService,
    private readonly canales: CanalesService,
    private readonly auditoria: AuditoriaService,
  ) {}

  guardarDatosFiscales(
    pacienteId: string,
    entrada: z.input<typeof DatosFiscalesSchema>,
    actor: UsuarioAutenticado,
  ): DatosFiscalesPaciente {
    const parsed = DatosFiscalesSchema.safeParse(entrada);
    if (!parsed.success) {
      throw new BadRequestException({
        mensaje: 'Datos fiscales inválidos',
        errores: parsed.error.flatten().fieldErrors,
      });
    }

    const actualizado = this.pacientes.guardarDatosFiscalesCifrados(
      pacienteId,
      JSON.stringify(parsed.data),
    );
    if (!actualizado) {
      throw new NotFoundException('Paciente no encontrado');
    }

    void this.auditoria.registrar({
      usuarioId: actor.id,
      rol: actor.rol,
      accion: 'actualizar',
      entidad: 'DatosFiscalesPaciente',
      entidadId: pacienteId,
      pacienteId,
      canal: 'web',
      exitoso: true,
      detalleSinPii: { regimenFiscal: parsed.data.regimenFiscal, cifrado: true },
    });

    return parsed.data;
  }

  obtenerDatosFiscales(pacienteId: string): DatosFiscalesPaciente | null {
    const raw = this.pacientes.obtenerDatosFiscalesDescifrados(pacienteId);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as DatosFiscalesPaciente;
    } catch {
      return null;
    }
  }

  async solicitarFactura(
    entrada: z.input<typeof SolicitarFacturaSchema>,
    actor: UsuarioAutenticado,
  ): Promise<{ factura: FacturaSimuladaRegistro; pdfUrl: string }> {
    const parsed = SolicitarFacturaSchema.safeParse(entrada);
    if (!parsed.success) {
      throw new BadRequestException({
        mensaje: 'Solicitud de factura inválida',
        errores: parsed.error.flatten().fieldErrors,
      });
    }

    const d = parsed.data;
    const tramite = this.tramites.obtenerPorIdOFolio(d.tramiteId);

    // Si ya existe factura emitida para este trámite, devolverla idempotentemente
    const existente = this.buscarPorTramite(tramite.id);
    if (existente) {
      return { factura: existente, pdfUrl: `/facturacion/${existente.id}/pdf` };
    }

    let datosFiscales: DatosFiscalesPaciente | null = null;
    let reutilizoDatosGuardados = false;

    if (d.datosFiscales) {
      datosFiscales = this.guardarDatosFiscales(d.pacienteId, d.datosFiscales, actor);
    } else {
      datosFiscales = this.obtenerDatosFiscales(d.pacienteId);
      reutilizoDatosGuardados = Boolean(datosFiscales);
    }

    if (!datosFiscales) {
      throw new BadRequestException(
        'No tienes datos fiscales guardados todavía. Captura tu RFC, régimen fiscal y código postal una sola vez para emitir tu factura.',
      );
    }

    const precioTotal = tramite.contexto.estudio?.precio ?? 450;
    const subtotal = Number((precioTotal / 1.16).toFixed(2));
    const iva = Number((precioTotal - subtotal).toFixed(2));
    const ahora = new Date().toISOString();

    const factura: FacturaSimuladaRegistro = {
      id: `fac_${randomUUID().slice(0, 10)}`,
      folioFiscalSimulado: `FAC-DEMO-${new Date().getFullYear()}-${randomUUID().slice(0, 6).toUpperCase()}`,
      tramiteId: tramite.id,
      folioTramite: tramite.folio,
      pacienteId: d.pacienteId,
      canalSolicitud: d.canal,
      estatus: 'solicitada',
      estudioNombre: tramite.contexto.estudio?.nombre ?? 'Estudio clínico Salud Digna',
      subtotal,
      iva,
      total: precioTotal,
      rfc: datosFiscales.rfc,
      razonSocial: datosFiscales.razonSocial,
      regimenFiscal: datosFiscales.regimenFiscal,
      codigoPostal: datosFiscales.codigoPostal,
      usoCfdi: datosFiscales.usoCfdi,
      reutilizoDatosGuardados,
      esDemo: true,
      solicitadaEn: ahora,
      emitidaEn: ahora,
    };

    const pdf = await generarPdfFacturaSimulada({ ...factura, estatus: 'emitida' });
    factura.estatus = 'emitida';
    factura.emitidaEn = new Date().toISOString();

    this.facturas.set(factura.id, factura);
    this.pdfs.set(factura.id, pdf);

    await this.canales
      .registrarInteraccionCanal({
        pacienteId: factura.pacienteId,
        tramiteId: factura.tramiteId,
        canal: factura.canalSolicitud,
        actorTipo: actor.rol === 'asesor_ia' ? 'asesor_ia' : 'paciente',
        actorId: actor.id,
        resumen: `Factura simulada ${factura.folioFiscalSimulado} emitida desde ${factura.canalSolicitud}`,
        referenciaExterna: factura.id,
        metadatos: {
          facturaId: factura.id,
          estatus: factura.estatus,
          reutilizoDatosGuardados,
        },
      })
      .catch(() => undefined);

    await this.auditoria.registrar({
      usuarioId: actor.id,
      rol: actor.rol,
      accion: 'crear',
      entidad: 'FacturaSimulada',
      entidadId: factura.id,
      pacienteId: factura.pacienteId,
      canal: factura.canalSolicitud,
      exitoso: true,
      detalleSinPii: {
        folioTramite: factura.folioTramite,
        estatus: factura.estatus,
        reutilizoDatosGuardados,
      },
    });

    return { factura, pdfUrl: `/facturacion/${factura.id}/pdf` };
  }

  buscarPorTramite(idOFolio: string): FacturaSimuladaRegistro | undefined {
    for (const f of this.facturas.values()) {
      if (f.tramiteId === idOFolio || f.folioTramite === idOFolio) {
        return f;
      }
    }
    return undefined;
  }

  listarPorPaciente(pacienteId: string): FacturaSimuladaRegistro[] {
    return [...this.facturas.values()]
      .filter((f) => f.pacienteId === pacienteId)
      .sort((a, b) => Date.parse(b.emitidaEn) - Date.parse(a.emitidaEn));
  }

  obtenerPorId(id: string): FacturaSimuladaRegistro {
    const f = this.facturas.get(id);
    if (!f) throw new NotFoundException(`Factura ${id} no encontrada`);
    return f;
  }

  async obtenerPdf(id: string): Promise<{ factura: FacturaSimuladaRegistro; pdf: Buffer }> {
    const factura = this.obtenerPorId(id);
    let pdf = this.pdfs.get(id);
    if (!pdf) {
      pdf = await generarPdfFacturaSimulada(factura);
      this.pdfs.set(id, pdf);
    }
    return { factura, pdf };
  }
}
