import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { EstatusResultado, RolUsuario } from '@salud-digna/shared';
import { z } from 'zod';
import { AuditoriaService } from '../auditoria/auditoria.service';
import type { UsuarioAutenticado } from '../auth/guards';
import { CanalesService } from '../canales/canales.service';
import { CatalogosService } from '../catalogos/catalogos.service';
import { EventBusService } from '../eventos/event-bus.service';
import { IdentityResolverService } from '../identidad/identidad.service';
import { TramitesService } from '../tramites/tramites.service';

export interface ResultadoRegistro {
  id: string;
  tramiteId: string;
  folioTramite: string;
  pacienteId: string;
  estudioId: string;
  estudioNombre: string;
  estado: EstatusResultado;
  resumenClinico: string;
  valores: Array<{ parametro: string; valor: string; referencia: string }>;
  revisadoPorId: string | null;
  revisadoEn: string | null;
  validadoPorId: string | null;
  validadoEn: string | null;
  liberadoEn: string | null;
  motivoRechazo: string | null;
  pdfGenerado: boolean;
  esDemo: boolean;
  creadoEn: string;
  actualizadoEn: string;
}

export interface MensajeMedicoPaciente {
  id: string;
  resultadoId: string;
  pacienteId: string;
  emisorId: string;
  emisorRol: RolUsuario;
  emisorNombre: string;
  contenido: string;
  tiempoEsperadoRespuestaMinutos: number;
  creadoEn: string;
}

export const CrearResultadoSchema = z.object({
  tramiteId: z.string().min(1).max(36),
  pacienteId: z.string().min(1).max(36),
  estudioId: z.string().min(1).max(36),
  resumenClinico: z.string().min(5).max(1000),
  valores: z
    .array(
      z.object({
        parametro: z.string().min(1).max(80),
        valor: z.string().min(1).max(80),
        referencia: z.string().min(1).max(80),
      }),
    )
    .default([]),
});

export const DecisionResultadoSchema = z.object({
  aprobado: z.boolean().default(true),
  observaciones: z.string().max(500).optional(),
  motivoRechazo: z.string().min(3).max(500).optional(),
});

export const MensajeMedicoSchema = z.object({
  contenido: z.string().min(2).max(1000),
  urgente: z.boolean().default(false),
});

function escaparPdfTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

/**
 * Genera un PDF 1.4 válido de resultado de ejemplo (datos 100% ficticios, #30).
 */
