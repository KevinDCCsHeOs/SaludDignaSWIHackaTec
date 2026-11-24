import { PrismaClient, RolUsuario } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { MATRIZ_PERMISOS_POR_ROL } from '../src/auth/permisos';
import { USUARIOS_DEMO_SEMILLA } from '../src/auth/usuarios-demo';
import {
  CLINICAS_DEMO,
  ESTUDIOS_DEMO,
  MEDICOS_DEMO,
  PACIENTES_DEMO,
} from '../src/catalogos/datos-demo';
import { CifradoService } from '../src/privacidad/cifrado.service';

const NOMBRES_ROL: Record<RolUsuario, { nombre: string; descripcion: string }> = {
  paciente: { nombre: 'Paciente', descripcion: 'Usuario titular de trámites, citas y resultados' },
  asesor_ia: { nombre: 'Asistente IA', descripcion: 'Primer nivel de atención automatizada' },
  asesor: { nombre: 'Asesor Contact Center', descripcion: 'Atención omnicanal y tickets nivel 1' },
  asesor_pro: {
    nombre: 'Asesor Pro',
    descripcion: 'Segundo nivel: tickets escalados y resolución de duplicados',
  },
  medico: { nombre: 'Médico', descripcion: 'Validación y liberación de resultados clínicos' },
  revisor_tecnico: {
    nombre: 'Revisor Técnico',
    descripcion: 'Control de calidad previo a la validación médica',
  },
  admin: { nombre: 'Administrador', descripcion: 'Monitoreo, KPIs, auditoría y configuración' },
};

async function limpiarDatosDemo(prisma: PrismaClient): Promise<void> {
  console.log('[seed] --reset activado: limpiando registros demo (esDemo = true)...');
  await prisma.resultado.deleteMany({ where: { esDemo: true } });
  await prisma.cita.deleteMany({ where: { esDemo: true } });
  await prisma.ticket.deleteMany({ where: { esDemo: true } });
  await prisma.tramite.deleteMany({ where: { esDemo: true } });
  await prisma.paciente.deleteMany({ where: { esDemo: true } });
  await prisma.usuario.deleteMany({ where: { esDemo: true } });
  await prisma.estudio.deleteMany({ where: { esDemo: true } });
  await prisma.clinica.deleteMany({ where: { esDemo: true } });
}

