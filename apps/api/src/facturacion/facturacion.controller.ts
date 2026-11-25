import { Body, Controller, Get, Param, Post, Put, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { z } from 'zod';
import { Auditar, Roles } from '../auth/decoradores';
import type { UsuarioAutenticado } from '../auth/guards';
import { AccesoPacienteService } from '../otp/acceso-paciente.service';
import {
  DatosFiscalesSchema,
  FacturacionService,
  SolicitarFacturaSchema,
} from './facturacion.service';

@Controller('facturacion')
export class FacturacionController {
  constructor(
    private readonly facturacion: FacturacionService,
    private readonly accesoPaciente: AccesoPacienteService,
  ) {}

  @Roles('paciente', 'asesor', 'asesor_pro', 'asesor_ia', 'admin')
  @Get('pacientes/:pacienteId/datos-fiscales')
  async obtenerDatosFiscales(
    @Param('pacienteId') pacienteId: string,
    @Req() req: Request & { usuario?: UsuarioAutenticado },
  ) {
    await this.accesoPaciente.verificar(req.usuario!, pacienteId, req.headers['x-canal']);
    const datos = this.facturacion.obtenerDatosFiscales(pacienteId);
    return { guardados: Boolean(datos), datosFiscales: datos };
  }

  @Roles('paciente', 'asesor', 'asesor_pro', 'asesor_ia', 'admin')
  @Auditar({ accion: 'actualizar', entidad: 'DatosFiscalesPaciente' })
  @Put('pacientes/:pacienteId/datos-fiscales')
  async guardarDatosFiscales(
    @Param('pacienteId') pacienteId: string,
    @Body() body: z.input<typeof DatosFiscalesSchema>,
    @Req() req: Request & { usuario?: UsuarioAutenticado },
  ) {
    await this.accesoPaciente.verificar(req.usuario!, pacienteId, req.headers['x-canal']);
    const datosFiscales = this.facturacion.guardarDatosFiscales(pacienteId, body, req.usuario!);
    return { guardados: true, datosFiscales };
  }

  @Roles('paciente', 'asesor', 'asesor_pro', 'asesor_ia', 'admin')
  @Auditar({ accion: 'crear', entidad: 'FacturaSimulada' })
  @Post('solicitar')
  async solicitar(
    @Body() body: z.input<typeof SolicitarFacturaSchema>,
    @Req() req: Request & { usuario?: UsuarioAutenticado },
  ) {
    await this.accesoPaciente.verificar(req.usuario!, body.pacienteId, req.headers['x-canal']);
    return this.facturacion.solicitarFactura(body, req.usuario!);
  }

  @Roles('paciente', 'asesor', 'asesor_pro', 'asesor_ia', 'admin')
  @Get('tramites/:folio')
  async consultarPorTramite(
    @Param('folio') folio: string,
    @Req() req: Request & { usuario?: UsuarioAutenticado },
  ) {
    const factura = this.facturacion.buscarPorTramite(folio);
    if (!factura) {
      return { existe: false, factura: null, pdfUrl: null };
    }
    await this.accesoPaciente.verificar(req.usuario!, factura.pacienteId, req.headers['x-canal']);
    return { existe: true, factura, pdfUrl: `/facturacion/${factura.id}/pdf` };
  }

  @Roles('paciente', 'asesor', 'asesor_pro', 'asesor_ia', 'admin')
  @Get('pacientes/:pacienteId')
  async listarPorPaciente(
    @Param('pacienteId') pacienteId: string,
    @Req() req: Request & { usuario?: UsuarioAutenticado },
  ) {
    await this.accesoPaciente.verificar(req.usuario!, pacienteId, req.headers['x-canal']);
    const facturas = this.facturacion.listarPorPaciente(pacienteId);
    return { total: facturas.length, facturas };
  }

  @Roles('paciente', 'asesor', 'asesor_pro', 'asesor_ia', 'admin')
  @Get(':id/pdf')
  async descargarPdf(
    @Param('id') id: string,
    @Req() req: Request & { usuario?: UsuarioAutenticado },
    @Res() res: Response,
  ) {
    const { factura, pdf } = await this.facturacion.obtenerPdf(id);
    await this.accesoPaciente.verificar(req.usuario!, factura.pacienteId, req.headers['x-canal']);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="factura-${factura.folioFiscalSimulado}.pdf"`,
    );
    res.send(pdf);
  }
}
