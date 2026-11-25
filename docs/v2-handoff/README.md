# Traspaso al prototipo v2.0 · Sistema omnicanal (Hackatec, reto de Salud Digna)

**Equipo Wharton · Instituto Tecnológico de Orizaba (TecNM)**
Paquete preparado por los equipos 2 (marco teórico) y 3 (caso de estudio LC-01) para el equipo 1 (prototipo funcional).

Este paquete reúne lo que se diseñó y validó con tres simuladores: usuarios y vínculos, escenarios y rutas de atención, eventos por canal, tiempos de sesión, migración entre canales, panel tipo CRM y requisitos de carga. **No es código de producción.** Es la especificación y la referencia visual para construir la versión 2.0 sobre el prototipo que ya funciona.

---

## 0. Cómo usar este paquete

1. Copia la carpeta completa dentro del repositorio del prototipo, por ejemplo en `docs/v2-handoff/`.
2. Abre los simuladores en `simuladores/` con cualquier navegador (son HTML autocontenidos, sin servidor). Empieza por `index.html`.
3. Si usas Claude Code, el archivo `CLAUDE.md` de esta carpeta ya le indica qué leer y qué reglas respetar. Un mensaje de arranque sugerido está en la sección 14.
4. Lo que es **regla de negocio** está en las secciones 2 a 9 y en `especificaciones/`. Lo que es **apariencia** está en la sección 11 y en los HTML.

```
v2-handoff/
├── README.md                     ← este documento
├── CLAUDE.md                     ← instrucciones para Claude Code
├── simuladores/                  ← 4 HTML funcionales (referencia de front end y de lógica)
│   ├── index.html
│   ├── 1-escenarios-de-atencion.html
│   ├── 2-panel-omnicanal.html
│   └── 3-carga-omnicanal.html
├── especificaciones/             ← lo que se puede leer como dato
│   ├── perfiles.json             ← 8 perfiles con permisos por acción
│   ├── solicitudes.json          ← 16 solicitudes y salidas no conformes con probabilidad × impacto
│   ├── rutas-por-riesgo.json     ← umbrales y ajustes de la ruta de atención
│   ├── plazos.json               ← temporizadores de producción y de exposición
│   ├── canales.json
│   ├── eventos.json              ← 68 tipos de evento con categoría y descripción
│   ├── plantillas-proceso.json   ← pasos de cada proceso (barra de avance del panel)
│   ├── casos-semilla.json        ← 26 casos de ejemplo para precargar la base
│   ├── escenarios-prueba.jsonl   ← 640 escenarios (perfil × canal × solicitud) con pasos y eventos esperados
│   ├── carga-presets-y-salud.json
│   └── schema.sql                ← modelo de datos propuesto (PostgreSQL)
├── carga/
│   ├── simulacion_cargas.py      ← simulación de carga (Python 3 + numpy)
│   └── prueba-carga-k6.js        ← prueba de carga del servidor del prototipo
└── docs/
    └── escenarios-carga-identidad-sesiones.md  ← documento completo de los tres retos de los mentores
```

---

## 1. El reto en una línea y lo que se evalúa

Un paciente, una sola conversación: el sistema reconoce a la persona en web, app, WhatsApp, teléfono y clínica, guarda el avance real de su trámite y deja registro de cada paso. Se evalúa en vivo con al menos tres canales y con vistas por rol (paciente, asesor u operador, administrador o gerente).

| Pilar | Terminado cuando… |
|---|---|
| Identidad | Se reconoce a la misma persona en todos los canales sin duplicarla y sin fusionar a dos personas |
| Contexto y estado | El paciente cambia de canal y no repite ningún dato ni paso |
| Trazabilidad | Cada interacción queda como evento con canal, hora, actor y paciente |
| Seguridad | Autenticación por rol, bitácora de accesos, el operador no ve contenido clínico |

---

## 2. Principios de diseño (no negociables)

