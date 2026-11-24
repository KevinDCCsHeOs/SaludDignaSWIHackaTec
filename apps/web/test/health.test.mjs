import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '..');

test('Issues #18 y #19: i18n es/en completo y páginas Next.js App Router presentes', () => {
  const es = JSON.parse(fs.readFileSync(path.join(webRoot, 'src/i18n/es.json'), 'utf8'));
  const en = JSON.parse(fs.readFileSync(path.join(webRoot, 'src/i18n/en.json'), 'utf8'));

  assert.ok(es.inicio.bannerPendienteTitulo);
  assert.ok(en.inicio.bannerPendienteTitulo);
  assert.ok(es.cotizar.autoguardadoOk);
  assert.ok(es.chat.respuestaUrgencia.includes('911'));

  const rutasRequeridas = [
    'src/app/page.tsx',
    'src/app/login/page.tsx',
    'src/app/cotizar/page.tsx',
    'src/app/cotizar/clinica/page.tsx',
    'src/app/cotizar/cita/page.tsx',
    'src/app/mis-tramites/page.tsx',
    'src/app/mis-tramites/[folio]/page.tsx',
    'src/app/resultados/page.tsx',
    'src/app/consola/page.tsx',
    'src/app/api/health/route.ts',
  ];

  for (const ruta of rutasRequeridas) {
    assert.ok(fs.existsSync(path.join(webRoot, ruta)), `Falta página requerida: ${ruta}`);
  }
});
