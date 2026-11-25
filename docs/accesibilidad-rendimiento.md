# Accesibilidad (WCAG 2.1 AA) y Rendimiento Web — Salud Digna Omnicanal

Documentación de estándares de optimización web y accesibilidad implementados en `apps/web` (Issue #38).

---

## 1. Controles WCAG 2.1 AA implementados

| Criterio WCAG | Implementación en `apps/web` | Archivo |
| --- | --- | --- |
| **1.4.3 Contraste mínimo (≥ 4.5:1)** | Texto principal `#0f172a` sobre `#ffffff` (**17.9:1**), texto secundario `#334155` (**10.9:1**), botón primario `#ffffff` sobre `#0b6e4f` (**6.1:1**). | [`globals.css`](../apps/web/src/app/globals.css) |
| **1.4.4 Tamaño de texto accesible** | Fuente base `16px` (`html { font-size: 16px; }`) y unidades relativas `rem`. | [`globals.css`](../apps/web/src/app/globals.css) |
| **2.5.5 / 2.5.8 Tamaño de objetivo táctil** | Botones, enlaces de navegación e inputs con `min-height: 44px` para adultos mayores y pantallas táctiles. | [`globals.css`](../apps/web/src/app/globals.css) |
| **2.4.1 Saltar bloques** | Enlace visible al foco `Saltar al contenido principal` (`#contenido-principal`). | [`Navbar.tsx`](../apps/web/src/components/Navbar.tsx), [`layout.tsx`](../apps/web/src/app/layout.tsx) |
| **2.4.7 Foco visible** | Contorno global `:focus-visible { outline: 3px solid #1d4ed8; outline-offset: 2px; }`. | [`globals.css`](../apps/web/src/app/globals.css) |
| **2.3.3 Movimiento reducido** | `@media (prefers-reduced-motion: reduce)` detiene animaciones del mapa de canales. | [`globals.css`](../apps/web/src/app/globals.css) |
| **4.1.2 / 4.1.3 ARIA y regiones vivas** | `lang="es"`, `<nav aria-label>`, `<label htmlFor>`, `role="alert"`, `role="status"` y `aria-live="polite"`. | Componentes en `apps/web/src/` |

---

## 2. Optimización de rendimiento web

- **División de código y carga diferida (`next/dynamic`):**
  - `MapaClinicas` (Leaflet) se carga dinámicamente solo en `/cotizar/clinica` (`ssr: false`), evitando penalizar `/` o `/login`.
  - `ChatWidgetLazy` difiere el asistente flotante tras la hidratación inicial.
- **Next.js standalone + pre-renderizado estático:** 14 de 17 rutas pre-renderizadas estáticamente; `First Load JS` compartido de **103 kB**.
- **Caché de datos en cliente y servidor:** TanStack Query (`staleTime: 10s`) en frontend + caché Redis en `GET /catalogos/*`.

---

## 3. Lighthouse CI automatizado

Configurado en [`lighthouserc.json`](../lighthouserc.json) y [`.github/workflows/lighthouse.yml`](../.github/workflows/lighthouse.yml) para las rutas `/`, `/cotizar` y `/consola`, exigiendo puntaje **≥ 90** en:

- Performance (`>= 0.90`)
- Accessibility (`>= 0.90`)
- Best Practices (`>= 0.90`)

Ejecución local:

```bash
npm run build --workspace=@salud-digna/web
npm run start --workspace=@salud-digna/web
# En otra terminal:
npx @lhci/cli autorun --config=./lighthouserc.json
```

---

## 4. Protocolo de prueba manual con lector de pantalla (NVDA / VoiceOver)

1. Abrir `/` y presionar `Tab`: verificar anuncio inmediato de *"Saltar al contenido principal"* y salto directo al `<main>`.
2. Navegar el flujo `/login` → `/cotizar` → `/cotizar/clinica` usando únicamente `Tab`, `Shift+Tab`, `Enter` y `Espacio`.
3. Verificar que los avisos de autoguardado (`role="status"`, `aria-live="polite"`) y errores (`role="alert"`) se anuncian sin perder foco.
4. En `/consola`, comprobar los atajos `Alt+B` (búsqueda), `Alt+L` (modal llamada) y `Alt+E` (escalar).
