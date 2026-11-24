import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import type { CanalAtencion } from '@salud-digna/shared';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { Permisos, Publico, Roles } from './decoradores';
import type { UsuarioAutenticado } from './guards';
import { RecuperacionAccesoService } from './recuperacion.service';

const NOMBRE_COOKIE_REFRESH = 'sd_refresh_token';
const MAX_AGE_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly recuperacionService: RecuperacionAccesoService,
  ) {}

  @Publico()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() body: { email: string; contrasena: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const canal = (req.headers['x-canal'] as CanalAtencion | undefined) ?? 'web';
    const resultado = await this.authService.login(body, req.ip ?? '127.0.0.1', canal);

    res.cookie(NOMBRE_COOKIE_REFRESH, resultado.refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: MAX_AGE_REFRESH_MS,
      path: '/auth',
    });

    return resultado;
  }

  @Publico()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(
    @Body() body: { refreshToken?: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokenCookie = req.cookies?.[NOMBRE_COOKIE_REFRESH] as string | undefined;
    const resultado = await this.authService.refresh(body?.refreshToken ?? tokenCookie ?? '');

    res.cookie(NOMBRE_COOKIE_REFRESH, resultado.refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: MAX_AGE_REFRESH_MS,
      path: '/auth',
    });

    return resultado;
  }

  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(
    @Body() body: { refreshToken?: string },
    @Req() req: Request & { usuario?: UsuarioAutenticado },
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokenCookie = req.cookies?.[NOMBRE_COOKIE_REFRESH] as string | undefined;
    const canal = (req.headers['x-canal'] as CanalAtencion | undefined) ?? 'web';
    const resultado = await this.authService.logout(
      body?.refreshToken ?? tokenCookie,
      req.usuario,
      canal,
      req.ip ?? '127.0.0.1',
    );
    res.clearCookie(NOMBRE_COOKIE_REFRESH, { path: '/auth' });
    return resultado;
  }

  @Get('me')
  me(@Req() req: Request & { usuario: UsuarioAutenticado }) {
    return this.authService.obtenerPerfil(req.usuario);
  }

  @Publico()
  @HttpCode(HttpStatus.OK)
  @Post('recuperar')
  solicitarRecuperacion(
    @Body() body: { email?: string; telefono?: string; canal?: CanalAtencion },
    @Req() req: Request,
  ) {
    return this.recuperacionService.solicitarRecuperacion(body, req.ip ?? '127.0.0.1');
  }

  @Publico()
  @HttpCode(HttpStatus.OK)
  @Post('restablecer')
  restablecerContrasena(
    @Body() body: { token: string; nuevaContrasena: string },
    @Req() req: Request,
  ) {
    const canal = (req.headers['x-canal'] as CanalAtencion | undefined) ?? 'web';
    return this.recuperacionService.restablecerContrasena(body, canal, req.ip ?? '127.0.0.1');
  }

  @Roles('asesor', 'asesor_pro', 'admin')
  @Permisos('auth:asistir_recuperacion')
  @HttpCode(HttpStatus.OK)
  @Post('asistir-recuperacion')
  asistirRecuperacion(
    @Body() body: { pacienteId: string; canal?: CanalAtencion },
    @Req() req: Request & { usuario: UsuarioAutenticado },
  ) {
    return this.recuperacionService.asistirDesdeAsesor(
      body,
      req.usuario.id,
      req.usuario.rol,
      req.ip ?? '127.0.0.1',
    );
  }
}
