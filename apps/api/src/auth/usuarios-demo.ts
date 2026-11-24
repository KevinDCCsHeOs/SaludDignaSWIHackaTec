import { Injectable } from '@nestjs/common';
import type { RolUsuario } from '@salud-digna/shared';
import bcrypt from 'bcryptjs';

export interface UsuarioAuthRegistro {
  id: string;
  email: string;
  nombre: string;
  passwordHash: string;
  rol: RolUsuario;
  region: string | null;
  activo: boolean;
  esDemo: boolean;
  pacienteId: string | null;
  ultimoAccesoEn: string | null;
}

export interface CredencialDemoSemilla {
  id: string;
  email: string;
  nombre: string;
  contrasenaDemo: string;
  rol: RolUsuario;
  region: string | null;
  pacienteId: string | null;
}

/**
 * Usuarios semilla ficticios por rol para desarrollo, pruebas y demo (#6, #17, #40).
 * Todos llevan `esDemo: true` y dominio ficticio `@demo.saluddigna.local`.
 */
export const USUARIOS_DEMO_SEMILLA: readonly CredencialDemoSemilla[] = [
  {
    id: 'usr_paciente_ana',
    email: 'ana.lopez@demo.saluddigna.local',
    nombre: 'Ana López (Demo)',
    contrasenaDemo: 'DemoPaciente2026!',
    rol: 'paciente',
    region: 'Puebla',
    pacienteId: 'pac_ana_demo',
  },
  {
    id: 'usr_asesor_ia',
    email: 'ia.bot@demo.saluddigna.local',
    nombre: 'Asistente Virtual IA (Demo)',
    contrasenaDemo: 'DemoIaSistema2026!',
    rol: 'asesor_ia',
    region: null,
    pacienteId: null,
  },
  {
    id: 'usr_asesor_01',
    email: 'asesor.puebla@demo.saluddigna.local',
    nombre: 'Carlos Méndez (Asesor Demo)',
    contrasenaDemo: 'DemoAsesor2026!',
    rol: 'asesor',
    region: 'Puebla',
    pacienteId: null,
  },
  {
    id: 'usr_asesor_pro_01',
    email: 'asesor.pro@demo.saluddigna.local',
    nombre: 'Laura Salas (Asesor Pro Demo)',
    contrasenaDemo: 'DemoAsesorPro2026!',
    rol: 'asesor_pro',
    region: 'Puebla',
    pacienteId: null,
  },
  {
    id: 'usr_medico_01',
    email: 'medico.puebla@demo.saluddigna.local',
    nombre: 'Dr. Javier Ruiz (Médico Demo)',
    contrasenaDemo: 'DemoMedico2026!',
    rol: 'medico',
    region: 'Puebla',
    pacienteId: null,
  },
  {
    id: 'usr_revisor_01',
    email: 'revisor.lab@demo.saluddigna.local',
    nombre: 'QFB Sofía Torres (Revisor Demo)',
    contrasenaDemo: 'DemoRevisor2026!',
    rol: 'revisor_tecnico',
    region: 'Puebla',
    pacienteId: null,
  },
  {
    id: 'usr_admin_01',
    email: 'admin@demo.saluddigna.local',
    nombre: 'Admin Omnicanal (Demo)',
    contrasenaDemo: 'DemoAdmin2026!',
    rol: 'admin',
    region: null,
    pacienteId: null,
  },
  // Asesores adicionales para el balanceo de carga por región de los tickets (#16)
  {
    id: 'usr_asesor_02',
    email: 'asesor2.puebla@demo.saluddigna.local',
    nombre: 'Mariana Cruz (Asesor Demo)',
    contrasenaDemo: 'DemoAsesor2026!',
    rol: 'asesor',
    region: 'Puebla',
    pacienteId: null,
  },
  {
    id: 'usr_asesor_cdmx_01',
    email: 'asesor.cdmx@demo.saluddigna.local',
    nombre: 'Jorge Pineda (Asesor Demo)',
    contrasenaDemo: 'DemoAsesor2026!',
    rol: 'asesor',
    region: 'CDMX',
    pacienteId: null,
  },
  {
    id: 'usr_asesor_pro_cdmx_01',
    email: 'asesor.pro.cdmx@demo.saluddigna.local',
    nombre: 'Elena Ríos (Asesor Pro Demo)',
    contrasenaDemo: 'DemoAsesorPro2026!',
    rol: 'asesor_pro',
    region: 'CDMX',
    pacienteId: null,
  },
  {
    id: 'usr_asesor_mty_01',
    email: 'asesor.mty@demo.saluddigna.local',
    nombre: 'Raúl Garza (Asesor Demo)',
    contrasenaDemo: 'DemoAsesor2026!',
    rol: 'asesor',
    region: 'Monterrey',
    pacienteId: null,
  },
  {
    id: 'usr_asesor_pro_mty_01',
    email: 'asesor.pro.mty@demo.saluddigna.local',
    nombre: 'Paola Treviño (Asesor Pro Demo)',
    contrasenaDemo: 'DemoAsesorPro2026!',
    rol: 'asesor_pro',
    region: 'Monterrey',
    pacienteId: null,
  },
] as const;

const COSTO_BCRYPT = process.env.NODE_ENV === 'test' ? 4 : 10;

@Injectable()
export class UsuarioAuthStoreService {
  private readonly usuarios = new Map<string, UsuarioAuthRegistro>();

  constructor() {
    this.sembrarDemo();
  }

  sembrarDemo(): void {
    this.usuarios.clear();
    for (const u of USUARIOS_DEMO_SEMILLA) {
      const hash = bcrypt.hashSync(u.contrasenaDemo, COSTO_BCRYPT);
      this.usuarios.set(u.id, {
        id: u.id,
        email: u.email.toLowerCase(),
        nombre: u.nombre,
        passwordHash: hash,
        rol: u.rol,
        region: u.region,
        activo: true,
        esDemo: true,
        pacienteId: u.pacienteId,
        ultimoAccesoEn: null,
      });
    }
  }

  buscarPorEmail(email: string): UsuarioAuthRegistro | undefined {
    const normalizado = email.trim().toLowerCase();
    for (const u of this.usuarios.values()) {
      if (u.email === normalizado) return u;
    }
    return undefined;
  }

  buscarPorId(id: string): UsuarioAuthRegistro | undefined {
    return this.usuarios.get(id);
  }

  buscarPorPacienteId(pacienteId: string): UsuarioAuthRegistro | undefined {
    for (const u of this.usuarios.values()) {
      if (u.pacienteId === pacienteId) return u;
    }
    return undefined;
  }

  async actualizarContrasena(usuarioId: string, nuevaContrasena: string): Promise<void> {
    const usuario = this.usuarios.get(usuarioId);
    if (!usuario) return;
    usuario.passwordHash = await bcrypt.hash(nuevaContrasena, COSTO_BCRYPT);
  }

  registrarUltimoAcceso(usuarioId: string): void {
    const usuario = this.usuarios.get(usuarioId);
    if (usuario) {
      usuario.ultimoAccesoEn = new Date().toISOString();
    }
  }
}