export async function ejecutarSeed(opciones?: { reset?: boolean }): Promise<void> {
  const prisma = new PrismaClient();
  const cifrado = new CifradoService();

  try {
    if (opciones?.reset) {
      await limpiarDatosDemo(prisma);
    }

    // 1. Roles RBAC (7)
    for (const [clave, permisos] of Object.entries(MATRIZ_PERMISOS_POR_ROL)) {
      const rolClave = clave as RolUsuario;
      const meta = NOMBRES_ROL[rolClave];
      await prisma.rol.upsert({
        where: { clave: rolClave },
        update: {
          nombre: meta.nombre,
          descripcion: meta.descripcion,
          permisos: [...permisos],
        },
        create: {
          clave: rolClave,
          nombre: meta.nombre,
          descripcion: meta.descripcion,
          permisos: [...permisos],
        },
      });
    }

    // 2. Usuarios demo por rol + 5 médicos ficticios
    const usuariosCombinados = [
      ...USUARIOS_DEMO_SEMILLA,
      ...MEDICOS_DEMO.filter((m) => !USUARIOS_DEMO_SEMILLA.some((u) => u.id === m.id)).map((m) => ({
        id: m.id,
        email: m.email,
        nombre: m.nombre,
        contrasenaDemo: m.contrasenaDemo,
        rol: 'medico' as RolUsuario,
        region: m.region,
        pacienteId: null,
      })),
    ];

    for (const u of usuariosCombinados) {
      const passwordHash = await bcrypt.hash(u.contrasenaDemo, 10);
      await prisma.usuario.upsert({
        where: { email: u.email.toLowerCase() },
        update: {
          nombre: u.nombre,
          rolClave: u.rol,
          region: u.region,
          activo: true,
          esDemo: true,
        },
        create: {
          id: u.id,
          email: u.email.toLowerCase(),
          nombre: u.nombre,
          passwordHash,
          rolClave: u.rol,
          region: u.region,
          activo: true,
          esDemo: true,
        },
      });
    }

    // 3. Clínicas ficticias (10 en 3 regiones)
    for (const c of CLINICAS_DEMO) {
      await prisma.clinica.upsert({
        where: { codigo: c.codigo },
        update: {
          nombre: c.nombre,
          direccion: c.direccion,
          lat: c.lat,
          lng: c.lng,
          region: c.region,
          telefono: c.telefono,
          horario: c.horario,
          estatus: c.estatus,
          mensajeEstatus: c.mensajeEstatus,
          esDemo: true,
        },
        create: {
          id: c.id,
          codigo: c.codigo,
          nombre: c.nombre,
          direccion: c.direccion,
          lat: c.lat,
          lng: c.lng,
          region: c.region,
          telefono: c.telefono,
          horario: c.horario,
          estatus: c.estatus,
          mensajeEstatus: c.mensajeEstatus,
          esDemo: true,
        },
      });
    }

    // 4. Estudios ficticios (30)
    for (const e of ESTUDIOS_DEMO) {
      await prisma.estudio.upsert({
        where: { codigo: e.codigo },
        update: {
          nombre: e.nombre,
          categoria: e.categoria,
          precio: e.precio,
          preparacion: e.preparacion,
          duracionMinutos: e.duracionMinutos,
          vigenciaDias: e.vigenciaDias,
          activo: e.activo,
          esDemo: true,
        },
        create: {
          id: e.id,
          codigo: e.codigo,
          nombre: e.nombre,
          categoria: e.categoria,
          precio: e.precio,
          preparacion: e.preparacion,
          duracionMinutos: e.duracionMinutos,
          vigenciaDias: e.vigenciaDias,
          activo: e.activo,
          esDemo: true,
        },
      });
    }

    // 5. Pacientes ficticios (15) con campos sensibles cifrados AES-256-GCM
    for (const p of PACIENTES_DEMO) {
      const curpHash = cifrado.hashCurp(p.curp);
      await prisma.paciente.upsert({
        where: { curpHash },
        update: {
          nombre: p.nombre,
          apellidos: p.apellidos,
          email: p.email,
          telefonoE164: p.telefonoE164,
          canalPreferido: p.canalPreferido,
          idioma: p.idioma,
          region: p.region,
          esDemo: true,
        },
        create: {
          id: p.id,
          nombre: p.nombre,
          apellidos: p.apellidos,
          fechaNacCifrada: cifrado.cifrar(p.fechaNacimiento),
          curpCifrado: cifrado.cifrar(p.curp),
          curpHash,
          email: p.email,
          telefonoE164: p.telefonoE164,
          canalPreferido: p.canalPreferido,
          idioma: p.idioma,
          region: p.region,
          usuarioId: p.usuarioId,
          esDemo: true,
        },
      });
    }

    // 6. Identidad web inicial de Ana López (lista para retomar por WhatsApp)
    await prisma.identidadCanal.upsert({
      where: {
        canal_identificador: {
          canal: 'web',
          identificador: 'ana.lopez@demo.saluddigna.local',
        },
      },
      update: {},
      create: {
        id: 'idc_web_ana_demo',
        pacienteId: 'pac_ana_demo',
        canal: 'web',
        identificador: 'ana.lopez@demo.saluddigna.local',
        verificadoEn: new Date('2026-11-24T10:10:00.000Z'),
        metodoVerificacion: 'login_password',
        esPrincipal: true,
      },
    });

    console.log(
      `[seed] Listo: 7 roles, ${usuariosCombinados.length} usuarios, ${CLINICAS_DEMO.length} clínicas, ${ESTUDIOS_DEMO.length} estudios y ${PACIENTES_DEMO.length} pacientes demo sembrados.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  const reset = process.argv.includes('--reset');
  void ejecutarSeed({ reset }).catch((err) => {
    console.error('[seed] Error al sembrar base de datos:', err);
    process.exit(1);
  });
}
