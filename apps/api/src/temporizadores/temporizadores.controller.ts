import { BadRequestException, Body, Controller, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../auth/decoradores';
import type { UsuarioAutenticado } from '../auth/guards';
import { EventPublisherService } from '../common/eventos/event-publisher.service';
import { TramitesService, esEstadoTerminal } from '../tramites/tramites.service';

const InactividadSchema = z.object({
  pacienteId: z.string().min(1).max(36),
  tipo: z.enum(['aviso', 'cierre']),
  /** Hora del umbral: último mensaje + plazo, aunque el bot lo detecte después. */
  ocurridoEn: z.string().datetime({ offset: true }),
  inactivoSegundos: z.number().int().nonnegative(),
  cierreEnSegundos: z.number().int().nonnegative(),
  perfilPlazos: z.enum(['produccion', 'exposicion']),
});

/**
 * El bot detecta la inactividad de la conversación y la reporta aquí (v2): el núcleo registra el
 * aviso y, al cierre, pausa el trámite conservando todo. Se cierra la conversación, no el trámite.
 */
@Controller('sesiones')
export class TemporizadoresController {
  constructor(
    private readonly tramites: TramitesService,
    private readonly eventos: EventPublisherService,
  ) {}

  @Roles('asesor_ia')
  @Post('inactividad')
  async inactividad(@Body() body: unknown, @Req() req: { usuario: UsuarioAutenticado }) {
    const parsed = InactividadSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        mensaje: 'Reporte de inactividad inválido',
        errores: parsed.error.flatten().fieldErrors,
      });
    }
    const d = parsed.data;
    const tramite = this.tramites.obtenerActivoDePaciente(d.pacienteId);
    const llaveBase = `${d.pacienteId}:${d.ocurridoEn}`;

    if (d.tipo === 'aviso') {
      await this.eventos.publicar({
        tipo: 'sesion.aviso_inactividad',
        version: 1,
        pacienteId: d.pacienteId,
        tramiteId: tramite?.id ?? null,
        canal: 'whatsapp',
        actor: { tipo: 'sistema', id: 'temporizadores' },
        rolActor: 'sistema',
        ocurridoEn: d.ocurridoEn,
        llaveIdempotencia: `sesion.aviso_inactividad:${llaveBase}`,
        datos: {
          canalConversacion: 'whatsapp',
          inactivoSegundos: d.inactivoSegundos,
          cierreEnSegundos: d.cierreEnSegundos,
          perfilPlazos: d.perfilPlazos,
        },
      });
      return { registrado: 'aviso', tramiteId: tramite?.id ?? null };
    }

    // Cierre: pausar el trámite activo (si se puede) con la hora del umbral
    if (!tramite || esEstadoTerminal(tramite.estado) || tramite.estado === 'pausado') {
      return { registrado: 'cierre', pausado: false, tramiteId: tramite?.id ?? null };
    }
    try {
      await this.tramites.pausar(
        tramite.id,
        {
          canal: 'whatsapp',
          motivo: 'Conversación cerrada por inactividad; el avance se conserva',
        },
        { tipo: 'sistema', id: `temporizadores:${req.usuario.id}` },
        { ocurridoEn: d.ocurridoEn },
      );
      return { registrado: 'cierre', pausado: true, tramiteId: tramite.id };
    } catch {
      // La máquina de estados no permite pausar desde este estado: la conversación se cierra igual
      return { registrado: 'cierre', pausado: false, tramiteId: tramite.id };
    }
  }
}
