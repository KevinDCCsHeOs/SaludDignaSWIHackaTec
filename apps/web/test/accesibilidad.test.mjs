import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(webRoot, '../..');

test('Issue #38: cumple reglas base WCAG 2.1 AA (fuente >= 16px, botones >= 44px, skip-link, reduced-motion y Lighthouse >= 90)', () => {
  const css = fs.readFileSync(path.join(webRoot, 'src/app/globals.css'), 'utf8');
  const layout = fs.readFileSync(path.join(webRoot, 'src/app/layout.tsx'), 'utf8');
  const navbar = fs.readFileSync(path.join(webRoot, 'src/components/Navbar.tsx'), 'utf8');
  const lhci = JSON.parse(fs.readFileSync(path.join(repoRoot, 'lighthouserc.json'), 'utf8'));

  // Fuente base >= 16px y altura táctil >= 44px
  assert.match(css, /font-size:\s*16px/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);

  // Idioma HTML, landmark principal y skip link
  assert.match(layout, /lang="es"/);
  assert.match(layout, /<main id="contenido-principal"/);
  assert.match(navbar, /sd-skip-link/);

  // Umbrales Lighthouse CI >= 90 en Performance, Accesibilidad y Buenas prácticas
  assert.ok(lhci.ci.collect.url.some((u) => u.endsWith('/')));
  assert.ok(lhci.ci.collect.url.some((u) => u.endsWith('/cotizar')));
  assert.ok(lhci.ci.collect.url.some((u) => u.endsWith('/consola')));
  assert.ok(lhci.ci.assert.assertions['categories:performance'][1].minScore >= 0.9);
  assert.ok(lhci.ci.assert.assertions['categories:accessibility'][1].minScore >= 0.9);
  assert.ok(lhci.ci.assert.assertions['categories:best-practices'][1].minScore >= 0.9);
});
