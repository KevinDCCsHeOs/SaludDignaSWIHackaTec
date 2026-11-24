# Conectar WhatsApp (Meta Cloud API) al bot (#20)

Número del proyecto: **55 6440 3349** → formato internacional **+52 55 6440 3349** (E.164: `+525564403349`).

## 1. Decide cómo usar el número

Meta tiene dos caminos, y conviene decidirlo antes de tocar nada:

| Opción | Qué implica | Recomendación |
| --- | --- | --- |
| **A. Número de prueba de Meta** | Meta te da un número gratis al crear la app. Solo puede escribir a hasta 5 números que registres (los celulares del equipo y del jurado). No toca tu número real. | **Para empezar y ensayar ya.** Cero riesgo. |
| **B. Mover 55 6440 3349 a la API** | El número debe **dejar de estar** en la app WhatsApp Business (borrar la cuenta en el celular; se pierden los chats en la app) y registrarse en Cloud API con un código por SMS o llamada. | Para el demo final, si quieren que el jurado escriba a un número "real". |
| C. Coexistencia (app + API con el mismo número) | Meta la permite, pero solo mediante *Embedded Signup* de un proveedor (Tech Provider/BSP). | No vale la pena para el hackathon. |

> Si eligen B, **no** borren la cuenta de WhatsApp Business hasta tener la app de Meta lista y el webhook verificado (pasos 2–4 con el número de prueba).

## 2. Crear la app en Meta for Developers

1. Entra a <https://developers.facebook.com> con la cuenta de Facebook que administra el negocio → **Mis apps → Crear app**.
2. Caso de uso: **Conectar con clientes por WhatsApp** (tipo *Negocio*). Asóciala a tu portafolio de negocio (Business Manager).
3. En **WhatsApp → Configuración de la API** verás:
   - **Identificador del número de teléfono** → `WA_PHONE_NUMBER_ID`
   - **Token de acceso temporal** (dura 24 h; sirve para probar) → `WA_ACCESS_TOKEN`
   - **Para:** agrega aquí los celulares que recibirán mensajes del número de prueba.
4. En **Configuración de la app → Básica** copia la **Clave secreta de la app** → `WA_APP_SECRET`.

## 3. Token permanente (para que el bot no deje de funcionar a las 24 h)

1. Business Manager → **Configuración del negocio → Usuarios del sistema → Agregar** (rol *Administrador*).
2. **Asignar activos**: la app y la cuenta de WhatsApp Business, con control total.
3. **Generar token** con los permisos `whatsapp_business_messaging` y `whatsapp_business_management`, sin caducidad → ese es el `WA_ACCESS_TOKEN` definitivo.

## 4. Configurar el webhook

Requiere que `https://wa.<dominio>` ya responda (ver [`infra/README.md`](../infra/README.md)).

1. En la VPS: `nano /opt/salud-digna/infra/.env.prod` y llena `WA_APP_SECRET`, `WA_ACCESS_TOKEN` y `WA_PHONE_NUMBER_ID`. Después:

   ```bash
   cd /opt/salud-digna
   docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod up -d whatsapp-bot
   ```

2. Meta → **WhatsApp → Configuración → Webhook → Editar**:
   - **URL de devolución de llamada:** `https://wa.<dominio>/webhook`
   - **Token de verificación:** el `WA_VERIFY_TOKEN` que imprimió `generar-env.sh`
3. **Verificar y guardar.** Meta llama `GET /webhook`; si el token coincide, queda verificado.
4. En **Campos del webhook**, suscribe **`messages`**.
5. Prueba: desde un celular registrado en "Para", escribe "Hola" al número. En la VPS:

   ```bash
   docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod logs -f whatsapp-bot
   ```

## 5. Registrar el número 55 6440 3349 (solo opción B)

1. En el celular: WhatsApp Business → **Configuración → Cuenta → Eliminar mi cuenta**.
2. Meta → **WhatsApp → Configuración de la API → Agregar número de teléfono**: nombre visible ("Salud Digna Demo"), categoría *Salud*, número `+52 55 6440 3349`, verificación por SMS o llamada.
3. Reemplaza `WA_PHONE_NUMBER_ID` por el identificador del número nuevo y vuelve a levantar el bot.
4. El nombre visible pasa por revisión de Meta; mientras tanto el número funciona y muestra el número en lugar del nombre.

## 6. Plantillas (mensajes fuera de la ventana de 24 h)

El bot usa estas plantillas, que deben crearse y aprobarse en **WhatsApp Manager → Plantillas de mensajes**:

| Nombre | Categoría | Uso |
| --- | --- | --- |
| `sd_codigo_verificacion` | Autenticación | Código OTP |
| `sd_recordatorio_cita` | Utilidad | Recordatorio de cita |
| `sd_tramite_pendiente` | Utilidad | "Tienes un trámite pendiente" |

Dentro de las 24 h posteriores al último mensaje del paciente, el bot puede responder con texto libre y botones sin plantilla, que es lo que ocurre en el recorrido del demo.

## Notas

- En los webhooks de México, Meta puede enviar el número como `5215564403349` (con `1`). La resolución de identidad (#7) normaliza ambos formatos a `+525564403349`.
- Nunca subas los valores reales a GitHub: viven solo en `infra/.env.prod` de la VPS.
