import type { IdiomaPaciente } from '@salud-digna/shared';
import { ESTUDIOS_DEMO, type EstudioDemo } from '../catalogos/datos-demo';

export interface TerminoGlosario {
  clave: string;
  termino: string;
  aliases: string[];
  explicacionSencillaEs: string;
  explicacionSencillaEn: string;
  ejemploPreparacionEs?: string;
}

/**
 * Glosario de términos médicos y preparaciones en lenguaje sencillo (#26).
 * Sincronizado con `docs/glosario.md`.
 */
export const GLOSARIO_MEDICO_SENCILLO: readonly TerminoGlosario[] = [
  {
    clave: 'ayuno',
    termino: 'Ayuno',
    aliases: ['ayunas', 'fasting', 'sin comer'],
    explicacionSencillaEs:
      'Significa no comer alimentos ni tomar bebidas con azúcar, café, leche o jugos durante las horas indicadas antes de tu estudio. Sí puedes tomar pequeños sorbos de agua simple, salvo que el estudio indique otra cosa.',
    explicacionSencillaEn:
      'It means not eating food or drinking sugary drinks, coffee, milk, or juice for the indicated hours before your exam. Plain water in small sips is usually allowed unless told otherwise.',
  },
  {
    clave: 'ultrasonido_abdominal',
    termino: 'Ultrasonido abdominal',
    aliases: ['ultrasonido', 'ecografia', 'ecografía', 'ultrasound'],
    explicacionSencillaEs:
      'Es un estudio sin dolor que usa ondas de sonido (no radiación) para ver órganos del abdomen como el hígado, la vesícula y los riñones en una pantalla.',
    explicacionSencillaEn:
      'A painless scan that uses sound waves (no radiation) to view organs in your belly such as liver, gallbladder, and kidneys on a screen.',
    ejemploPreparacionEs:
      'No comas nada 6 horas antes. Una hora antes toma 2 vasos de agua simple (500 ml) y aguanta las ganas de ir al baño hasta terminar el estudio.',
  },
  {
    clave: 'vejiga_llena',
    termino: 'Acudir con vejiga llena',
    aliases: ['retener orina', 'full bladder', 'no orinar'],
    explicacionSencillaEs:
      'Tomar agua simple una hora antes y no ir al baño hasta que el técnico haga el ultrasonido. Tener líquido ayuda a que la imagen salga clara.',
    explicacionSencillaEn:
      'Drink plain water one hour before the exam and avoid using the restroom until the ultrasound finishes. A full bladder makes the image clearer.',
  },
  {
    clave: 'biometria_hematica',
    termino: 'Biometría hemática completa',
    aliases: ['biometria', 'biometría', 'bh', 'blood count', 'cbc'],
    explicacionSencillaEs:
      'Es un análisis de sangre común que cuenta tus glóbulos rojos (energía y anemia), glóbulos blancos (defensas) y plaquetas (coagulación).',
    explicacionSencillaEn:
      'A common blood test that counts red blood cells (oxygen/anemia), white blood cells (defenses), and platelets (clotting).',
    ejemploPreparacionEs: 'Ve sin desayunar (8 horas sin comer); sí puedes beber agua simple.',
  },
  {
    clave: 'quimica_sanguinea',
    termino: 'Química sanguínea',
    aliases: ['quimica', 'química', 'qs6', 'qs27', 'blood chemistry'],
    explicacionSencillaEs:
      'Es un estudio de sangre que revisa niveles básicos como azúcar (glucosa), grasas (colesterol y triglicéridos) y cómo trabajan tus riñones.',
    explicacionSencillaEn:
      'A blood test checking key values like blood sugar (glucose), fats (cholesterol), and how well your kidneys work.',
    ejemploPreparacionEs:
      'No comas durante 8 a 12 horas antes y evita alcohol el día anterior. Solo agua simple.',
  },
  {
    clave: 'hba1c',
    termino: 'Hemoglobina glucosilada (HbA1c)',
    aliases: ['glucosilada', 'a1c', 'hba1c'],
    explicacionSencillaEs:
      'Muestra cuál fue tu promedio de azúcar en la sangre durante los últimos 3 meses. No necesitas estar en ayuno estricto.',
    explicacionSencillaEn:
      'Shows your average blood sugar level over the past 3 months. Strict fasting is not required.',
  },
  {
    clave: 'perfil_lipidos',
    termino: 'Perfil de lípidos',
    aliases: ['lipidos', 'lípidos', 'colesterol', 'trigliceridos', 'triglicéridos', 'lipid panel'],
    explicacionSencillaEs:
      'Mide las grasas que circulan en tu sangre (colesterol bueno, colesterol malo y triglicéridos) para cuidar la salud del corazón.',
    explicacionSencillaEn:
      'Measures the fats in your blood (good/bad cholesterol and triglycerides) to help monitor heart health.',
    ejemploPreparacionEs: 'Cena ligero la noche anterior y ve con 12 horas sin comer.',
  },
  {
    clave: 'perfil_tiroideo',
    termino: 'Perfil tiroideo',
    aliases: ['tiroides', 'tiroideo', 'tsh', 'thyroid'],
    explicacionSencillaEs:
      'Revisa las hormonas de la glándula tiroides (en el cuello), que regula tu energía, peso y temperatura del cuerpo.',
    explicacionSencillaEn:
      'Checks hormones from your thyroid gland (in your neck), which regulates energy, metabolism, and body temperature.',
  },
  {
    clave: 'ego',
    termino: 'Examen general de orina (EGO)',
    aliases: ['ego', 'orina', 'urinalysis', 'frasco esteril', 'frasco estéril'],
    explicacionSencillaEs:
      'Revisa una muestra de tu orina para buscar señales de infección urinaria, hidratación o salud de los riñones.',
    explicacionSencillaEn:
      'Checks a urine sample for signs of urinary infection, hydration, or kidney health.',
    ejemploPreparacionEs:
      'Usa un frasco limpio nuevo de farmacia o clínica y junta la primera orina al despertar.',
  },
  {
    clave: 'psa',
    termino: 'Antígeno prostático específico (PSA)',
    aliases: ['psa', 'antigeno prostatico', 'antígeno prostático', 'prostata', 'próstata'],
    explicacionSencillaEs: 'Análisis de sangre para revisión preventiva de la próstata en hombres.',
    explicacionSencillaEn: 'A blood test used for preventive prostate screening in men.',
    ejemploPreparacionEs:
      'Durante 2 días antes evita relaciones sexuales y andar en bicicleta para que el resultado sea exacto.',
  },
  {
    clave: 'mastografia',
    termino: 'Mastografía digital',
    aliases: ['mastografia', 'mastografía', 'mamografia', 'mamografía', 'mammogram'],
    explicacionSencillaEs:
      'Radiografía especial del pecho para prevención y detección oportuna en mujeres. Dura pocos minutos.',
    explicacionSencillaEn:
      'A specialized breast X-ray for preventive screening. It takes only a few minutes.',
    ejemploPreparacionEs:
      'Ve recién bañada, sin ponerte desodorante, crema ni talco en pecho o axilas (pueden salir como manchas en la imagen).',
  },
  {
    clave: 'papanicolaou',
    termino: 'Papanicolaou',
    aliases: ['papanicolaou', 'pap smear', 'citologia', 'citología'],
    explicacionSencillaEs:
      'Estudio preventivo rápido para revisar células del cuello de la matriz y detectar cambios a tiempo.',
    explicacionSencillaEn:
      'A quick preventive exam that checks cells from the cervix to spot changes early.',
  },
  {
    clave: 'electrocardiograma',
    termino: 'Electrocardiograma (ECG)',
    aliases: ['electrocardiograma', 'ecg', 'ekg', 'electro'],
    explicacionSencillaEs:
      'Registra el ritmo eléctrico de tu corazón colocando unos parches suaves en el pecho, brazos y tobillos. No duele ni da toques.',
    explicacionSencillaEn:
      'Records your heart rhythm using soft sticky pads on your chest, arms, and ankles. It is completely painless.',
  },
  {
    clave: 'densitometria',
    termino: 'Densitometría ósea',
    aliases: ['densitometria', 'densitometría', 'osteoporosis', 'bone density'],
    explicacionSencillaEs:
      'Mide qué tan fuertes están tus huesos (cadera y columna) para prevenir fracturas u osteoporosis.',
    explicacionSencillaEn:
      'Measures bone strength in your hip and spine to help detect osteoporosis early.',
  },
  {
    clave: 'tomografia',
    termino: 'Tomografía',
    aliases: ['tomografia', 'tomografía', 'tac', 'ct scan'],
    explicacionSencillaEs:
      'Toma varias radiografías en pocos minutos para crear imágenes muy detalladas por dentro del cuerpo.',
    explicacionSencillaEn:
      'Takes detailed internal images of the body in just a few minutes using X-rays.',
  },
  {
    clave: 'resonancia',
    termino: 'Resonancia magnética',
    aliases: ['resonancia', 'mri', 'rmn'],
    explicacionSencillaEs:
      'Usa imanes (sin radiación) para ver con gran detalle músculos, columna, rodillas u órganos. Por eso debes quitar todo objeto metálico y avisar si tienes marcapasos.',
    explicacionSencillaEn:
      'Uses magnets (no radiation) to take detailed pictures of muscles, spine, knees, or organs. Remove all metal and tell staff if you have a pacemaker.',
  },
  {
    clave: 'bioimpedancia',
    termino: 'Valoración nutricional con bioimpedancia',
    aliases: ['bioimpedancia', 'nutricion', 'nutrición'],
    explicacionSencillaEs:
      'Te subes a una báscula especial que mide tu peso, músculo, grasa corporal y agua sin causar dolor.',
    explicacionSencillaEn:
      'You step onto a special scale that painlessly estimates body weight, muscle, body fat, and water.',
  },
];

