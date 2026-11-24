# ADR 0007: App móvil con Expo / React Native

- **Estado:** Aceptada
- **Fecha:** 2026-11-24
- **Issue:** #1

## Contexto

Se necesita una app para Android e iOS, desarrollada rápido por el mismo equipo que hace la web, que muestre el estado del trámite y reciba notificaciones.

## Decisión

- **Expo** (React Native + TypeScript + Expo Router).
- Comparte tipos y cliente del API con la web vía `packages/shared`.
- Notificaciones con `expo-notifications`; tokens en `expo-secure-store`.
- Distribución para el demo: APK con EAS Build y Expo Go en iPhone.

## Consecuencias

- ✅ Un solo código para ambas plataformas y mismo lenguaje que el resto.
- ✅ Notificaciones push sin configurar Firebase/APNs a mano.
- ⚠️ En iPhone, sin cuenta de Apple Developer, el demo depende de Expo Go.

## Alternativas descartadas

Flutter (otro lenguaje y sin tipos compartidos); PWA (push limitado en iOS y menos impacto como "app").
