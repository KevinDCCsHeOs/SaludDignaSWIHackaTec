import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard, PermissionsGuard, RolesGuard } from './guards';
import { RecuperacionAccesoService } from './recuperacion.service';
import { UsuarioAuthStoreService } from './usuarios-demo';

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    UsuarioAuthStoreService,
    AuthService,
    RecuperacionAccesoService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [UsuarioAuthStoreService, AuthService, RecuperacionAccesoService],
})
export class AuthModule {}