1. **Un núcleo, muchos canales.** Todos los canales, incluido cualquier bot, usan la misma API. Las reglas viven en el núcleo, nunca en el canal.
2. **Una persona, un ID.** Un menor tiene su propio ID. Las relaciones **unen** IDs, nunca los **fusionan**.
3. **Actor ≠ paciente.** Cada evento guarda quién actuó, para quién y con qué rol.
4. **El identificador de canal no es la persona.** Un número puede ser de varias personas: el sistema pregunta para quién es el trámite.
5. **Se cierra la conversación, no el trámite.** El estado vive en la base de datos.
6. **Un solo canal propietario a la vez** (*lease* con caducidad y número de versión). Cambiar de canal es transferir el permiso; el canal anterior deja de escribir.
7. **El número que llama es una pista, no una prueba.** Sirve para encontrar el trámite; para mostrar datos se pide código.
8. **Eventos inmutables con la hora del hecho.** Un vencimiento se registra a la hora del umbral, no a la hora en que se detectó.
9. **Valores críticos y emergencias nunca por bot.** Interviene una persona; no hay triaje clínico.
10. **El operador ve estados, no resultados.** "Liberado / pendiente", nunca el valor.
11. **Idempotencia.** Toda escritura lleva llave única; un reintento no duplica cita, pago ni evento.

---

## 3. Usuarios, vínculos y permisos

Perfiles completos en `especificaciones/perfiles.json`. Los ocho perfiles de prueba:

| Perfil | Actor → paciente | Vínculo |
|---|---|---|
| titular | Ana → Ana | Titular, teléfono verificado (V1) |
| tutor | Ana → Leo (8) | Tutora de menor, V2, vence a los 18 |
| cuid | Ana → Don Pedro (78) | Cuidadora, V2, 12 meses, revocable por él |
| cony | Raúl → Ana | Esposo, V1: agendar y pagar, **sin resultados** |
| adol | Sofía → Sofía (17) | Titular menor de edad; tutora Ana |
| comp | Número familiar → por elegir | Un número vinculado a 3 personas |
| med | Dra. Méndez → Don Pedro | Profesional con cédula verificada y doble factor |
| nuevo | Persona sin registro | V0: se registra antes de transaccionar |

**Niveles de confianza del vínculo:** V0 declarado · V1 confirmado con código por el dueño de los datos · V2 verificado con documento en clínica · V3 instrumento legal (designación de apoyos), validado por un área especializada, nunca por el bot.

**Escenarios de vinculación** (detalle en `docs/…`, sección 2.5): alta de tutor de menor (V0 → V2), adolescente con política por tipo de estudio, vencimiento automático a los 18, cónyuge que agenda con autorización de la titular, cuidador de adulto mayor con consentimiento, apoyos legales, teléfono compartido, médico referidor que solo ve sus órdenes con consentimiento, médica que también es paciente (una persona, dos roles), conflictos (se congela y se escala).

---

## 4. Ruta de atención por riesgo

`especificaciones/rutas-por-riesgo.json` y `solicitudes.json`. Riesgo = probabilidad × impacto (1–5 cada uno).

| Riesgo | Ruta | Quién atiende | Compromiso propuesto |
|---|---|---|---|
| ≤ 4 | Aceptar | Autoservicio completo | Inmediato |
| 5–9 | Reducir | Bot con confirmación y seguimiento | Inmediato |
| 10–14 | Compartir | Asesor o especialista con contexto | Una persona en < 2 min |
| 15–19 | Escalar | Supervisor, médico o soporte | Una persona en < 15 min |
| ≥ 20 | Evitar | Una persona de inmediato; el bot no responde el contenido | < 2 min |

**Ajustes:** estrés +5 · tercero sin permiso pidiendo resultados → Evitar · corregir identidad sin permiso → mínimo Escalar · otra lengua con contenido clínico → mínimo Compartir · valor crítico y emergencia → siempre Evitar.

Los 16 casos (8 solicitudes y 8 salidas no conformes del caso LC-01) están en `solicitudes.json`. Los pasos, eventos y datos que se guardan en cada combinación perfil × canal × solicitud están en `escenarios-prueba.jsonl`: **úsalos como pruebas de aceptación**.

---

## 5. Temporizadores (los "cronómetros")

`especificaciones/plazos.json`.

