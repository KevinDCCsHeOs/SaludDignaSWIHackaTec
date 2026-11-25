/* global __ENV */
// Escenario k6 (a): 200 usuarios concurrentes consultando contexto y catálogos (#37)
// Ejecución:
//   k6 run -e API_URL=https://api.<dominio> infra/k6/contexto-200vu.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '15s', target: 50 },
    { duration: '30s', target: 200 },
    { duration: '30s', target: 200 },
    { duration: '15s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

const API_URL = __ENV.API_URL || 'http://127.0.0.1:3000';

export function setup() {
  const loginRes = http.post(
    `${API_URL}/auth/login`,
    JSON.stringify({
      email: __ENV.DEMO_EMAIL || 'ana.lopez@demo.saluddigna.local',
      contrasena: __ENV.DEMO_PASSWORD || 'DemoPaciente2026!',
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(loginRes, { 'login 200/201': (r) => r.status === 200 || r.status === 201 });
  const body = loginRes.json();
  return { token: body.accessToken };
}

export default function (data) {
  const headers = { Authorization: `Bearer ${data.token}`, 'x-canal': 'web' };

  const catRes = http.get(`${API_URL}/catalogos/estudios`, { headers });
  check(catRes, { 'estudios 200': (r) => r.status === 200 });

  const cliRes = http.get(`${API_URL}/catalogos/clinicas?region=Puebla`, { headers });
  check(cliRes, { 'clinicas 200': (r) => r.status === 200 });

  const trmRes = http.get(`${API_URL}/pacientes/pac_ana_demo/tramites`, { headers });
  check(trmRes, { 'tramites 200': (r) => r.status === 200 });

  sleep(0.5);
}
