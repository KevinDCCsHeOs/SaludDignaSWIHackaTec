import { SetMetadata } from '@nestjs/common';
import type { AccionAuditoria, RolUsuario } from '@salud-digna/shared';
import type { PermisoSistema } from './permisos';

export const CLAVE_PUBLICO = 'sd:publico';
export const CLAVE_ROLES = 'sd:roles';
export const CLAVE_PERMISOS = 'sd:permisos';
export const CLAVE_AUDITAR = 'sd:auditar';
export const CLAVE_CANAL_VERIFICADO = 'sd:canal_verificado';

export interface ConfigAuditoriaDecorador {
  accion: AccionAuditoria;
  entidad: string;
}

export const Publico = () => SetMetadata(CLAVE_PUBLICO, true);
export const Roles = (...roles: RolUsuario[]) => SetMetadata(CLAVE_ROLES, roles);
export const Permisos = (...permisos: PermisoSistema[]) => SetMetadata(CLAVE_PERMISOS, permisos);
export const Auditar = (config: ConfigAuditoriaDecorador) => SetMetadata(CLAVE_AUDITAR, config);
export const RequiereCanalVerificado = () => SetMetadata(CLAVE_CANAL_VERIFICADO, true);