| Reloj | Producción | Exposición (demo) | Al vencer |
|---|---|---|---|
| Aviso de inactividad | 10 min | 30 s | Un solo mensaje que ya anuncia el cierre y cómo retomar |
| Cierre de conversación | 30 min | 60 s | Sin mensaje; `tramite.pausado`; el trámite conserva todo |
| Código de un solo uso | 15 min | 15 min (no se reduce) | Pedir código nuevo antes de mostrar datos sensibles |
| Horario apartado | 15 min | 2 min | `cupo.liberado`; al continuar se propone otro horario sin pedir datos |
| Canal propietario (*lease*) | 2 min | 20 s | `canal.propietario_liberado`; cualquier canal puede retomar |
| Borrador del trámite | 7 días | 7 días | Se archiva como abandonado |
| Asignación de chat al asesor | 5 min | 30 s | El chat vuelve a la cola |

Reglas de implementación que salieron de los simuladores:
- La inactividad se mide desde la **última interacción** (cualquier paso). El tiempo que tarda el personal en resolver un paso no cuenta como inactividad del paciente.
- Los eventos de vencimiento se registran con `ocurrido_en` = hora del umbral.
- Si la conversación está pausada y el paciente vuelve, primero `tramite.reanudado` ("CONTINUAR"); si el código venció, se pide uno nuevo; si el horario se liberó, se reaparta.
- En modo demo, el ritmo sugerido por paso queda por debajo del aviso de inactividad para no disparar abandonos falsos.

---

## 6. Migración de canal (WhatsApp → llamada, o a la app)

1. Llega la llamada; el número coincide con el WhatsApp de la persona → se encuentra el trámite abierto.
2. Si el número está vinculado a varias personas, se pregunta para quién es.
3. Antes de mencionar el estudio se valida un código de un solo uso.
4. Transacción: `canal_propietario = tel`, `version + 1`, evento `contexto.transferido`.
5. La sesión de WhatsApp pasa a "transferida": el bot deja de enviar (ahorra costo y evita mensajes cruzados). Si el paciente escribe por WhatsApp durante la llamada, se responde una sola vez que está en atención telefónica.
6. El operador ve el contexto acumulado y continúa; cualquier escritura con versión vieja se rechaza.
7. Al colgar se libera el permiso; si se corta la llamada, caduca solo.

Desde el 1 de octubre de 2026 Meta cobra por mensaje las respuestas dentro de la ventana de 24 horas; por eso el aviso de inactividad y el cierre van en un solo mensaje y el canal transferido se silencia.

---

## 7. Catálogo de eventos

`especificaciones/eventos.json`: 68 tipos `objeto.accion` en diez categorías (canal, sesión, identidad, relación, consentimiento, seguridad, trámite, servicio, enrutamiento, seguimiento). Incluye los eventos de servicio que vienen de las salidas no conformes del caso LC-01 (`muestra.rechazada`, `entrega.reprogramada`, `factura.cancelada`, `resultado.valor_critico`…).

Campos mínimos de cada evento: `id, tipo, tramite_id, persona_paciente_id, persona_actor_id, rol_actor, canal, ocurrido_en, version_tramite, datos, correlacion_id, llave_idempotencia`.

---

## 8. Panel tipo CRM (operador y gerente de contact center)

Referencia: `simuladores/2-panel-omnicanal.html`, `plantillas-proceso.json`, `casos-semilla.json`.

**Vista del operador**
- **Barra de avance por proceso:** cada plantilla tiene pasos; avance = pasos completados / total. Sobre cada tramo, el canal donde se completó. El tramo siguiente se marca como "aquí se quedó".
- **Detenido:** sin actividad durante el umbral (2, 24 o 72 h), o en espera de un proceso interno. Se distingue **detenido por el paciente** (ámbar) de **por proceso interno** (rojo). Los seguimientos que envía el contact center no cuentan como actividad.
- **Semáforo de seis canales** (web, app, WhatsApp, teléfono, clínica, correo): verde = activo ahora; ámbar = usado y pausado, ventana de WhatsApp cerrada o envío esperando respuesta; rojo = falla (correo rebotado); gris = sin uso.
- **Orden con varios estudios:** cada estudio se libera por separado; el enlace de resultados se envía solo cuando todos están liberados. Mientras falte uno, el panel muestra "Bloqueado: 2 de 3" con la causa y la fecha comprometida: es la razón más probable de la llamada.
- **Siguiente mejor acción** (reglas): resultados incompletos → informar fecha del pendiente; detenido por proceso interno → escalar al área; detenido por el paciente → invitar a retomar. Canal: correo si la ventana de WhatsApp cerró; llamada si el correo rebotó o es adulto mayor; aviso en la app si su último canal fue la app.
- **Correo de seguimiento:** sin datos clínicos, con enlace personal que vence en 72 h y pide código.

