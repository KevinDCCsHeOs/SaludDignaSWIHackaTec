import type { IdiomaPaciente } from '@salud-digna/shared';
import { CLINICAS_DEMO, ESTUDIOS_DEMO } from '../catalogos/datos-demo';
import { buscarEnGlosario } from './glosario';
import { detectarIdiomaMensaje } from './idioma';

export type IntencionIa =
  | 'cotizar'
  | 'agendar'
  | 'estatus'
  | 'resultados'
  | 'ubicacion'
  | 'queja'
  | 'acceso'
  | 'urgencia'
  | 'asesor'
  | 'explicame_facil'
  | 'desconocida';

export interface EntidadesIa {
  estudioId?: string;
  estudioNombre?: string;
  clinicaId?: string;
  clinicaNombre?: string;
  fecha?: string;
  terminoMedico?: string;
}

export type TipoGuardrailIa = 'ninguno' | 'no_diagnostico' | 'urgencia_911';

export interface ResultadoClasificacionNlp {
  intencion: IntencionIa;
  confianza: number;
  entidades: EntidadesIa;
  idioma: IdiomaPaciente;
  idiomaDetectado: boolean;
  guardrail: TipoGuardrailIa;
  esUrgenciaAlarma: boolean;
}

function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Síntomas de alarma crítica (derivación inmediata a 911 + ticket prioridad crítica, #24 y #25).
 */
const PATRONES_URGENCIA_ALARMA: readonly RegExp[] = [
  /\bdolor\s+(?:muy\s+)?(?:fuerte\s+)?(?:en\s+el\s+|de\s+)?pecho\b/i,
  /\bchest\s+pain\b/i,
  /\b(?:no\s+puedo|me\s+cuesta\s+mucho|dificultad\s+para)\s+respirar\b/i,
  /\b(?:can'?t|cannot|hard\s+to)\s+breathe\b/i,
  /\b(?:me\s+estoy\s+ahogando|falta\s+de\s+aire\s+severa)\b/i,
  /\b(?:sangrado\s+(?:intenso|abundante|fuerte|sin\s+parar)|hemorragia|heavy\s+bleeding)\b/i,
  /\b(?:desmayo|me\s+desmay[eé]|perdi[oó]\s+el\s+conocimiento|fainted|unconscious)\b/i,
  /\b(?:infarto|ataque\s+al\s+coraz[oó]n|heart\s+attack|convulsi[oó]n|convulsionando|seizure)\b/i,
  /\b(?:derrame\s+cerebral|acv|stroke|labios\s+morados)\b/i,
  /\b(?:emergencia\s+m[eé]dica|urgencia\s+m[eé]dica|llamen\s+una\s+ambulancia|call\s+911)\b/i,
  /\b(?:suicidio|quitarme\s+la\s+vida|hacerme\s+da[nñ]o)\b/i,
];

/**
 * Guardrail clínico: solicitudes de diagnóstico médico, receta o interpretación clínica (#24).
 */
const PATRONES_DIAGNOSTICO_O_RECETA: readonly RegExp[] = [
  /\b(?:qu[eé]\s+enfermedad\s+tengo|dime\s+si\s+tengo|crees\s+que\s+tengo|tengo\s+(?:c[aá]ncer|diabetes|infecci[oó]n|anemia))\b/i,
  /\b(?:diagn[oó]stic[ao]|diagnost[ií]came|diagnose\s+me|what\s+disease\s+do\s+i\s+have)\b/i,
  /\b(?:qu[eé]\s+(?:medicamento|medicina|pastilla|antibi[oó]tico)\s+(?:tomo|me\s+recomiendas|debo\s+tomar)|rec[eé]tame|prescribe)\b/i,
  /\b(?:interpreta(?:r)?\s+(?:mis\s+)?resultados?|qu[eé]\s+significa\s+(?:que\s+sali[oó]|mi\s+resultado)|sali[oó]\s+(?:alto|bajo|positivo|alterado)\s+qu[eé]\s+hago)\b/i,
  /\b(?:interpret\s+my\s+results?|what\s+medication\s+should\s+i\s+take)\b/i,
];

export function detectarSintomasAlarma(texto: string): boolean {
  return PATRONES_URGENCIA_ALARMA.some((rx) => rx.test(texto));
}

export function esSolicitudDiagnosticoOReceta(texto: string): boolean {
  return PATRONES_DIAGNOSTICO_O_RECETA.some((rx) => rx.test(texto));
}

const ALIAS_ESTUDIOS: ReadonlyArray<{ patron: RegExp; estudioId: string }> = [
  { patron: /ultrasonido\s+abdominal|abdominal\s+ultrasound/i, estudioId: 'est_us_abd' },
  { patron: /ultrasonido\s+p[eé]lvico|pelvic\s+ultrasound/i, estudioId: 'est_us_pel' },
  { patron: /ultrasonido\s+obst[eé]trico|embarazo.*ultrasonido/i, estudioId: 'est_us_obs' },
  { patron: /ultrasonido\s+(?:de\s+)?tiroides/i, estudioId: 'est_us_tir' },
  { patron: /ultrasonido\s+renal|v[ií]as\s+urinarias/i, estudioId: 'est_us_ren' },
  { patron: /\bultrasonido\b|\bultrasound\b|\becograf[ií]a\b/i, estudioId: 'est_us_abd' },
  {
    patron: /biometr[ií]a\s+hem[aá]tica|\bbh\b|blood\s+count|\bcbc\b/i,
    estudioId: 'est_lab_bh',
  },
  { patron: /qu[ií]mica\s+sangu[ií]nea.*27|\bqs\s*27\b/i, estudioId: 'est_lab_qs27' },
  {
    patron: /qu[ií]mica\s+sangu[ií]nea|\bqs\s*6\b|blood\s+test|an[aá]lisis\s+de\s+sangre/i,
    estudioId: 'est_lab_qs6',
  },
  { patron: /hemoglobina\s+glucosilada|hba1c|a1c/i, estudioId: 'est_lab_hba1c' },
  { patron: /\bglucosa\b|\bglucose\b|az[uú]car\s+en\s+sangre/i, estudioId: 'est_lab_glu' },
  {
    patron: /perfil\s+de\s+l[ií]pidos|colesterol|triglic[eé]ridos|lipid\s+panel/i,
    estudioId: 'est_lab_lip',
  },
  { patron: /perfil\s+tiroideo|\btiroides\b|thyroid/i, estudioId: 'est_lab_tir' },
  { patron: /examen\s+general\s+de\s+orina|\bego\b|urinalysis|orina/i, estudioId: 'est_lab_ego' },
  { patron: /hep[aá]tico|h[ií]gado/i, estudioId: 'est_lab_hep' },
  { patron: /vitamina\s*d/i, estudioId: 'est_lab_vitd' },
  { patron: /ant[ií]geno\s+prost[aá]tico|\bpsa\b|pr[oó]stata/i, estudioId: 'est_lab_psa' },
  { patron: /perfil\s+prenatal|prenatal/i, estudioId: 'est_lab_pren' },
  { patron: /rayos\s*x.*columna|columna\s+lumbar.*rayos/i, estudioId: 'est_rx_col' },
  { patron: /rayos\s*x.*rodilla/i, estudioId: 'est_rx_rod' },
  { patron: /rayos\s*x|radiograf[ií]a|x-?ray/i, estudioId: 'est_rx_tor' },
  { patron: /mastograf[ií]a|mamograf[ií]a|mammogram/i, estudioId: 'est_mas_dig' },
  { patron: /papanicolaou|pap\s+smear/i, estudioId: 'est_pap_liq' },
  { patron: /electrocardiograma|\becg\b|\bekg\b/i, estudioId: 'est_ecg_rep' },
  { patron: /densitometr[ií]a|bone\s+density/i, estudioId: 'est_den_ose' },
  { patron: /tomograf[ií]a\s+(?:de\s+)?abdomen/i, estudioId: 'est_tom_abd' },
  { patron: /tomograf[ií]a|\btac\b|ct\s+scan/i, estudioId: 'est_tom_cra' },
  { patron: /resonancia.*rodilla/i, estudioId: 'est_res_rod' },
  { patron: /resonancia\s+magn[eé]tica|\bresonancia\b|\bmri\b/i, estudioId: 'est_res_col' },
  { patron: /examen\s+de\s+la\s+vista|lentes|optometr[ií]a|eye\s+exam/i, estudioId: 'est_opt_ex' },
  { patron: /nutrici[oó]n|nutricional|bioimpedancia/i, estudioId: 'est_nut_val' },
];

const ALIAS_CLINICAS: ReadonlyArray<{ patron: RegExp; clinicaId: string }> = [
  { patron: /puebla\s+centro|reforma.*puebla/i, clinicaId: 'cli_09' },
  { patron: /angel[oó]polis/i, clinicaId: 'cli_10' },
  { patron: /\bcapu\b/i, clinicaId: 'cli_11' },
  { patron: /coyoac[aá]n/i, clinicaId: 'cli_01' },
  { patron: /buenavista/i, clinicaId: 'cli_02' },
  { patron: /iztapalapa/i, clinicaId: 'cli_03' },
  { patron: /polanco/i, clinicaId: 'cli_04' },
  { patron: /monterrey\s+centro/i, clinicaId: 'cli_05' },
  { patron: /san\s+nicol[aá]s/i, clinicaId: 'cli_06' },
  { patron: /guadalupe/i, clinicaId: 'cli_07' },
  { patron: /\bpuebla\b/i, clinicaId: 'cli_09' },
  { patron: /\bcdmx\b|ciudad\s+de\s+m[eé]xico/i, clinicaId: 'cli_01' },
  { patron: /\bmonterrey\b|\bmty\b/i, clinicaId: 'cli_05' },
];

export function extraerEntidades(texto: string): EntidadesIa {
  const entidades: EntidadesIa = {};

  for (const regla of ALIAS_ESTUDIOS) {
    if (regla.patron.test(texto)) {
      const est = ESTUDIOS_DEMO.find((e) => e.id === regla.estudioId);
      if (est) {
        entidades.estudioId = est.id;
        entidades.estudioNombre = est.nombre;
      }
      break;
    }
  }

  for (const regla of ALIAS_CLINICAS) {
    if (regla.patron.test(texto)) {
      const cli = CLINICAS_DEMO.find((c) => c.id === regla.clinicaId);
      if (cli) {
        entidades.clinicaId = cli.id;
        entidades.clinicaNombre = cli.nombre;
      }
      break;
    }
  }

  const fechaMatch = texto.match(
    /\b(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|(?:ma[nñ]ana|hoy|pasado\s+ma[nñ]ana|tomorrow|today|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|monday|tuesday|wednesday|thursday|friday|saturday)(?:\s+(?:a\s+las\s+|at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm|hrs?)?)?|\d{1,2}:\d{2}\s*(?:am|pm|hrs?)?)\b/i,
  );
  if (fechaMatch) {
    entidades.fecha = fechaMatch[1].trim();
  }

  const glosario = buscarEnGlosario(texto);
  if (glosario) {
    entidades.terminoMedico = glosario.termino;
  }

  return entidades;
}

interface ReglaIntencion {
  intencion: IntencionIa;
  pesoBase: number;
  patrones: readonly RegExp[];
}

const REGLAS_INTENCION: readonly ReglaIntencion[] = [
  {
    intencion: 'asesor',
    pesoBase: 0.94,
    patrones: [
      /\b(?:hablar\s+con\s+(?:un\s+)?(?:asesor|humano|persona|agente|operador)|p[aá]same\s+con\s+(?:un\s+)?(?:asesor|humano)|quiero\s+un\s+(?:asesor|humano))\b/i,
      /^(?:asesor|humano|advisor|human|agent|representative)$/i,
      /\b(?:talk\s+to\s+(?:a\s+)?(?:human|advisor|agent|person|representative))\b/i,
    ],
  },
  {
    intencion: 'acceso',
    pesoBase: 0.91,
    patrones: [
      /\b(?:no\s+puedo\s+(?:entrar|acceder|iniciar\s+sesi[oó]n)|olvid[eé]\s+mi\s+contrase[nñ]a|recuperar\s+(?:mi\s+)?(?:cuenta|contrase[nñ]a|acceso)|restablecer\s+contrase[nñ]a|bloqu[eé]o\s+de\s+cuenta|me\s+dice\s+contrase[nñ]a\s+incorrecta)\b/i,
      /\b(?:can'?t\s+(?:log\s*in|sign\s*in|access\s+my\s+account)|forgot\s+(?:my\s+)?password|reset\s+(?:my\s+)?password|locked\s+out\s+of\s+my\s+account)\b/i,
    ],
  },
  {
    intencion: 'queja',
    pesoBase: 0.9,
    patrones: [
      /\b(?:queja|poner\s+una\s+queja|inconformidad|reclamo|p[eé]simo\s+servicio|mal\s+trato|me\s+trataron\s+mal|estoy\s+(?:muy\s+)?(?:molest[oa]|enojad[oa]|harto|harta)|cobro\s+(?:doble|indebido)|me\s+hicieron\s+esperar\s+(?:mucho|horas)|error\s+en\s+el\s+servicio|horrible\s+atenci[oó]n)\b/i,
      /\b(?:complaint|file\s+a\s+complaint|terrible\s+service|rude\s+staff|charged\s+twice|very\s+upset|unacceptable)\b/i,
    ],
  },
  {
    intencion: 'resultados',
    pesoBase: 0.9,
    patrones: [
      /\b(?:resultados?|ya\s+est[aá]n\s+listos\s+mis\s+(?:estudios|an[aá]lisis)|descargar\s+(?:mi\s+)?(?:estudio|resultado|pdf)|ver\s+mis\s+resultados|cuando\s+entregan\s+resultados|cu[aá]ndo\s+salen\s+mis\s+resultados)\b/i,
      /\b(?:my\s+results?|lab\s+results?|download\s+my\s+results?|are\s+my\s+results?\s+ready|check\s+results?)\b/i,
    ],
  },
  {
    intencion: 'ubicacion',
    pesoBase: 0.89,
    patrones: [
      /\b(?:ubicaci[oó]n|direcci[oó]n|d[oó]nde\s+(?:est[aá]|queda|se\s+encuentra)|c[oó]mo\s+llego|mapa\s+de\s+la\s+cl[ií]nica|sucursal\s+m[aá]s\s+cercana|cl[ií]nica\s+cerca|horario\s+de\s+la\s+cl[ií]nica|a\s+qu[eé]\s+hora\s+abren)\b/i,
      /\b(?:location|address|where\s+is\s+the\s+clinic|nearest\s+clinic|directions\s+to|clinic\s+hours|what\s+time\s+do\s+you\s+open)\b/i,
    ],
  },
  {
    intencion: 'estatus',
    pesoBase: 0.88,
    patrones: [
      /\b(?:estatus|estado\s+de\s+mi|c[oó]mo\s+va\s+mi|seguimiento|mi\s+folio|ver\s+mi\s+tr[aá]mite|tengo\s+(?:algo|alg[uú]n\s+tr[aá]mite)\s+pendiente|en\s+qu[eé]\s+paso\s+(?:me\s+qued[eé]|va\s+mi)|retomar\s+mi\s+tr[aá]mite)\b/i,
      /\b(?:status\s+of\s+my|check\s+my\s+(?:status|process|ticket|folio)|where\s+did\s+i\s+leave\s+off|pending\s+process)\b/i,
      /\bSD-\d{4}-\d+\b/i,
      /\bTK-\d{4}-\d+\b/i,
    ],
  },
  {
    intencion: 'agendar',
    pesoBase: 0.88,
    patrones: [
      /\b(?:agendar|sacar\s+(?:una\s+)?cita|hacer\s+(?:una\s+)?cita|quiero\s+(?:una\s+)?cita|reservar\s+(?:cita|horario)|reagendar|cambiar\s+(?:mi\s+)?cita|confirmar\s+(?:mi\s+)?cita|horarios?\s+disponibles?|programar\s+(?:mi\s+)?estudio)\b/i,
      /\b(?:schedule|book\s+(?:an?\s+)?appointment|make\s+(?:an?\s+)?appointment|reschedule|available\s+(?:times|slots)|confirm\s+my\s+appointment)\b/i,
    ],
  },
  {
    intencion: 'cotizar',
    pesoBase: 0.87,
    patrones: [
      /\b(?:cotizar|cotizaci[oó]n|cu[aá]nto\s+(?:cuesta|sale|vale)|precio|precios|costo|costos|tarifa|presupuesto|cu[aá]l\s+es\s+el\s+costo)\b/i,
      /\b(?:quote|how\s+much|price|cost|pricing|fee)\b/i,
    ],
  },
  {
    intencion: 'explicame_facil',
    pesoBase: 0.89,
    patrones: [
      /\b(?:expl[ií]came\s+(?:f[aá]cil|sencillo|en\s+palabras\s+simples)|no\s+entiendo|qu[eé]\s+(?:es|significa)\s+(?:un|una|el|la)?\s*\w+|c[oó]mo\s+(?:me\s+)?preparo|qu[eé]\s+preparaci[oó]n\s+necesito|en\s+palabras\s+f[aá]ciles)\b/i,
      /\b(?:explain\s+(?:simply|in\s+plain|easy)|what\s+does\s+.*mean|what\s+is\s+(?:a\s+|an\s+)?(?:fasting|ultrasound|mammogram|cbc|lipid|mri)|how\s+do\s+i\s+prepare)\b/i,
    ],
  },
];

/**
 * Clasificador NLP determinista y rápido (siempre disponible como motor base o fallback del LLM, #24).
 */
export function clasificarMensajeNlp(
  texto: string,
  idiomaActual: IdiomaPaciente = 'es',
): ResultadoClasificacionNlp {
  const { idioma, detectadoConCerteza } = detectarIdiomaMensaje(texto, idiomaActual);
  const entidades = extraerEntidades(texto);

  // 1. Prioridad máxima: síntomas de alarma médica -> 911 inmediato (#24, #25)
  if (detectarSintomasAlarma(texto)) {
    return {
      intencion: 'urgencia',
      confianza: 0.99,
      entidades,
      idioma,
      idiomaDetectado: detectadoConCerteza,
      guardrail: 'urgencia_911',
      esUrgenciaAlarma: true,
    };
  }

  // 2. Guardrail de diagnóstico/receta/interpretación clínica (#24)
  if (esSolicitudDiagnosticoOReceta(texto)) {
    const esInterpretacion = /resultad|results?/i.test(texto);
    return {
      intencion: esInterpretacion ? 'resultados' : 'desconocida',
      confianza: 0.92,
      entidades,
      idioma,
      idiomaDetectado: detectadoConCerteza,
      guardrail: 'no_diagnostico',
      esUrgenciaAlarma: false,
    };
  }

  // 3. Evaluación por reglas de intención con puntaje
  let mejorIntencion: IntencionIa = 'desconocida';
  let mejorPuntaje = 0;

  for (const regla of REGLAS_INTENCION) {
    let coincidencias = 0;
    for (const patron of regla.patrones) {
      if (patron.test(texto)) coincidencias += 1;
    }
    if (coincidencias > 0) {
      const puntaje = Math.min(0.98, regla.pesoBase + (coincidencias - 1) * 0.04);
      if (puntaje > mejorPuntaje) {
        mejorPuntaje = puntaje;
        mejorIntencion = regla.intencion;
      }
    }
  }

  // 4. Desambiguación contextual cuando menciona estudio + fecha sin verbo explícito
  if (mejorIntencion === 'desconocida') {
    const norm = normalizarTexto(texto);
    if (entidades.estudioId && entidades.fecha) {
      mejorIntencion = 'agendar';
      mejorPuntaje = 0.78;
    } else if (entidades.estudioId && /\b(quiero|necesito|busco|hacerm|para)\b/i.test(norm)) {
      mejorIntencion = 'cotizar';
      mejorPuntaje = 0.76;
    } else if (entidades.clinicaId && !entidades.estudioId) {
      mejorIntencion = 'ubicacion';
      mejorPuntaje = 0.74;
    } else if (entidades.terminoMedico && /\?/.test(texto)) {
      mejorIntencion = 'explicame_facil';
      mejorPuntaje = 0.75;
    } else {
      mejorPuntaje = 0.35;
    }
  }

  return {
    intencion: mejorIntencion,
    confianza: Number(mejorPuntaje.toFixed(2)),
    entidades,
    idioma,
    idiomaDetectado: detectadoConCerteza,
    guardrail: 'ninguno',
    esUrgenciaAlarma: false,
  };
}
