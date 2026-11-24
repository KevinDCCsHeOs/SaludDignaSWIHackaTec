import { Module } from '@nestjs/common';
import { AuditoriaModule } from './auditoria/auditoria.module';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { HealthController } from './health.controller';
import { IdentidadModule } from './identidad/identidad.module';
import { OtpModule } from './otp/otp.module';
import { PrivacidadModule } from './privacidad/privacidad.module';

@Module({
  imports: [
    CommonModule,
    PrivacidadModule,
    AuditoriaModule,
    IdentidadModule,
    OtpModule,
    AuthModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
