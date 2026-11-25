# Checklist Pre-Demo e Imprimible para el Día del Demo — Salud Digna Omnicanal

Guía operativa y lista de verificación imprimible para asegurar un demo sin contratiempos ante el jurado (Issue #39).

---

## A. Checklist 24 horas antes del demo

- [ ] **Código y CI:** Último PR fusionado en `main` con los 5 checks de `.github/workflows/ci.yml` en verde.
- [ ] **Resiliencia verificada 3 veces seguidas:** Ejecutar `npm run test:resiliencia:3x` (0 fallos).
- [ ] **Evaluación NLP:** Ejecutar `npm run eval:ia` (precisión ≥ 85%).
- [ ] **VPS saludable:** Confirmar `docker compose -f infra/docker-compose.prod.yml ps` con `mysql`, `redis`, `api`, `whatsapp-bot`, `web` y `nginx` en estado `healthy`.
- [ ] **Endpoints HTTPS activos:**
  - [ ] `https://api.<dominio>/health` → `{"estado":"ok",...}`
  - [ ] `https://app.<dominio>/api/health` → `200 OK`
  - [ ] `https://wa.<dominio>/health` → `200 OK`
- [ ] **Respaldo preventivo:** Ejecutar `./infra/scripts/respaldar-mysql.sh` y probar `./infra/scripts/restaurar-mysql.sh <archivo>` en `salud_digna_prueba`.
- [ ] **WhatsApp Cloud API:** Confirmar en Meta Developers que el número del presentador está en la lista de destinatarios y `DEMO_TELEFONO_PACIENTE` coincide en `infra/.env.prod`.
- [ ] **App móvil lista:** APK `preview` instalada (o Expo Go) apuntando a `https://api.<dominio>`, con batería > 80%.

---

## B. Checklist 30 minutos antes de pasar con el jurado (Imprimible)

| # | Verificación | Estado |
| --- | --- | --- |
| 1 | Reiniciar escenario limpio de Ana: `./infra/scripts/sembrar-demo.sh --reset` | [ ] |
| 2 | Abrir **Pestaña 1 (proyector):** `https://app.<dominio>/journey/pac_ana_demo` como `admin@demo.saluddigna.local` en **Modo presentación** | [ ] |
| 3 | Abrir **Pestaña 2 (paciente):** `https://app.<dominio>/login` listo para entrar como **Ana (Paciente)** | [ ] |
| 4 | Abrir **Pestaña 3 (asesor):** `https://app.<dominio>/consola` logueado como **Carlos (Asesor)** | [ ] |
| 5 | Abrir **Pestaña 4 (KPIs):** `https://app.<dominio>/admin` logueado como **Admin** | [ ] |
| 6 | Abrir **WhatsApp** en el celular del presentador con el chat del número de prueba listo | [ ] |
| 7 | Abrir **App móvil Expo** en el celular (sesión de Ana lista para refrescar) | [ ] |
| 8 | Comprobar conexión a internet de respaldo (hotspot celular listo por si falla el Wi-Fi del recinto) | [ ] |

---

## C. Guion de verificación en vivo (4 canales + resiliencia)

1. **Web (`/cotizar` → `/cotizar/clinica`):** Ana inicia cotización de *Ultrasonido abdominal*, elige *Salud Digna Puebla Centro* → se muestra banner de autoguardado → **cierra la pestaña abruptamente** (sin confirmar cita).
2. **Proyector (`/journey/pac_ana_demo`):** El jurado ve en vivo el paso a `seleccion_clinica` en el nodo **Portal Web**.
3. **WhatsApp:** Ana escribe *"Hola"* → recibe OTP de 6 dígitos → responde el código → el bot reconoce el *Ultrasonido abdominal* en *Puebla Centro* sin pedir datos repetidos → Ana elige *"Mañana 9:00"* → cita agendada (`cita_agendada`).
4. **Call Center (`/consola`):** Carlos busca a Ana (`Alt+B`), verifica con preguntas de seguridad, ve todo el contexto y timeline en vivo, registra llamada (`Alt+L`) y confirma la cita (`cita_confirmada`).
5. **App Móvil:** Ana abre la app y ve su cita confirmada con código de confirmación y timeline unificado (y su factura simulada descargable si la solicitó por WhatsApp).
6. **Plan B (si falla red de Meta durante el demo):** Usar el chat web + simulación de correo entrante y consola `/consola` + `/journey/pac_ana_demo` (100% independientes de Meta).