export function generarPdfResultadoDemo(resultado: ResultadoRegistro): Buffer {
  const lineas = [
    'SALUD DIGNA OMNICANAL - RESULTADO CLINICO DEMO (DATOS FICTICIOS)',
    `Folio tramite: ${resultado.folioTramite} | ID Resultado: ${resultado.id}`,
    `Estudio: ${resultado.estudioNombre}`,
    `Estado: ${resultado.estado.toUpperCase()} | Liberado: ${resultado.liberadoEn ?? 'pendiente'}`,
    `Validado por medico ID: ${resultado.validadoPorId ?? 'N/A'}`,
    `Resumen: ${resultado.resumenClinico.slice(0, 90)}`,
    ...resultado.valores.map((v) => `- ${v.parametro}: ${v.valor} (Ref: ${v.referencia})`),
    'Aviso: Documento demostrativo ficticio (esDemo=true). Consulte siempre a su medico.',
  ];

  const comandosTexto = [
    'BT',
    '/F1 11 Tf',
    '50 760 Td',
    '16 TL',
    ...lineas.map((l, i) => `${i === 0 ? '' : 'T* '}(${escaparPdfTexto(l)}) Tj`),
    'ET',
  ].join('\n');

  const objetos = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
    `4 0 obj << /Length ${Buffer.byteLength(comandosTexto, 'utf8')} >> stream\n${comandosTexto}\nendstream endobj`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objetos) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${obj}\n`;
  }
  const xrefPos = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return Buffer.from(pdf, 'utf8');
}

/**
 * Jerarquía oficial de liberación de resultados clínicos (#30):
 * `captura` -> `revision_tecnica` -> `validacion_medica` -> `liberado` (o `rechazado`).
 * Un paciente NUNCA puede ver ni descargar un resultado antes de estar `liberado`.
 */
@Injectable()
export class ResultadosService {
  private readonly resultados = new Map<string, ResultadoRegistro>();
  private readonly mensajesPorResultado = new Map<string, MensajeMedicoPaciente[]>();

  constructor(
    private readonly catalogos: CatalogosService,
    private readonly tramites: TramitesService,
    private readonly identidad: IdentityResolverService,
    private readonly eventBus: EventBusService,
    private readonly auditoria: AuditoriaService,
    private readonly canales: CanalesService,
  ) {
    this.sembrarDemo();
  }

  private sembrarDemo(): void {
    const ahora = new Date().toISOString();
    const inicial: ResultadoRegistro[] = [
      {
        id: 'res_demo_captura_01',
        tramiteId: 'trm_demo_lab_01',
        folioTramite: 'SD-2026-000101',
        pacienteId: 'pac_ana_demo',
        estudioId: 'est_lab_bh',
        estudioNombre: 'Biometría hemática completa',
        estado: 'captura',
        resumenClinico: 'Muestra procesada en equipo demo; valores dentro de rango de referencia.',
        valores: [
          { parametro: 'Hemoglobina', valor: '13.8 g/dL', referencia: '12.0 - 16.0 g/dL' },
          { parametro: 'Leucocitos', valor: '6.4 x10^3/uL', referencia: '4.5 - 11.0 x10^3/uL' },
          { parametro: 'Plaquetas', valor: '245 x10^3/uL', referencia: '150 - 450 x10^3/uL' },
        ],
        revisadoPorId: null,
        revisadoEn: null,
        validadoPorId: null,
        validadoEn: null,
        liberadoEn: null,
        motivoRechazo: null,
        pdfGenerado: false,
        esDemo: true,
        creadoEn: ahora,
        actualizadoEn: ahora,
      },
      {
        id: 'res_demo_revision_02',
        tramiteId: 'trm_demo_us_02',
        folioTramite: 'SD-2026-000102',
        pacienteId: 'pac_ana_demo',
        estudioId: 'est_us_abd',
        estudioNombre: 'Ultrasonido abdominal',
        estado: 'revision_tecnica',
        resumenClinico:
          'Imágenes técnicas verificadas con calidad óptima; listo para validación médica.',
        valores: [
          { parametro: 'Hígado', valor: 'Tamaño y ecogenicidad conservados', referencia: 'Normal' },
          { parametro: 'Vesícula biliar', valor: 'Sin litos visibles', referencia: 'Normal' },
        ],
        revisadoPorId: 'usr_revisor_01',
        revisadoEn: ahora,
        validadoPorId: null,
        validadoEn: null,
        liberadoEn: null,
        motivoRechazo: null,
        pdfGenerado: false,
        esDemo: true,
        creadoEn: ahora,
        actualizadoEn: ahora,
      },
    ];

    for (const r of inicial) {
      this.resultados.set(r.id, r);
    }
  }

  crear(
    entrada: z.input<typeof CrearResultadoSchema>,
    actor: UsuarioAutenticado,
  ): ResultadoRegistro {
    const parsed = CrearResultadoSchema.safeParse(entrada);
    if (!parsed.success) {
      throw new BadRequestException({
        mensaje: 'Datos inválidos para capturar resultado',
        errores: parsed.error.flatten().fieldErrors,
      });
    }
    const d = parsed.data;
    const estudio = this.catalogos.obtenerEstudioPorId(d.estudioId);
    let folioTramite = d.tramiteId;
    try {
      folioTramite = this.tramites.obtenerPorIdOFolio(d.tramiteId).folio;
    } catch {
      // Permite registrar resultados demo vinculados a folios previos
    }
    const ahora = new Date().toISOString();
    const registro: ResultadoRegistro = {
      id: `res_${randomUUID().slice(0, 10)}`,
      tramiteId: d.tramiteId,
      folioTramite,
      pacienteId: d.pacienteId,
      estudioId: estudio.id,
      estudioNombre: estudio.nombre,
      estado: 'captura',
      resumenClinico: d.resumenClinico,
      valores: d.valores,
      revisadoPorId: null,
      revisadoEn: null,
      validadoPorId: null,
      validadoEn: null,
      liberadoEn: null,
      motivoRechazo: null,
      pdfGenerado: false,
      esDemo: true,
      creadoEn: ahora,
      actualizadoEn: ahora,
    };
    this.resultados.set(registro.id, registro);
    void this.auditoria.registrar({
      usuarioId: actor.id,
      rol: actor.rol,
      accion: 'crear',
      entidad: 'Resultado',
      entidadId: registro.id,
      pacienteId: registro.pacienteId,
      canal: 'web',
      exitoso: true,
      detalleSinPii: { estado: registro.estado, estudioId: registro.estudioId },
    });
    return registro;
  }

  /**
   * Lista resultados respetando estrictamente la visibilidad por rol (#30):
   * - `paciente`: SOLO sus propios resultados en estado `liberado`.
   */
  listarPorUsuario(
    usuario: UsuarioAutenticado,
    filtros?: { estado?: EstatusResultado; pacienteId?: string },
  ): ResultadoRegistro[] {
    return [...this.resultados.values()]
      .filter((r) => {
        if (usuario.rol === 'paciente') {
          return r.pacienteId === usuario.pacienteId && r.estado === 'liberado';
        }
        if (filtros?.estado && r.estado !== filtros.estado) return false;
        if (filtros?.pacienteId && r.pacienteId !== filtros.pacienteId) return false;
        return true;
      })
      .sort((a, b) => Date.parse(b.actualizadoEn) - Date.parse(a.actualizadoEn));
  }

  listarTodosInterno(): ResultadoRegistro[] {
    return [...this.resultados.values()];
  }

  buscarPorTramiteId(tramiteId: string): ResultadoRegistro | undefined {
    for (const r of this.resultados.values()) {
      if (r.tramiteId === tramiteId || r.folioTramite === tramiteId) {
        return r;
      }
    }
    return undefined;
  }

  obtenerParaUsuario(id: string, usuario: UsuarioAutenticado): ResultadoRegistro {
    const r = this.resultados.get(id);
    if (!r) throw new NotFoundException(`Resultado ${id} no encontrado`);
    if (usuario.rol === 'paciente') {
      if (r.pacienteId !== usuario.pacienteId || r.estado !== 'liberado') {
        throw new ForbiddenException(
          'El resultado aún no ha sido liberado tras validación médica o no pertenece a tu cuenta.',
        );
      }
    }
    return r;
  }

  async revisarTecnica(
    id: string,
    entrada: z.input<typeof DecisionResultadoSchema>,
    actor: UsuarioAutenticado,
    ip = '127.0.0.1',
  ): Promise<ResultadoRegistro> {
    const parsed = DecisionResultadoSchema.safeParse(entrada);
    if (!parsed.success) {
      throw new BadRequestException('Datos inválidos para revisión técnica');
    }
    const r = this.resultados.get(id);
    if (!r) throw new NotFoundException(`Resultado ${id} no encontrado`);
    if (r.estado !== 'captura' && r.estado !== 'rechazado') {
      throw new ConflictException(
        `Solo se puede revisar técnicamente un resultado en estado captura/rechazado (actual: ${r.estado})`,
      );
    }

    const ahora = new Date().toISOString();
    r.revisadoPorId = actor.id;
    r.revisadoEn = ahora;
    r.actualizadoEn = ahora;
    if (parsed.data.aprobado) {
      r.estado = 'revision_tecnica';
      r.motivoRechazo = null;
    } else {
      if (!parsed.data.motivoRechazo) {
        throw new BadRequestException('Indica el motivo de rechazo técnico');
      }
      r.estado = 'rechazado';
      r.motivoRechazo = parsed.data.motivoRechazo;
    }

    await this.auditoria.registrar({
      usuarioId: actor.id,
      rol: actor.rol,
      accion: 'actualizar',
      entidad: 'ResultadoRevisionTecnica',
      entidadId: r.id,
      pacienteId: r.pacienteId,
      canal: 'web',
      ip,
      exitoso: true,
      detalleSinPii: { estadoNuevo: r.estado, aprobado: parsed.data.aprobado },
    });

    return r;
  }

  async validarMedica(
    id: string,
    entrada: z.input<typeof DecisionResultadoSchema>,
    actor: UsuarioAutenticado,
    ip = '127.0.0.1',
  ): Promise<ResultadoRegistro> {
    const parsed = DecisionResultadoSchema.safeParse(entrada);
    if (!parsed.success) {
      throw new BadRequestException('Datos inválidos para validación médica');
    }
    const r = this.resultados.get(id);
    if (!r) throw new NotFoundException(`Resultado ${id} no encontrado`);
    if (r.estado !== 'revision_tecnica') {
      throw new ConflictException(
        `El resultado debe aprobar revisión técnica antes de validación médica (estado actual: ${r.estado})`,
      );
    }

    const ahora = new Date().toISOString();
    r.validadoPorId = actor.id;
    r.validadoEn = ahora;
    r.actualizadoEn = ahora;
    if (parsed.data.aprobado) {
      r.estado = 'validacion_medica';
      r.motivoRechazo = null;
    } else {
      if (!parsed.data.motivoRechazo) {
        throw new BadRequestException('Indica el motivo de rechazo médico');
      }
      r.estado = 'rechazado';
      r.motivoRechazo = parsed.data.motivoRechazo;
    }

    await this.auditoria.registrar({
      usuarioId: actor.id,
      rol: actor.rol,
      accion: 'actualizar',
      entidad: 'ResultadoValidacionMedica',
      entidadId: r.id,
      pacienteId: r.pacienteId,
      canal: 'web',
      ip,
      exitoso: true,
      detalleSinPii: { estadoNuevo: r.estado, aprobado: parsed.data.aprobado },
    });

    return r;
  }

  async liberar(
    id: string,
    actor: UsuarioAutenticado,
    ip = '127.0.0.1',
  ): Promise<{
    resultado: ResultadoRegistro;
    canalNotificacion: string;
    pdfUrl: string;
  }> {
    const r = this.resultados.get(id);
    if (!r) throw new NotFoundException(`Resultado ${id} no encontrado`);
    if (r.estado !== 'validacion_medica') {
      throw new ConflictException(
        `Solo se puede liberar un resultado tras validación médica (estado actual: ${r.estado})`,
      );
    }

    const ahora = new Date().toISOString();
    r.estado = 'liberado';
    r.liberadoEn = ahora;
    r.pdfGenerado = true;
    r.actualizadoEn = ahora;

    let canalPreferido: 'whatsapp' | 'app' | 'web' | 'email' | 'call_center' = 'whatsapp';
    try {
      const perfil = this.identidad.obtenerPerfilMinimizado(r.pacienteId, 'admin');
      if (
        perfil.canalPreferido === 'whatsapp' ||
        perfil.canalPreferido === 'app' ||
        perfil.canalPreferido === 'web' ||
        perfil.canalPreferido === 'email' ||
        perfil.canalPreferido === 'call_center'
      ) {
        canalPreferido = perfil.canalPreferido;
      }
    } catch {
      // Usa whatsapp por defecto
    }

    await this.auditoria.registrar({
      usuarioId: actor.id,
      rol: actor.rol,
      accion: 'liberar_resultado',
      entidad: 'Resultado',
      entidadId: r.id,
      pacienteId: r.pacienteId,
      canal: 'web',
      ip,
      exitoso: true,
      detalleSinPii: { estudioId: r.estudioId, canalNotificacion: canalPreferido },
    });

    await this.eventBus.publish({
      tipo: 'resultado.liberado',
      version: 1,
      pacienteId: r.pacienteId,
      tramiteId: r.tramiteId,
      canal: canalPreferido,
      actor: { tipo: actor.rol === 'admin' ? 'admin' : 'medico', id: actor.id },
      datos: {
        resultadoId: r.id,
        estudioId: r.estudioId,
        validadoPorId: r.validadoPorId ?? actor.id,
        canalNotificacion: canalPreferido,
      },
    });

    await this.canales
      .registrarInteraccionCanal({
        pacienteId: r.pacienteId,
        tramiteId: r.tramiteId,
        canal: canalPreferido,
        actorTipo: 'sistema',
        actorId: 'notificador-resultados',
        resumen: `Notificación de resultado liberado (${r.estudioNombre}) enviada por ${canalPreferido}`,
        referenciaExterna: `notif_res_${r.id}`,
        metadatos: { resultadoId: r.id, canalNotificacion: canalPreferido },
      })
      .catch(() => undefined);

    return {
      resultado: r,
      canalNotificacion: canalPreferido,
      pdfUrl: `/resultados/${r.id}/pdf`,
    };
  }

  generarPdfParaUsuario(id: string, usuario: UsuarioAutenticado): Buffer {
    const r = this.obtenerParaUsuario(id, usuario);
    if (r.estado !== 'liberado') {
      throw new ForbiddenException('El PDF solo está disponible cuando el resultado fue liberado.');
    }
    return generarPdfResultadoDemo(r);
  }

  listarMensajes(resultadoId: string, usuario: UsuarioAutenticado): MensajeMedicoPaciente[] {
    this.obtenerParaUsuario(resultadoId, usuario);
    return [...(this.mensajesPorResultado.get(resultadoId) ?? [])];
  }

  async enviarMensaje(
    resultadoId: string,
    entrada: z.input<typeof MensajeMedicoSchema>,
    usuario: UsuarioAutenticado,
  ): Promise<MensajeMedicoPaciente> {
    const parsed = MensajeMedicoSchema.safeParse(entrada);
    if (!parsed.success) {
      throw new BadRequestException('Mensaje inválido');
    }
    const r = this.obtenerParaUsuario(resultadoId, usuario);
    const tiempoEsperadoRespuestaMinutos =
      usuario.rol === 'medico' ? 0 : parsed.data.urgente ? 15 : 30;

    const mensaje: MensajeMedicoPaciente = {
      id: `msg_${randomUUID().slice(0, 10)}`,
      resultadoId: r.id,
      pacienteId: r.pacienteId,
      emisorId: usuario.id,
      emisorRol: usuario.rol,
      emisorNombre: usuario.rol === 'medico' ? 'Médico validador' : 'Paciente',
      contenido: parsed.data.contenido,
      tiempoEsperadoRespuestaMinutos,
      creadoEn: new Date().toISOString(),
    };
    const lista = this.mensajesPorResultado.get(r.id) ?? [];
    lista.push(mensaje);
    this.mensajesPorResultado.set(r.id, lista);

    await this.auditoria.registrar({
      usuarioId: usuario.id,
      rol: usuario.rol,
      accion: 'crear',
      entidad: 'MensajeMedicoPaciente',
      entidadId: mensaje.id,
      pacienteId: r.pacienteId,
      canal: 'web',
      exitoso: true,
      detalleSinPii: { resultadoId: r.id, tiempoEsperadoRespuestaMinutos },
    });

    return mensaje;
  }

  contarMensajesPendientesDeMedico(): number {
    let pendientes = 0;
    for (const lista of this.mensajesPorResultado.values()) {
      const ultimo = lista.at(-1);
      if (ultimo && ultimo.emisorRol === 'paciente') pendientes += 1;
    }
    return pendientes;
  }
}
