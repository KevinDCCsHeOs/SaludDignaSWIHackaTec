import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { clasificarMensajeNlp } = require('../../../dist/ia/clasificador-nlp.js');

const UMBRAL_MINIMO = 0.85;
const frases = JSON.parse(fs.readFileSync(path.join(__dirname, 'frases.json'), 'utf8'));

let aciertosIntencion = 0;
let aciertosIdioma = 0;
const errores = [];

for (const caso of frases) {
  const res = clasificarMensajeNlp(caso.texto, 'es');
  if (res.intencion === caso.intencionEsperada) {
    aciertosIntencion += 1;
  } else {
    errores.push({
      id: caso.id,
      texto: caso.texto,
      esperada: caso.intencionEsperada,
      obtenida: res.intencion,
      confianza: res.confianza,
    });
  }
  if (!caso.idiomaEsperado || res.idioma === caso.idiomaEsperado) {
    aciertosIdioma += 1;
  }
}

const precision = aciertosIntencion / frases.length;
const precisionIdioma = aciertosIdioma / frases.length;

console.log(
  `Evaluación NLP (#24): ${aciertosIntencion}/${frases.length} intenciones correctas (${(precision * 100).toFixed(1)}%) | Idioma: ${aciertosIdioma}/${frases.length} (${(precisionIdioma * 100).toFixed(1)}%)`,
);

if (errores.length > 0) {
  console.log('Desaciertos:', JSON.stringify(errores, null, 2));
}

if (precision < UMBRAL_MINIMO) {
  console.error(
    `FALLO: precisión ${(precision * 100).toFixed(1)}% por debajo del umbral requerido (${UMBRAL_MINIMO * 100}%).`,
  );
  process.exit(1);
}
