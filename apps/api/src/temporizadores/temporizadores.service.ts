import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { perfilPlazosDesdeEntorno } from '@salud-digna/shared';
import { OtpService } from '../otp/otp.service';
import { TramitesService } from '../tramites/tramites.service';

/** En exposición los relojes son de segundos: se revisa más seguido para que se vea a tiempo. */
const INTERVALO_MS = { produccion: 15_000, exposicion: 2_000 } as const;

/**
 * Temporizadores del traspaso v2 (sección 5): caducidad del canal propietario, horario apartado
 * y código de un solo uso. Cada vencimiento se registra con la hora del umbral y una llave de
 * idempotencia, de modo que revisar tarde o dos veces no cambia la trazabilidad.
 */
@Injectable()
export class TemporizadoresService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Temporizadores');
  private intervalo: NodeJS.Timeout | null = null;
  private revisando = false;

  constructor(
    private readonly tramites: TramitesService,
    private readonly otp: OtpService,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    const perfil = perfilPlazosDesdeEntorno(process.env.PLAZOS_PERFIL);
    this.intervalo = setInterval(() => {
      void this.revisar();
    }, INTERVALO_MS[perfil]);
    this.intervalo.unref();
    this.logger.log(`Temporizadores activos con plazos de ${perfil}`);
  }

  onModuleDestroy(): void {
    if (this.intervalo) clearInterval(this.intervalo);
  }

  /** Una pasada de revisión; también la usan las pruebas con un reloj simulado. */
  async revisar(ahora = Date.now()): Promise<number> {
    if (this.revisando) return 0;
    this.revisando = true;
    try {
      const tramites = await this.tramites.revisarVencimientos(ahora);
      const codigos = await this.otp.vencerCodigosPendientes(ahora);
      return tramites + codigos;
    } catch (error) {
      this.logger.error(`Fallo al revisar plazos: ${(error as Error).name}`);
      return 0;
    } finally {
      this.revisando = false;
    }
  }
}
