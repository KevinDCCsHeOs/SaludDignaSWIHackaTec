# ADR 0009: Asistente con LLM vía API, guardrails y minimización de datos

- **Estado:** Aceptada
- **Fecha:** 2026-11-24
- **Issue:** #1

## Contexto

El Contact Center incluye un primer nivel con IA. Debe entender lenguaje natural, pero en salud una respuesta incorrecta puede causar daño, y los datos son sensibles.

## Decisión

- Módulo `ia` en el API con proveedor de LLM configurable por variables de entorno.
- Salida **estructurada** (`intencion`, `confianza`, `entidades`, `respuesta`) validada con zod.
- El prompt recibe solo un **resumen mínimo** del contexto, sin identificadores directos.
- Guardrails: nunca diagnosticar, recetar ni interpretar resultados; síntomas de alarma → mensaje con 911 y ticket crítico.
- Si la confianza es baja o el proveedor falla, el bot cae a un menú con botones.

## Consecuencias

- ✅ Conversación natural y mejor clasificación de casos.
- ✅ El flujo crítico del demo no depende de la IA.
- ⚠️ Costo por uso y latencia variable; se registran las respuestas para auditoría.
- ⚠️ Envío de datos a un tercero: se documenta en el aviso de privacidad y se minimiza.

## Alternativas descartadas

Modelo propio entrenado (sin tiempo ni datos); solo menús fijos (peor experiencia y menos innovación).
