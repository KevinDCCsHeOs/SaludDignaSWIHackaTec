# ADR 0005: WhatsApp Cloud API en un servicio separado

- **Estado:** Aceptada
- **Fecha:** 2026-11-24
- **Issue:** #1

## Contexto

WhatsApp es el canal central del demo. Meta exige un webhook HTTPS que responda rápido y reintenta si no, y la app de WhatsApp Business del celular no ofrece API.

## Decisión

- Usar **WhatsApp Business Platform (Cloud API)** de Meta con número de prueba o el número Business migrado.
- Servicio propio `apps/whatsapp-bot` que: verifica la firma `X-Hub-Signature-256`, responde `200` de inmediato, encola el mensaje, deduplica por `message.id` y mantiene la sesión de diálogo en Redis.
- El bot **no** accede a MySQL: llama al API con un token de servicio.

## Consecuencias

- ✅ Un pico de mensajes o un reinicio del API no hace que Meta pierda mensajes.
- ✅ El diálogo evoluciona sin tocar el núcleo.
- ⚠️ El número usado en la API no puede estar al mismo tiempo en la app del celular.
- ⚠️ Fuera de la ventana de 24 h solo se pueden enviar plantillas aprobadas.

## Alternativas descartadas

Integrar el webhook dentro del API (acopla disponibilidad); proveedores intermedios como Twilio (costo y otra cuenta que gestionar).
