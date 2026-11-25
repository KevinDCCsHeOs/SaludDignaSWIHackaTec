import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common';
import {
  RUTAS_POR_RIESGO,
  SOLICITUDES_RIESGO,
  evaluarRutaPorRiesgo,
  type IdSolicitudRiesgo,
} from '@salud-digna/shared';
import { z } from 'zod';

const IDS_SOLICITUD = SOLICITUDES_RIESGO.map((s) => s.id) as [
  IdSolicitudRiesgo,
  ...IdSolicitudRiesgo[],
];

const EvaluarRutaSchema = z.object({
  solicitud: z.enum(IDS_SOLICITUD),
  permiso: z.enum(['si', 'no', 'condicionado', 'tras_registro']).optional(),
  identidadVerificada: z.boolean().optional(),
  estres: z.boolean().optional(),
  otraLengua: z.boolean().optional(),
  urgenciaPorResultado: z.boolean().optional(),
});

/**
 * Árbol de decisión del caso LC-01 (traspaso v2): las reglas viven en el núcleo y cualquier canal
 * (bot, web, consola) obtiene la misma ruta para la misma solicitud. Solo calcula; no escribe.
 */
@Controller('enrutamiento')
export class EnrutamientoController {
  @Get('catalogo')
  catalogo() {
    return { solicitudes: SOLICITUDES_RIESGO, rutas: RUTAS_POR_RIESGO };
  }

  @Post('evaluar')
  evaluar(@Body() body: unknown) {
    const parsed = EvaluarRutaSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        mensaje: 'Solicitud de enrutamiento inválida',
        errores: parsed.error.flatten().fieldErrors,
      });
    }
    return evaluarRutaPorRiesgo(parsed.data);
  }
}
