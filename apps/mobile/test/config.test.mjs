import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(__dirname, '..');

test('Issue #22: app Expo Router con 5 pestañas, configuración EAS, i18n es/en y soporte push/offline', () => {
  const appJson = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'app.json'), 'utf8'));
  const easJson = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'eas.json'), 'utf8'));
  const es = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'src/i18n/es.json'), 'utf8'));
  const en = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'src/i18n/en.json'), 'utf8'));

  assert.ok(appJson.expo.plugins.includes('expo-router'));
  assert.ok(appJson.expo.plugins.includes('expo-secure-store'));
  assert.ok(appJson.expo.plugins.includes('expo-notifications'));
  assert.equal(easJson.build.preview.android.buildType, 'apk');
  assert.ok(es.app.sinConexion && en.app.sinConexion);

  const pantallasRequeridas = [
    'app/_layout.tsx',
    'app/(auth)/login.tsx',
    'app/(auth)/verificar.tsx',
    'app/(tabs)/_layout.tsx',
    'app/(tabs)/index.tsx',
    'app/(tabs)/mis-tramites.tsx',
    'app/(tabs)/citas.tsx',
    'app/(tabs)/resultados.tsx',
    'app/(tabs)/ayuda.tsx',
    'app/tramite/[folio].tsx',
  ];

  for (const pantalla of pantallasRequeridas) {
    assert.ok(fs.existsSync(path.join(mobileRoot, pantalla)), `Falta pantalla Expo: ${pantalla}`);
  }
});