**Vista del gerente:** abiertos, detenidos (paciente / interno), avance promedio de los detenidos, órdenes con resultados incompletos (contactos probables), seguimientos enviados y recuperados; dónde se detienen los procesos; canales usados antes de detenerse; cola priorizada con envío masivo a prioridad alta.

**Prioridad (propuesta, por validar):** salida no conforme 3 o solicitud 1 · +2 si es menor o adulto mayor · +2 si el avance es ≥ 50 % · +1 por día detenido (máx. 3) · +2 si tiene resultados incompletos. Alta ≥ 6, media 4–5, baja ≤ 3.

---

## 9. Carga y salud del sistema

Detalle en `docs/…` sección 1, `carga/` y `simuladores/3-carga-omnicanal.html`.

- 5 millones de visitas web, 100 mil conversaciones de WhatsApp y 30 mil sesiones de app al día se convierten en unas **733 solicitudes por segundo** en el minuto pico (supuestos explícitos; solo 30 % de las visitas web hace trámites, el catálogo va por CDN).
- Puntos de quiebre: catálogo sin caché, límite de 80 mensajes/s por número de WhatsApp (pedir el nivel de 1,000), dependencias lentas (ley de Little), tormenta de reintentos tras una caída, crecimiento del registro de eventos, capacidad de asesores.
- Alertas: ámbar al 80 % y rojo al 100 % de cada recurso.
- **Jerarquía para preservar la salud:** 1) seguridad e integridad de datos, 2) núcleo y base de eventos, 3) dependencias externas, 4) WhatsApp, 5) asesores, 6) sesiones en memoria, 7) contenido público (lo primero que se degrada).
- Requisitos: tiempo límite e interruptor en cada dependencia, cola durable para escrituras, retroceso exponencial con variación aleatoria, idempotencia, límites por usuario y canal, webhook de WhatsApp que confirma en < 200 ms y encola.
- Para el prototipo: correr `prueba-carga-k6.js` contra el servidor y anotar la capacidad real por instancia.

---

## 10. Datos de prueba

- `casos-semilla.json`: 8 casos con nombre (Ana, Leo, Don Pedro, Raúl, Sofía, número familiar, Lucía, Carmen) y 18 sintéticos. Las horas están como "horas atrás" para recalcularlas al cargar.
- Solo datos sintéticos. **Ningún registro del caso LC-01 entra al código.** Los códigos de proceso e incidencia (O1, O3, O4, INC-…) son la nomenclatura anonimizada del caso.

---

## 11. Front end: patrones reutilizables

Los HTML son JavaScript sin dependencias, un archivo por página. Sirven como **referencia de comportamiento y diseño**, no para copiarlos tal cual en un framework. Componentes que conviene portar:

| Componente | Dónde verlo | Qué resuelve |
|---|---|---|
| Barra de avance por tramos con canal y punto de detención | Panel, paso 2 | Muestra el 60 % hecho y el 40 % pendiente con su causa |
| Semáforo de canales | Panel, paso 3 | Estado de cada canal para un trámite |
| Estudios de la orden con candado | Panel, paso 4 | Resultados parciales y bloqueo del enlace |
| Cronómetros con estado | Escenarios, paso 4 | Prueba visual de que el sistema guarda y vence plazos |
| Línea de abandono | Escenarios, paso 2 | Inactividad frente a aviso, cierre y liberación |
| Conversación con rol y canal | Escenarios | Paciente, bot, operador, supervisor, médico, sistema |
| Estado guardado con versión | Escenarios | Lo que verá cualquier canal al retomar |
| Línea de tiempo de eventos | Escenarios y panel | Trazabilidad para el jurado |
| Semáforo de capacidad, avisos y bitácora de alertas | Carga | Alertas al 80 % |
| Ventana de interpretación | Carga | Jerarquía de salud del sistema |
| Encabezado con menú y pie con integrantes | Todas | Navegación y créditos |

