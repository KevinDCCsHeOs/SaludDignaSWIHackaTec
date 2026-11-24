import type { RolUsuario } from '@salud-digna/shared';

export type TipoDatoEnmascarable = 'curp' | 'email' | 'telefono' | 'fecha_nacimiento' | 'generico';

/**
 * Helper `mask()` para enmascarar datos sensibles o personales según tipo y rol (#10).
 */
export function mask(
  valor: string | null | undefined,
  tipo: TipoDatoEnmascarable = 'generico',
): string | null {
  if (!valor) return null;
  const limpio = valor.trim();
  if (!limpio) return null;

  switch (tipo) {
    case 'curp': {
      const ultimos = limpio.slice(-4);
      return `****${ultimos}`;
    }
    case 'email': {
      const [usuario, dominio] = limpio.split('@');
      if (!dominio) return '****';
      const inicial = usuario.slice(0, 1);
      return `${inicial}***@${dominio}`;
    }
    case 'telefono': {
      const digitos = limpio.replace(/\s+/g, '');
      const ultimos = digitos.slice(-4);
      const prefijo = digitos.startsWith('+') ? digitos.slice(0, 3) : '';
      return `${prefijo}******${ultimos}`;
    }
    case 'fecha_nacimiento':
      return '****-**-**';
    default: {
      if (limpio.length <= 4) return '****';
      return `****${limpio.slice(-4)}`;
    }
  }
}

export interface RegistroPacienteInterno {
  id: string;
  nombre: string;
  apellidos: string;
  email?: string | null;
  telefonoE164?: string | null;
  curp?: string | null;
  fechaNacimiento?: string | null;
  datosFiscales?: Record<string, unknown> | null;
  canalPreferido: string;
  idioma: string;
  region?: string | null;
  esDemo: boolean;
}

/**
 * Minimización y enmascarado por rol (#10): cada rol recibe únicamente los campos permitidos.
 * Nunca devuelve hashes internos ni secretos.
 */
export function proyectarPacientePorRol(
  paciente: RegistroPacienteInterno,
  rol: RolUsuario,
): Record<string, unknown> {
  const base = {
    id: paciente.id,
    nombre: paciente.nombre,
    apellidos: paciente.apellidos,
    canalPreferido: paciente.canalPreferido,
    idioma: paciente.idioma,
    region: paciente.region ?? null,
    esDemo: paciente.esDemo,
  };

  if (rol === 'paciente') {
    return {
      ...base,
      email: paciente.email ?? null,
      telefonoE164: paciente.telefonoE164 ?? null,
      curp: mask(paciente.curp, 'curp'),
      fechaNacimiento: paciente.fechaNacimiento ?? null,
    };
  }

  if (rol === 'asesor' || rol === 'asesor_pro') {
    return {
      ...base,
      email: mask(paciente.email, 'email'),
      telefonoE164: mask(paciente.telefonoE164, 'telefono'),
      curp: mask(paciente.curp, 'curp'),
      fechaNacimiento: mask(paciente.fechaNacimiento, 'fecha_nacimiento'),
    };
  }

  if (rol === 'asesor_ia') {
    // Minimización extrema para el LLM (ADR 0009): sin identificadores directos
    return {
      id: paciente.id,
      nombre: paciente.nombre,
      idioma: paciente.idioma,
      canalPreferido: paciente.canalPreferido,
      region: paciente.region ?? null,
    };
  }

  if (rol === 'medico' || rol === 'revisor_tecnico') {
    return {
      ...base,
      curp: mask(paciente.curp, 'curp'),
      fechaNacimiento: paciente.fechaNacimiento ?? null,
    };
  }

  // admin: vista operativa con identificadores enmascarados (no expone datos clínicos ni CURP plana)
  return {
    ...base,
    email: mask(paciente.email, 'email'),
    telefonoE164: mask(paciente.telefonoE164, 'telefono'),
    curp: mask(paciente.curp, 'curp'),
  };
}