/**
 * Convierte la preparación clínica de cualquier estudio a una versión corta en lenguaje sencillo (#26).
 */
export function explicarPreparacionSencilla(
  estudio: EstudioDemo,
  idioma: IdiomaPaciente = 'es',
): string {
  const prep = estudio.preparacion;

  if (idioma === 'en') {
    const pasos: string[] = [];
    const ayuno = prep.match(/ayuno(?:\s+estricto|\s+sugerido)?\s+de\s+([\d\sa]+)\s*horas/i);
    if (ayuno) {
      pasos.push(
        `Do not eat food or sweet drinks for ${ayuno[1].trim()} hours before your appointment (small sips of plain water are fine).`,
      );
    } else if (/no requiere ayuno/i.test(prep)) {
      pasos.push('You can eat normally before your visit.');
    }

    if (/agua|vejiga llena|no orinar|retener orina/i.test(prep)) {
      pasos.push(
        'Drink water 1 hour before and wait to use the restroom until the scan is complete.',
      );
    }
    if (/met[aá]lic|collar|aretes|marcapasos/i.test(prep)) {
      pasos.push('Wear comfortable clothes without metal zippers, jewelry, or belts.');
    }
    if (/desodorante|crema|talco/i.test(prep)) {
      pasos.push('Do not apply deodorant, lotion, or powder on the exam area that day.');
    }
    if (/alcohol/i.test(prep)) {
      pasos.push('Avoid alcohol beforehand.');
    }
    if (/orina|frasco est[eé]ril/i.test(prep)) {
      pasos.push('Collect your first morning urine sample in a clean sterile cup.');
    }
    if (pasos.length === 0) {
      pasos.push('No complicated preparation is required—just arrive 10 minutes early.');
    }
    return `Simple guide for ${estudio.nombre}: ${pasos.join(' ')}`;
  }

  const pasosEs: string[] = [];
  const ayuno = prep.match(/ayuno(?:\s+estricto|\s+sugerido)?\s+de\s+([\d\sa]+)\s*horas/i);
  if (ayuno) {
    pasosEs.push(
      `No comas ni tomes café, leche o jugos durante ${ayuno[1].trim()} horas antes (solo pequeños tragos de agua simple).`,
    );
  } else if (/no requiere ayuno/i.test(prep)) {
    pasosEs.push('Puedes comer normal antes de ir.');
  }

  if (/agua|vejiga llena|no orinar|retener orina/i.test(prep)) {
    pasosEs.push(
      'Toma agua simple 1 hora antes y aguanta las ganas de ir al baño hasta que terminen el estudio.',
    );
  }
  if (/met[aá]lic|collar|aretes|marcapasos/i.test(prep)) {
    pasosEs.push('Lleva ropa cómoda sin metales, joyas ni cierres, y avisa si tienes implantes.');
  }
  if (/desodorante|crema|talco/i.test(prep)) {
    pasosEs.push('No te pongas crema, talco ni desodorante en la zona ese día.');
  }
  if (/alcohol/i.test(prep)) {
    pasosEs.push('Evita bebidas alcohólicas los días previos.');
  }
  if (/frasco est[eé]ril|primera (?:orina|muestra)/i.test(prep)) {
    pasosEs.push('Junta la primera orina de la mañana en un frasco limpio nuevo de farmacia.');
  }
  if (/cafe[ií]na|tabaco/i.test(prep)) {
    pasosEs.push('Evita café, refrescos con cafeína y fumar 2 horas antes.');
  }
  if (/abstinencia|ciclismo/i.test(prep)) {
    pasosEs.push('Evita relaciones sexuales y andar en bicicleta 2 días antes.');
  }
  if (/menstruando/i.test(prep)) {
    pasosEs.push('Programa tu cita en días sin periodo menstrual.');
  }
  if (/lentes de contacto/i.test(prep)) {
    pasosEs.push('Quítate los lentes de contacto 2 horas antes.');
  }
  if (/calcio/i.test(prep)) {
    pasosEs.push('No tomes pastillas de calcio un día antes.');
  }

  if (pasosEs.length === 0) {
    pasosEs.push('No necesitas preparación complicada; solo llega 10 minutos antes.');
  }

  return `Explicación sencilla para ${estudio.nombre}: ${pasosEs.join(' ')}`;
}

export function buscarEnGlosario(consulta: string): TerminoGlosario | null {
  const norm = consulta
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  for (const item of GLOSARIO_MEDICO_SENCILLO) {
    const candidatos = [item.termino, ...item.aliases].map((s) =>
      s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, ''),
    );
    if (candidatos.some((c) => norm.includes(c))) {
      return item;
    }
  }
  return null;
}

export function listarEstudiosConPreparacionSencilla(idioma: IdiomaPaciente = 'es') {
  return ESTUDIOS_DEMO.map((e) => ({
    estudioId: e.id,
    nombre: e.nombre,
    preparacionClinica: e.preparacion,
    preparacionSencilla: explicarPreparacionSencilla(e, idioma),
  }));
}
