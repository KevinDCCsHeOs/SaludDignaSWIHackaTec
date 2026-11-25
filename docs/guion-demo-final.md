# Guion del Demo Final (Fase 3) — Salud Digna Omnicanal

> Issue: **42. [DEMO] Guion del demo final** (#42) · Duración objetivo: **8 minutos exactos**.
>
> **Regla de oro:** solo mostrar en vivo funciones probadas y estables; todos los datos son 100% ficticios (`esDemo: true`).

---

## 1. Roles del equipo durante la presentación

| Rol en el demo | Responsable sugerido | Dispositivo / Pantalla | Qué opera |
| --- | --- | --- | --- |
| **Presentador / Narrador** | Integrante 1 | Laptop principal (proyector) | Conduce la historia, proyecta `/journey/pac_ana_demo` en **Modo presentación** y cierra con KPIs (`/admin`) |
| **Operador Web (Ana)** | Integrante 2 | Laptop secundaria o pestaña alterna | Inicia cotización de Ana en `/cotizar` → `/cotizar/clinica` y cierra abruptamente la pestaña |
| **Operador Móvil (Ana)** | Integrante 3 | Celular proyectado (scrcpy / AirPlay) | Opera WhatsApp real (OTP, retoma, cita, factura) y App móvil Expo (cita confirmada + push) |
| **Operador Call Center (Carlos)** | Integrante 4 | Laptop en `/consola` | Busca a Ana (`Alt+B`), verifica identidad, registra llamada (`Alt+L`) y confirma cita |
| **Líder Técnico / Contingencia** | Integrante 5 | Terminal SSH a VPS + Hotspot | Ejecuta `sembrar-demo.sh --reset` antes de entrar, vigila logs y activa Plan B si se requiere |

---

## 2. Guion minuto a minuto (8 minutos)

| Minuto | Canal / Pantalla | Acción exacta en vivo | Qué destaca el narrador al jurado |
| :---: | --- | --- | --- |
| **0:00 – 1:00** | Diapositiva breve + Proyector en `/journey/pac_ana_demo` (**Modo presentación**) | Presenta el problema real: pacientes que repiten sus datos al pasar de Web a WhatsApp o Call Center. Muestra los 4 pilares (Identidad, Contexto, Trazabilidad y Privacidad LFPDPPP). | *"No es un buzón unificado de mensajes: es una sola conversación persistente con identidad verificada y trazabilidad en tiempo real."* |
| **1:00 – 2:00** | **Portal Web** (`/login` → `/cotizar` → `/cotizar/clinica`) | Ana entra con acceso rápido demo, cotiza **Ultrasonido abdominal (\$450)**, prueba **"Explícame fácil"** en la preparación, elige **Salud Digna Puebla Centro** en el mapa Leaflet, aparece el banner de autoguardado y **cierra la pestaña abruptamente** sin agendar. | *"Sin presionar 'Confirmar', su avance ya quedó autoguardado en MySQL y Redis. En el proyector el jurado ve encenderse el nodo **Portal Web** al instante."* |
| **2:00 – 4:00** | **WhatsApp** (celular proyectado) + Proyector en `/journey/pac_ana_demo` | Ana escribe `"Hola"`. El bot detecta su teléfono normalizado, **no revela nada todavía** y envía un **OTP de 6 dígitos**. Ana ingresa el código; el bot la saluda por su nombre, reconoce su *Ultrasonido abdominal en Puebla Centro* y ofrece continuar. Ana toca **"Sí, continuar"** → **"Mañana 9:00"** → cita agendada (`cita_agendada`). *(Opcional 15 s: escribe `"Quiero mi factura"` y recibe el PDF simulado).* | *"Regla de privacidad: verificar antes de revelar. Sin repetir estudio ni clínica, Ana retoma donde se quedó. Observen en el proyector cómo la flecha animada salta en vivo de **Web → WhatsApp** sin recargar la página."* |
| **4:00 – 5:00** | **Consola Call Center** (`/consola`) | Carlos presiona `Alt+B`, busca el teléfono de Ana (CURP enmascarada `****ZN04`), valida identidad con preguntas de seguridad, ve todo el contexto Web → WhatsApp en el timeline en vivo, registra llamada con `Alt+L` y presiona **Confirmar cita** (`cita_confirmada`). | *"El asesor nunca vuelve a pedir datos y jamás ve la CURP completa. El registro de llamada queda en el mismo timeline."* |
| **5:00 – 6:00** | **App Móvil Expo** (celular proyectado) | Llega notificación push de cita confirmada. Ana abre la app móvil en pestaña **Inicio / Citas**, ve su cita confirmada con código, el timeline completo **Web → WhatsApp → Call Center → App** y el panel de alertas preventivas activas. | *"Cuatro canales reales hablando contra un único API fuente de verdad."* |
| **6:00 – 7:00** | **Dashboard Admin KPIs** (`/admin`) y **Vista Médica** (`/medico` breve) | El presentador muestra los KPIs calculados sobre eventos reales (**% de trámites retomados en otro canal**, tiempos promedio, tickets por región con Recharts, estatus de clínicas y botón **Exportar CSV**). Menciona la jerarquía `captura → revisión técnica → validación médica → liberación` y el guardrail 911 de la IA. | *"Cada indicador nace de eventos reales en el bus Outbox, no de números fijos. La IA apoya en primer nivel (es/en/náhuatl), nunca diagnostica y ante síntomas de alarma deriva al 911."* |
| **7:00 – 8:00** | Cierre técnico y preguntas | Resume arquitectura en VPS (Docker Compose + Nginx HTTPS + MySQL 8 + Redis AOF), resultados de pruebas de carga (`p95 < 210 ms`, 0% error, 300 sockets), resiliencia verificada 3/3 y cumplimiento NOM-024 / NOM-004 / LFPDPPP. | *"Listo para preguntas del jurado."* |

---

## 3. Preguntas frecuentes del jurado (respuestas con datos reales)

| Pregunta probable | Respuesta directa respaldada por el código |
| --- | --- |
| **¿Cómo protegen datos sensibles de salud (LFPDPPP)?** | Cifrado **AES-256-GCM** para CURP, fecha de nacimiento y datos fiscales (`CifradoService`), `curp_hash` con *pepper*, enmascarado por rol en consola (`****ZN04`), sanitización de logs (`SanitizedLogger`), OTP obligatorio antes de revelar contexto y resultados bloqueados (`403`) hasta validación médica. |
| **¿Qué pasa si se cae el servidor o el paciente pierde internet?** | Trámites, contexto, tickets y eventos persisten en MySQL 8 + Redis AOF y se reconstruyen al reiniciar (`onModuleInit`). Verificado con `npm run test:resiliencia:3x` (3/3 corridas). La app móvil conserva caché local sin conexión. |
| **¿Soporta muchos usuarios concurrentes?** | Sí: catálogos y contexto en Redis, webhook de WhatsApp no bloqueante (`200 OK` + cola), y benchmark verificado (`docs/escalabilidad-y-carga.md`): `202 ms p95` en 200 VU de contexto, `36 ms p95` en ráfaga de 300 webhooks y `37 ms p95` en 300 sockets simultáneos (0% error). |
| **¿La IA puede equivocarse y dar un diagnóstico médico?** | No: tiene *guardrails* deterministas previos y posteriores al LLM que bloquean diagnósticos, recetas e interpretación clínica, derivan síntomas de alarma al **911** con ticket `critica`, muestran menú si `confianza < 0.6` y escalan a humano tras 2 fallos seguidos. Evaluación NLP: **96% en 50 frases** (`npm run eval:ia`). |

---

## 4. Plan B y contingencias del día del demo

| Incidente | Acción inmediata (sin detener la presentación) |
| --- | --- |
| **Falla Wi-Fi del recinto** | Conectar laptop principal y celular al **hotspot 4G/5G propio** (preconfigurado antes de entrar). |
| **Retraso o límite en Meta WhatsApp Cloud API** | Continuar la conversación en el **Chat Web con IA** + demostrar envío de correo simulado (`POST /canales/email/entrante`) y el salto en vivo en `/consola` y `/journey/pac_ana_demo`. |
| **Caída de la VPS** | Cambiar a **laptop de respaldo** con `docker compose -f infra/docker-compose.dev.yml up -d && npm run dev` ya precalentado, o reproducir el **video de respaldo** (grabado en alta resolución del flujo completo de 8 min). |
| **Escenario de Ana sucio de una prueba anterior** | Ejecutar `./infra/scripts/sembrar-demo.sh --reset` (toma < 5 segundos dejar el escenario en cero). |

---

## 5. Registro de ensayos cronometrados y preparación física

### Lista de equipo físico obligatorio
- [ ] Laptop principal + adaptador HDMI/USB-C + cargador.
- [ ] Laptop de respaldo con repositorio compilado y video de respaldo grabado localmente (`.mp4`).
- [ ] Celular de demo con WhatsApp + App Expo instalada + cable USB para proyección estable.
- [ ] Segundo celular o módem portátil con plan de datos activo (hotspot exclusivo del demo).
- [ ] Copia impresa de [`docs/checklist-demo.md`](checklist-demo.md).

### Tabla de ensayos (llenar antes de la final)

| Ensayo | Fecha | Duración total | Fallas encontradas | Ajustes aplicados |
| :---: | --- | :---: | --- | --- |
| 1 | ____ / ____ / 2026 | __:__ min | | |
| 2 | ____ / ____ / 2026 | __:__ min | | |
| 3 (general + grabación Plan B) | ____ / ____ / 2026 | __:__ min | | |
