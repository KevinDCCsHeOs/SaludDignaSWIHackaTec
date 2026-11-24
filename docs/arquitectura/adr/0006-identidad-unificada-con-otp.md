# ADR 0006: Identidad unificada por identificadores normalizados + OTP

- **Estado:** Aceptada
- **Fecha:** 2026-11-24
- **Issue:** #1

## Contexto

El pilar 1 exige reconocer al mismo paciente en cualquier canal. Reconocer un teléfono no prueba que quien escribe sea el titular.

## Decisión

- Modelo `Paciente` 1—N `IdentidadCanal` (`web`, `app`, `whatsapp`, `call_center`, `email`).
- Identificadores normalizados: teléfono E.164, email en minúsculas, CURP en mayúsculas.
- Resolución: `conocido` · `requiere_verificacion` · `nuevo` · `ambiguo`.
- Una identidad nueva solo se vincula **después** de verificar con OTP (o preguntas de seguridad en Call Center).
- Casos ambiguos no se vinculan automáticamente: se envían al asesor.

## Consecuencias

- ✅ Continuidad real entre canales sin pedir datos de nuevo.
- ✅ Protección contra suplantación.
- ⚠️ Un paso extra (OTP) al cambiar de canal; se mitiga con sesión verificada de 30 min por canal.

## Alternativas descartadas

Coincidencia difusa por nombre (riesgo de unir pacientes distintos); login obligatorio en todos los canales (rompe la experiencia en WhatsApp y teléfono).
