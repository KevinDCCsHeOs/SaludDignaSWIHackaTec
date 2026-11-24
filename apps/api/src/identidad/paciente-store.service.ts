import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { CanalAtencion, IdiomaPaciente } from '@salud-digna/shared';
import { CifradoService } from '../privacidad/cifrado.service';

export interface PacienteRegistro {
  id: string;
  nombre: string;
  apellidos: string;
  fechaNacCifrada: string | null;
  curpCifrado: string | null;
  curpHash: string | null;
  datosFiscalesCifrados: string | null;
  email: string | null;
  telefonoE164: string | null;
  canalPreferido: CanalAtencion;
  idioma: IdiomaPaciente;
  region: string | null;
  esDemo: boolean;
  usuarioId: string | null;
  fusionadoEnId: string | null;
  creadoEn: string;
}

export interface IdentidadCanalRegistro {
  id: string;
  pacienteId: string;
  canal: CanalAtencion;
  identificador: string;
  verificadoEn: string | null;
  metodoVerificacion: string | null;
  esPrincipal: boolean;
  creadoEn: string;
}

/**
 * Repositorio en memoria (con semilla demo ficticia de Ana López) preparado para
 * respaldarse con `PrismaService` cuando la BD MySQL esté conectada.
 */
@Injectable()
export class PacienteStoreService {
  private readonly pacientes = new Map<string, PacienteRegistro>();
  private readonly identidades: IdentidadCanalRegistro[] = [];

  constructor(private readonly cifrado: CifradoService) {
    this.sembrarDemo();
  }

  sembrarDemo(): void {
    this.pacientes.clear();
    this.identidades.length = 0;

    const curpDemoAna = 'LOPA950412MPLRZN04';
    const ana: PacienteRegistro = {
      id: 'pac_ana_demo',
      nombre: 'Ana',
      apellidos: 'López Demo',
      fechaNacCifrada: this.cifrado.cifrar('1995-04-12'),
      curpCifrado: this.cifrado.cifrar(curpDemoAna),
      curpHash: this.cifrado.hashCurp(curpDemoAna),
      datosFiscalesCifrados: null,
      email: 'ana.lopez@demo.saluddigna.local',
      telefonoE164: '+522221234567',
      canalPreferido: 'whatsapp',
      idioma: 'es',
      region: 'Puebla',
      esDemo: true,
      usuarioId: 'usr_paciente_ana',
      fusionadoEnId: null,
      creadoEn: '2026-11-24T10:10:00.000Z',
    };
    this.pacientes.set(ana.id, ana);

    // Ana inició su cotización en la Web; aún NO ha vinculado WhatsApp (escenario del demo)
    this.identidades.push({
      id: 'idc_web_ana_demo',
      pacienteId: ana.id,
      canal: 'web',
      identificador: 'ana.lopez@demo.saluddigna.local',
      verificadoEn: '2026-11-24T10:10:00.000Z',
      metodoVerificacion: 'login_password',
      esPrincipal: true,
      creadoEn: '2026-11-24T10:10:00.000Z',
    });
  }

  buscarPorId(id: string): PacienteRegistro | undefined {
    const p = this.pacientes.get(id);
    if (!p) return undefined;
    return p.fusionadoEnId ? this.pacientes.get(p.fusionadoEnId) : p;
  }

  buscarIdentidadCanal(
    canal: CanalAtencion,
    identificador: string,
  ): IdentidadCanalRegistro | undefined {
    return this.identidades.find((i) => i.canal === canal && i.identificador === identificador);
  }

  listarIdentidadesDePaciente(pacienteId: string): IdentidadCanalRegistro[] {
    return this.identidades.filter((i) => i.pacienteId === pacienteId);
  }

  buscarPacientesPorTelefono(telefonoE164: string): PacienteRegistro[] {
    return [...this.pacientes.values()].filter(
      (p) => !p.fusionadoEnId && p.telefonoE164 === telefonoE164,
    );
  }

  buscarPacientesPorEmail(email: string): PacienteRegistro[] {
    const norm = email.trim().toLowerCase();
    return [...this.pacientes.values()].filter((p) => !p.fusionadoEnId && p.email === norm);
  }

  buscarPacientesPorCurpHash(curpHash: string): PacienteRegistro[] {
    return [...this.pacientes.values()].filter((p) => !p.fusionadoEnId && p.curpHash === curpHash);
  }

