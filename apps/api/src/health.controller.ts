import { Controller, Get } from '@nestjs/common';
import { CANALES_ATENCION, ESTADOS_TRAMITE, TIPOS_EVENTO } from '@salud-digna/shared';
import { Publico } from './auth/decoradores';

export interface ApiHealthStatus {
  servicio: 'api';
  estado: 'ok';
  canalesSoportados: readonly string[];
  estadosTramite: number;
  eventosCatalogo: number;
  timestamp: string;
}

export function crearEstadoSaludApi(): ApiHealthStatus {
  return {
    servicio: 'api',
    estado: 'ok',
    canalesSoportados: CANALES_ATENCION,
    estadosTramite: ESTADOS_TRAMITE.length,
    eventosCatalogo: TIPOS_EVENTO.length,
    timestamp: new Date().toISOString(),
  };
}

@Controller()
export class HealthController {
  @Publico()
  @Get('health')
  obtenerSalud(): ApiHealthStatus {
    return crearEstadoSaludApi();
  }
}
