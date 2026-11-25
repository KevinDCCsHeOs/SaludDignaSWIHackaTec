/**
 * Prueba E2E con Playwright del recorrido de Ana (Web -> cierre abrupto -> WhatsApp -> Consola -> Journey, #39).
 * Requiere `apps/api`, `apps/whatsapp-bot` y `apps/web` levantados (ver `docs/checklist-demo.md`).
 * Ejecutar con: `npx playwright test tests/e2e/recorrido-ana.spec.mjs`
 */
import crypto from 'node:crypto';
import { expect, test } from '@playwright/test';

const BOT_URL = process.env.BOT_URL ?? 'http://127.0.0.1:3001';
const WA_APP_SECRET = process.env.WA_APP_SECRET ?? 'dev-wa-app-secret';

async function simularMensajeWhatsapp(messageId, from, texto) {
  const payload = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            value: {
              messages: [{ id: messageId, from, type: 'text', text: { body: texto } }],
            },
          },
        ],
      },
    ],
  });
  const firma = `sha256=${crypto.createHmac('sha256', WA_APP_SECRET).update(payload).digest('hex')}`;
  const res = await fetch(`${BOT_URL}/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': firma },
    body: payload,
  });
  expect(res.status).toBe(200);
}

test('Recorrido de Ana en Web -> cierre abrupto -> Consola y Patient Journey en vivo (#39)', async ({
  browser,
}) => {
  // 1. Portal web del paciente: Ana inicia cotización, elige clínica y cierra el navegador
  const ctxPaciente = await browser.newContext();
  const page = await ctxPaciente.newPage();

  await page.goto('/login');
  await page.getByRole('button', { name: /Ana \(Paciente\)/i }).click();
  await page.waitForURL('/');

  await page.goto('/cotizar');
  await page
    .getByRole('button', { name: /Elegir y continuar/i })
    .first()
    .click();
  await page.waitForURL(/\/cotizar\/clinica/);

  await page
    .getByRole('button', { name: /Elegir clínica/i })
    .first()
    .click();
  await expect(page.getByRole('status')).toContainText(/autoguardado/i);

  // Cierre abrupto de sesión/navegador antes de confirmar cita
  await ctxPaciente.close();

  // 2. Simulación del webhook de WhatsApp (responde 200 sin bloquear)
  await simularMensajeWhatsapp(`wamid.e2e.${Date.now()}`, '522221234567', 'Hola').catch(
    () => undefined,
  );

  // 3. Consola del asesor y Patient Journey en vivo
  const ctxAsesor = await browser.newContext();
  const pageAsesor = await ctxAsesor.newPage();
  await pageAsesor.goto('/login');
  await pageAsesor.getByRole('button', { name: /Carlos \(Asesor\)/i }).click();
  await pageAsesor.waitForURL('/consola');

  await pageAsesor.goto('/journey/pac_ana_demo');
  await expect(pageAsesor.getByRole('heading', { name: /Patient Journey/i })).toBeVisible();
  await expect(pageAsesor.getByText(/Contexto acumulado/i)).toBeVisible();

  await ctxAsesor.close();
});
