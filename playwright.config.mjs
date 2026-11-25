// Configuración Playwright para pruebas E2E web + consola (#39)
// Ejecución contra entorno local o VPS:
//   WEB_URL=http://127.0.0.1:3002 API_URL=http://127.0.0.1:3000 npx playwright test
export default {
  testDir: './tests/e2e',
  timeout: 45_000,
  retries: 0,
  use: {
    baseURL: process.env.WEB_URL ?? 'http://127.0.0.1:3002',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
};
