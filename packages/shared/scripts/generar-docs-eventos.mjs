import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const { CATALOGO_EVENTOS, EventoOmnicanalSchema } = require('../dist/events/index.js');

function generarMarkdown() {
  const filasTabla = CATALOGO_EVENTOS.map((ev) => {
    const consumidores = ev.consumidores.map((c) => `\`${c}\``).join(', ');
    return `| \`${ev.tipo}\` | v${ev.version} | \`${ev.emisor}\` | ${consumidores} | ${ev.descripcion} |`;
  }).join('\n');

  const seccionesEjemplos = CATALOGO_EVENTOS.map((ev) => {
    // Validar cada ejemplo contra el esquema Zod antes de documentarlo
    const validado = EventoOmnicanalSchema.parse(ev.ejemplo);
    return [
      `### \`${ev.tipo}\` (v${ev.version})`,
      '',
      `- **Descripción:** ${ev.descripcion}`,
      `- **Emisor:** \`${ev.emisor}\``,
      `- **Consumidores:** ${ev.consumidores.map((c) => `\`${c}\``).join(', ')}`,
      '',
      '```json',
      JSON.stringify(validado, null, 2),
      '```',
    ].join('\n');
  }).join('\n\n');

  return `# Catálogo de eventos omnicanal

> Issue: **03. [ARQ] Catálogo de eventos omnicanal** (#3)
>
> **Archivo generado automáticamente** desde los esquemas Zod de [\`packages/shared/src/events/catalogo.ts\`](../packages/shared/src/events/catalogo.ts).
> No edites manualmente las tablas ni los ejemplos; actualiza los esquemas y ejecuta \`npm run docs:eventos\`.

## 1. Convención de nombres y sobre común

Todo cambio de estado en la plataforma emite un evento con el patrón \`dominio.accion\` en minúsculas y \`snake_case\` (expresión regular \`^[a-z][a-z0-9_]*\\.[a-z][a-z0-9_]*$\`).

### Estructura común obligatoria

| Campo | Tipo | Descripción |
| --- | --- | --- |
| \`eventId\` | \`UUID v4\` | Identificador único del evento; garantiza idempotencia en consumidores (ADR 0003). |
| \`tipo\` | \`dominio.accion\` | Clave discriminante del catálogo. |
| \`version\` | \`int >= 1\` | Versión del esquema de \`datos\`. |
| \`pacienteId\` | \`string \\| null\` | Identificador del paciente (nulo solo si aún no está resuelto). |
| \`tramiteId\` | \`string \\| null\` | Identificador del trámite asociado cuando aplica. |
| \`canal\` | \`CanalAtencion\` | Canal donde ocurrió la acción (\`web\`, \`app\`, \`whatsapp\`, \`call_center\`, \`email\`). |
| \`actor\` | \`{ tipo, id }\` | Quién ejecutó la acción (\`paciente\`, \`asesor_ia\`, \`asesor\`, \`medico\`, \`sistema\`, etc.). |
| \`timestamp\` | \`ISO-8601 UTC\` | Fecha y hora exacta de emisión. |
| \`datos\` | \`object\` | Payload específico validado con Zod según \`tipo\` y \`version\`. |

## 2. Regla de versionado

- **Cambios compatibles (misma versión):** agregar propiedades opcionales a \`datos\` o ampliar documentación no rompe consumidores existentes.
- **Cambios incompatibles (nueva versión):** renombrar, eliminar o cambiar el tipo de una propiedad obligatoria exige incrementar \`version\` (por ejemplo \`v2\`). Ambas versiones coexisten en \`packages/shared/src/events\` hasta migrar todos los consumidores.
- **Uso obligatorio del contrato:** todos los canales y módulos del API deben importar los tipos y validadores desde \`@salud-digna/shared\` (o \`@salud-digna/shared/events\`).

## 3. Tabla de eventos (generada desde Zod)

| Evento (\`tipo\`) | Versión | Emisor | Consumidores | Propósito |
| --- | --- | --- | --- | --- |
${filasTabla}

## 4. Ejemplos de payload validados

> Todos los ejemplos utilizan datos 100% ficticios del escenario demo de **Ana López** y son validados por \`EventoOmnicanalSchema.parse()\` durante la generación.

${seccionesEjemplos}
`;
}

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const targetFile = path.join(repoRoot, 'docs', 'eventos.md');
const contenido = generarMarkdown();
const checkMode = process.argv.includes('--check');

if (checkMode) {
  const actual = fs.existsSync(targetFile)
    ? fs.readFileSync(targetFile, 'utf8').replace(/\r\n/g, '\n')
    : '';
  if (actual !== contenido) {
    console.error(
      'ERROR: docs/eventos.md está desactualizado respecto a packages/shared/src/events. Ejecuta: npm run docs:eventos',
    );
    process.exit(1);
  }
  console.log(`OK: docs/eventos.md sincronizado (${CATALOGO_EVENTOS.length} eventos validados).`);
} else {
  fs.writeFileSync(targetFile, contenido, 'utf8');
  console.log(`Generado ${path.relative(repoRoot, targetFile)} con ${CATALOGO_EVENTOS.length} eventos.`);
}