  buscarPorTexto(termino: string): PacienteRegistro[] {
    const q = termino.trim().toLowerCase();
    const digitos = q.replace(/\D/g, '');
    return [...this.pacientes.values()].filter((p) => {
      if (p.fusionadoEnId) return false;
      if (!q) return true;
      const nombreCompleto = `${p.nombre} ${p.apellidos}`.toLowerCase();
      if (nombreCompleto.includes(q)) return true;
      if (p.id.toLowerCase().includes(q)) return true;
      if (p.email?.toLowerCase().includes(q)) return true;
      if (digitos.length >= 4 && p.telefonoE164?.includes(digitos)) return true;
      return false;
    });
  }

  crearPaciente(datos: {
    id?: string;
    nombre: string;
    apellidos: string;
    email?: string | null;
    telefonoE164?: string | null;
    curp?: string | null;
    fechaNacimiento?: string | null;
    canalPreferido?: CanalAtencion;
    idioma?: IdiomaPaciente;
    region?: string | null;
    esDemo?: boolean;
    usuarioId?: string | null;
  }): PacienteRegistro {
    const registro: PacienteRegistro = {
      id: datos.id ?? `pac_${randomUUID().slice(0, 12)}`,
      nombre: datos.nombre.trim(),
      apellidos: datos.apellidos.trim(),
      fechaNacCifrada: datos.fechaNacimiento ? this.cifrado.cifrar(datos.fechaNacimiento) : null,
      curpCifrado: datos.curp ? this.cifrado.cifrar(datos.curp.trim().toUpperCase()) : null,
      curpHash: datos.curp ? this.cifrado.hashCurp(datos.curp) : null,
      datosFiscalesCifrados: null,
      email: datos.email ? datos.email.trim().toLowerCase() : null,
      telefonoE164: datos.telefonoE164 ?? null,
      canalPreferido: datos.canalPreferido ?? 'whatsapp',
      idioma: datos.idioma ?? 'es',
      region: datos.region ?? null,
      esDemo: datos.esDemo ?? true,
      usuarioId: datos.usuarioId ?? null,
      fusionadoEnId: null,
      creadoEn: new Date().toISOString(),
    };
    this.pacientes.set(registro.id, registro);
    return registro;
  }

  guardarIdentidadCanal(entrada: {
    pacienteId: string;
    canal: CanalAtencion;
    identificador: string;
    verificadoEn: string | null;
    metodoVerificacion: string | null;
    esPrincipal?: boolean;
  }): IdentidadCanalRegistro {
    const existente = this.buscarIdentidadCanal(entrada.canal, entrada.identificador);
    if (existente) {
      existente.pacienteId = entrada.pacienteId;
      existente.verificadoEn = entrada.verificadoEn;
      existente.metodoVerificacion = entrada.metodoVerificacion;
      return existente;
    }

    const nueva: IdentidadCanalRegistro = {
      id: `idc_${randomUUID().slice(0, 12)}`,
      pacienteId: entrada.pacienteId,
      canal: entrada.canal,
      identificador: entrada.identificador,
      verificadoEn: entrada.verificadoEn,
      metodoVerificacion: entrada.metodoVerificacion,
      esPrincipal: entrada.esPrincipal ?? false,
      creadoEn: new Date().toISOString(),
    };
    this.identidades.push(nueva);
    return nueva;
  }

  fusionarPacientes(origenId: string, destinoId: string): { identidadesMovidas: number } {
    const origen = this.pacientes.get(origenId);
    const destino = this.pacientes.get(destinoId);
    if (!origen || !destino) {
      throw new Error('Paciente origen o destino no encontrado');
    }

    let identidadesMovidas = 0;
    for (const idc of this.identidades) {
      if (idc.pacienteId === origenId) {
        idc.pacienteId = destinoId;
        identidadesMovidas += 1;
      }
    }

    if (!destino.email && origen.email) destino.email = origen.email;
    if (!destino.telefonoE164 && origen.telefonoE164) destino.telefonoE164 = origen.telefonoE164;
    if (!destino.curpCifrado && origen.curpCifrado) {
      destino.curpCifrado = origen.curpCifrado;
      destino.curpHash = origen.curpHash;
    }
    if (!destino.fechaNacCifrada && origen.fechaNacCifrada) {
      destino.fechaNacCifrada = origen.fechaNacCifrada;
    }
    origen.fusionadoEnId = destinoId;

    return { identidadesMovidas };
  }
}
