/* global __ENV, __VU, __ITER */
// Escenario k6 (b): 100 mensajes/s al webhook de WhatsApp (sin golpear Meta real, #37)
// Ejecución:
//   k6 run -e BOT_URL=http://127.0.0.1:3001 -e WA_APP_SECRET=dev-wa-app-secret infra/k6/webhook-100rps.js
import crypto from 'k6/crypto';
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  scenarios: {
    rafaga_webhook: {
      executor: 'constant-arrival-rate',
      rate: 100,
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 40,
      maxVUs: 120,
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

const BOT_URL = __ENV.BOT_URL || 'http://127.0.0.1:3001';
const APP_SECRET = __ENV.WA_APP_SECRET || 'dev-wa-app-secret';

export default function () {
  const msgId = `wamid.k6.${__VU}.${__ITER}.${Date.now()}`;
  const payload = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  id: msgId,
                  from: '522229990001',
                  type: 'text',
                  text: { body: 'Hola, quiero consultar estudios' },
                },
              ],
            },
          },
        ],
      },
    ],
  });

  const firma = `sha256=${crypto.hmac('sha256', APP_SECRET, payload, 'hex')}`;
  const res = http.post(`${BOT_URL}/webhook`, payload, {
    headers: {
      'Content-Type': 'application/json',
      'X-Hub-Signature-256': firma,
    },
  });

  check(res, {
    'webhook responde 200 inmediato': (r) => r.status === 200,
  });
}
