import { Global, Module } from '@nestjs/common';
import { CanalVerificadoGuard, OtpService } from './otp.service';
import { OtpController } from './otp.controller';

@Global()
@Module({
  controllers: [OtpController],
  providers: [OtpService, CanalVerificadoGuard],
  exports: [OtpService, CanalVerificadoGuard],
})
export class OtpModule {}
