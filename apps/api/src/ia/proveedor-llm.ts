import { Injectable, Logger } from '@nestjs/common';
import type { IdiomaPaciente } from '@salud-digna/shared';
import { z } from 'zod';
import type { ContextoMinimoPacienteIa } from './resumen-conversacion';
import type { EntidadesIa, IntencionIa } from './clasificador-nlp';

export type ProveedorLlmTipo = 'none' | 'gemini' | 'openai' | 'anthropic';

export interface SolicitudLlmIa {
  mensaje: string;
  idioma: IdiomaPaciente;
  modoSencillo: boolean;
  contextoMinimo: ContextoMinimoPacienteIa | null;
}

export interface RespuestaLlmEstructurada {
  intencion: IntencionIa;
  confianza: number;
  entidades: EntidadesIa;
  respuesta: string;
}

const RespuestaLlmSchema = z.object({
  intencion: z.enum([
    'cotizar',
    'agendar',
    'estatus',
    'resultados',
    'ubicacion',
    'queja',
    'acceso',
    'urgencia',
    'asesor',
    'explicame_facil',
    'desconocida',
  ]),
  confianza: z.number().min(0).max(1),
  entidades: z
    .object({
      estudioNombre: z.string().optional(),
      clinicaNombre: z.string().optional(),
      fecha: z.string().optional(),
      terminoMedico: z.string().optional(),
    })
    .default({}),
  respuesta: z.string().min(1).max(900),
});

const PROMPT_SISTEMA = [
  'Eres el asistente virtual de primer nivel de Salud Digna Omnicanal.',
  'REGLAS ESTRICTAS:',
  '1. Responde EXCLUSIVAMENTE un objeto JSON válido con llaves: intencion, confianza (0..1), entidades, respuesta.',
  '2. NUNCA diagnostiques enfermedades, NUNCA recetes medicamentos ni dosis y NUNCA interpretes resultados clínicos; si te lo piden, deriva respetuosamente a un médico.',
  '3. Ante síntomas de alarma médica (dolor de pecho, falta de aire, sangrado abundante, desmayo), clasifica intencion="urgencia" e indica llamar al 911 de inmediato.',
  '4. Usa SOLO el contexto mínimo proporcionado; nunca inventes precios, resultados ni datos clínicos.',
  '5. Responde en el idioma solicitado (es, en o nah). Si modoSencillo=true, explica en lenguaje cotidiano y fácil de entender.',
].join('\n');

/**
 * Adaptador configurable para proveedor LLM externo (`LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, #24).
 * Si `LLM_PROVIDER=none`, falta la llave o falla la red, devuelve `null` para usar el motor determinista local.
 */
@Injectable()
export class ProveedorLlmService {
  private readonly logger = new Logger('ProveedorLLM');

  obtenerProveedorActivo(): ProveedorLlmTipo {
    if (process.env.NODE_ENV === 'test') return 'none';
    const raw = (process.env.LLM_PROVIDER ?? 'none').trim().toLowerCase();
    const apiKey = (process.env.LLM_API_KEY ?? '').trim();
    if (!apiKey || apiKey.startsWith('REEMPLAZAR')) return 'none';
    if (raw === 'gemini' || raw === 'openai' || raw === 'anthropic') {
      return raw;
    }
    return 'none';
  }

  async consultarEstructurado(solicitud: SolicitudLlmIa): Promise<RespuestaLlmEstructurada | null> {
    const proveedor = this.obtenerProveedorActivo();
    if (proveedor === 'none') return null;

    const apiKey = process.env.LLM_API_KEY!.trim();
    const promptUsuario = JSON.stringify({
      idioma: solicitud.idioma,
      modoSencillo: solicitud.modoSencillo,
      contextoMinimo: solicitud.contextoMinimo ?? null,
      mensaje: solicitud.mensaje,
    });

    try {
      let textoCrudo: string | null = null;
      if (proveedor === 'gemini') {
        textoCrudo = await this.llamarGemini(apiKey, promptUsuario);
      } else if (proveedor === 'openai') {
        textoCrudo = await this.llamarOpenAi(apiKey, promptUsuario);
      } else if (proveedor === 'anthropic') {
        textoCrudo = await this.llamarAnthropic(apiKey, promptUsuario);
      }

      if (!textoCrudo) return null;
      const jsonMatch = textoCrudo.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      const parsed = RespuestaLlmSchema.safeParse(JSON.parse(jsonMatch[0]));
      return parsed.success ? parsed.data : null;
    } catch (error) {
      this.logger.warn(
        `Fallback al motor NLP local por error en proveedor ${proveedor}: ${
          error instanceof Error ? error.name : 'error'
        }`,
      );
      return null;
    }
  }

  private async llamarGemini(apiKey: string, promptUsuario: string): Promise<string | null> {
    const modelo = process.env.LLM_MODEL ?? 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: PROMPT_SISTEMA }] },
        contents: [{ role: 'user', parts: [{ text: promptUsuario }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
        },
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  }

  private async llamarOpenAi(apiKey: string, promptUsuario: string): Promise<string | null> {
    const modelo = process.env.LLM_MODEL ?? 'gpt-4o-mini';
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelo,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: PROMPT_SISTEMA },
          { role: 'user', content: promptUsuario },
        ],
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content ?? null;
  }

  private async llamarAnthropic(apiKey: string, promptUsuario: string): Promise<string | null> {
    const modelo = process.env.LLM_MODEL ?? 'claude-3-5-haiku-latest';
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: modelo,
        max_tokens: 512,
        system: PROMPT_SISTEMA,
        messages: [{ role: 'user', content: promptUsuario }],
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      content?: Array<{ text?: string }>;
    };
    return data.content?.[0]?.text ?? null;
  }
}
