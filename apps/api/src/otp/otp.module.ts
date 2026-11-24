import { Global, Module } from '@nestjs/common';
import { AccesoPacienteService } from './acceso-paciente.service';
import { CanalVerificadoGuard, OtpService } from './otp.service';
import { OtpController } from './otp.controller';

@Global()
@Module({
  controllers: [OtpController],
  providers: [OtpService, CanalVerificadoGuard, AccesoPacienteService],
  exports: [OtpService, CanalVerificadoGuard, AccesoPacienteService],
})
export class OtpModule {}
