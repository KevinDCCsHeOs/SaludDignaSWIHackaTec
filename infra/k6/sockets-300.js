/* global __ENV */
// Escenario k6 (c): 300 conexiones WebSocket (Socket.IO) concurrentes (#37)
// Ejecución:
//   k6 run -e WS_URL=ws://127.0.0.1:3000 -e API_URL=http://127.0.0.1:3000 infra/k6/sockets-300.js
import http from 'k6/http';
import ws from 'k6/ws';
import { check } from 'k6';

export const options = {
  vus: 300,
  duration: '30s',
  thresholds: {
    checks: ['rate>0.99'],
  },
};

const API_URL = __ENV.API_URL || 'http://127.0.0.1:3000';
const WS_URL = __ENV.WS_URL || 'ws://127.0.0.1:3000';

export function setup() {
  const loginRes = http.post(
    `${API_URL}/auth/login`,
    JSON.stringify({
      email: __ENV.DEMO_EMAIL || 'admin@demo.saluddigna.local',
      contrasena: __ENV.DEMO_PASSWORD || 'DemoAdmin2026!',
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  return { token: loginRes.json().accessToken };
}

export default function (data) {
  const url = `${WS_URL}/socket.io/?EIO=4&transport=websocket`;
  const res = ws.connect(url, { headers: { Authorization: `Bearer ${data.token}` } }, (socket) => {
    socket.on('open', () => {
      // Handshake Socket.IO v4 namespace raíz con JWT
      socket.send(`40{"token":"${data.token}"}`);
    });
    socket.setTimeout(() => {
      socket.close();
    }, 5000);
  });

  check(res, { 'socket 101 switching protocols': (r) => r && r.status === 101 });
}