**Estilo visual:** fondo blanco, paneles `#f3f7f5`, texto `#25282a`, verde de marca `#00ac6b` para franjas y `#00804f` para texto y botones (contraste AA), gris `#838587`, ámbar `#a65f00` y rojo `#c0262d` solo para avisos. Tipografía Nunito Sans. Botones tipo píldora. Modo oscuro con `light-dark()`. No usar el logotipo de Salud Digna sin autorización.

---

## 12. Qué construir en la v2.0 (prioridades)

| Prioridad | Elementos |
|---|---|
| Debe tener | Persona con identificadores de canal y código de un solo uso; trámite con pasos y datos parciales; registro de eventos con actor y paciente; canal propietario con versión y transferencia WhatsApp → llamada; temporizadores de sesión configurables (valores de demo); vista del operador con avance, semáforo de canales y línea de tiempo |
| Debería tener | Vínculos titular → dependiente con alcance y nivel; orden con estudios y bloqueo del enlace; siguiente mejor acción; vista del gerente; bitácora de accesos; rol operador sin contenido clínico |
| Podría tener | Correo de seguimiento con enlace; cola de salida con prioridad; interruptor de circuito simulado; vencimiento automático a los 18 años; alertas al 80 % |
| No en esta versión | Infraestructura de producción, CDN real, número de WhatsApp de alto rendimiento, IA conversacional completa |

---

## 13. Pruebas de aceptación mínimas

1. **Ana, cuidadora de Don Pedro, agenda por WhatsApp**, se distrae (aviso, pausa, horario liberado) y llama: el operador ve todo lo guardado, se pide código nuevo si venció y se reaparta el horario sin pedir datos.
2. **Raúl pide reenvío de resultados de Ana:** ruta Evitar; no se entregan; se pide autorización a Ana.
3. **Teléfono compartido:** antes de cualquier dato, el sistema pregunta para quién es el trámite.
4. **Leo con orden de 3 estudios, 2 liberados:** el enlace está bloqueado; el operador informa la fecha; al liberar el tercero se envía el enlace.
5. **Ana al 60 % detenida en "Pagar":** correo de seguimiento y retoma por web sin repetir datos; el panel la cuenta como recuperada.
6. **Dra. Méndez:** emite la orden, no agenda; solo ve resultados de sus órdenes con consentimiento.
7. Las 640 combinaciones de `escenarios-prueba.jsonl` producen la ruta y la secuencia de eventos esperadas.

---

## 14. Mensaje sugerido para arrancar con Claude

> Lee `docs/v2-handoff/CLAUDE.md` y `docs/v2-handoff/README.md`. Revisa el código actual del prototipo y compáralo con el traspaso. Propón un plan para la versión 2.0 que respete los principios de la sección 2, con los elementos "debe tener" de la sección 12 y las pruebas de la sección 13. Antes de escribir código, dime qué partes del prototipo actual se conservan, cuáles cambian y en qué orden lo harías. Usa `especificaciones/` como fuente de verdad para perfiles, rutas, plazos y eventos, y los HTML de `simuladores/` como referencia visual y de comportamiento.

---

## 15. Supuestos y límites

- Las cifras de carga, los tiempos de atención, los plazos de producción y los pesos de prioridad son propuestas del equipo para validar con Salud Digna.
- Las políticas para adolescentes, cuidadores y médicos referidores las define Salud Digna; el sistema solo deja los parámetros preparados.
- Créditos: Hernández Heredia Kevin, Pérez Martínez Alan Yahir, Vázquez Bello Dafne Corina y Santiago Sánchez Ariadne Elizabeth. Asesor: Dr. Guillermo A. Arrioja Carrera.
