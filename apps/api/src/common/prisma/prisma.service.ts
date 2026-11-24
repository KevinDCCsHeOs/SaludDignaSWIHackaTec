import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CifradoService } from '../../privacidad/cifrado.service';

const CAMPOS_PACIENTE_CIFRADOS = [
  'fechaNacCifrada',
  'curpCifrado',
  'datosFiscalesCifrados',
] as const;

const CAMPOS_RESULTADO_CIFRADOS = ['contenidoCifrado', 'archivoUrlCifrada'] as const;

function cifrarCamposEnObjeto(
  data: Record<string, unknown> | undefined,
  campos: readonly string[],
  cifrado: CifradoService,
): void {
  if (!data || typeof data !== 'object') return;
  for (const campo of campos) {
    const valor = data[campo];
    if (typeof valor === 'string' && valor.length > 0) {
      data[campo] = cifrado.cifrar(valor);
    }
  }
}

function descifrarCamposEnResultado(
  registro: unknown,
  campos: readonly string[],
  cifrado: CifradoService,
): unknown {
  if (!registro) return registro;
  if (Array.isArray(registro)) {
    return registro.map((item) => descifrarCamposEnResultado(item, campos, cifrado));
  }
  if (typeof registro === 'object') {
    const copia = { ...(registro as Record<string, unknown>) };
    for (const campo of campos) {
      const valor = copia[campo];
      if (typeof valor === 'string' && cifrado.esCifrado(valor)) {
        copia[campo] = cifrado.descifrar(valor);
      }
    }
    return copia;
  }
  return registro;
}

/**
 * Crea la extensión de Prisma (`$extends`, reemplazo moderno del middleware en Prisma 6)
 * que cifra automáticamente en escritura y descifra en lectura los campos sensibles (LFPDPPP, #10).
 */
export function crearClientePrismaConCifrado(base: PrismaClient, cifrado: CifradoService) {
  return base.$extends({
    query: {
      paciente: {
        async create({ args, query }) {
          cifrarCamposEnObjeto(
            args.data as unknown as Record<string, unknown>,
            CAMPOS_PACIENTE_CIFRADOS,
            cifrado,
          );
          const res = await query(args);
          return descifrarCamposEnResultado(res, CAMPOS_PACIENTE_CIFRADOS, cifrado);
        },
        async update({ args, query }) {
          cifrarCamposEnObjeto(
            args.data as unknown as Record<string, unknown>,
            CAMPOS_PACIENTE_CIFRADOS,
            cifrado,
          );
          const res = await query(args);
          return descifrarCamposEnResultado(res, CAMPOS_PACIENTE_CIFRADOS, cifrado);
        },
        async findUnique({ args, query }) {
          const res = await query(args);
          return descifrarCamposEnResultado(res, CAMPOS_PACIENTE_CIFRADOS, cifrado);
        },
        async findFirst({ args, query }) {
          const res = await query(args);
          return descifrarCamposEnResultado(res, CAMPOS_PACIENTE_CIFRADOS, cifrado);
        },
        async findMany({ args, query }) {
          const res = await query(args);
          return descifrarCamposEnResultado(res, CAMPOS_PACIENTE_CIFRADOS, cifrado);
        },
      },
      resultado: {
        async create({ args, query }) {
          cifrarCamposEnObjeto(
            args.data as unknown as Record<string, unknown>,
            CAMPOS_RESULTADO_CIFRADOS,
            cifrado,
          );
          const res = await query(args);
          return descifrarCamposEnResultado(res, CAMPOS_RESULTADO_CIFRADOS, cifrado);
        },
        async update({ args, query }) {
          cifrarCamposEnObjeto(
            args.data as unknown as Record<string, unknown>,
            CAMPOS_RESULTADO_CIFRADOS,
            cifrado,
          );
          const res = await query(args);
          return descifrarCamposEnResultado(res, CAMPOS_RESULTADO_CIFRADOS, cifrado);
        },
        async findUnique({ args, query }) {
          const res = await query(args);
          return descifrarCamposEnResultado(res, CAMPOS_RESULTADO_CIFRADOS, cifrado);
        },
        async findMany({ args, query }) {
          const res = await query(args);
          return descifrarCamposEnResultado(res, CAMPOS_RESULTADO_CIFRADOS, cifrado);
        },
      },
    },
  });
}

@Injectable()
export class PrismaService implements OnModuleDestroy {
  private readonly base: PrismaClient | null;
  readonly client: ReturnType<typeof crearClientePrismaConCifrado> | null;

  constructor(private readonly cifrado: CifradoService) {
    if (process.env.DATABASE_URL && process.env.NODE_ENV !== 'test') {
      this.base = new PrismaClient();
      this.client = crearClientePrismaConCifrado(this.base, this.cifrado);
    } else {
      this.base = null;
      this.client = null;
    }
  }

  estaConfigurado(): boolean {
    return this.client !== null;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.base) {
      await this.base.$disconnect().catch(() => undefined);
    }
  }
}
