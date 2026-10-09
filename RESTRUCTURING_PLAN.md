# Plan de reestructuración modular por partes (Frontend PWA)

Estado actual: `public/app.js` ~754 líneas (monolítico, estable). Objetivo: dividir en módulos ESM sin romper funcionalidad.

## Principios
- Trabajar exclusivamente en rama `dev`.
- Un módulo por commit, validar `node --check <archivo>` después de cada cambio.
- Imports relativos con extensión `.js` explícita (ESM).
- No modificar lógica de negocio, solo mover código.
- Probar cada fase (estructura + sintaxis).

## Fase 1: Utils base (sin afectar app)
Crear:
- `public/js/utils/dom.js`: `$`, helpers DOM (si necesario)
- `public/js/utils/format.js`: `fmt`, `money`, `esc`
- `public/js/utils/store.js`: wrapper `store`/`ls` (gh_*, localStorage)

## Fase 2: Services (api + push/update helpers)
- `public/js/services/api.js`: `apiBase`, `adminToken`, `api()` (fetch a /api/*)
- `public/js/services/push.js`: `getPush`, `showPushBanner`, `registerDeviceToken`, `setupPushListeners`, `enrollPush`
- `public/js/services/update.js`: `checkAppUpdate`, `showUpdateBanner`, `compareVersions`, `isNative`

## Fase 3: State
- `public/js/state/state.js`: objeto `state` global + getters/setters mínimos

## Fase 4: Components/UI
- `public/js/components/banners.js`: banners (push/update/toast)
- `public/js/views/render.js`: renderizado principal (cards, filtros, listas, debug, onboarding, status)

## Fase 5: Events/Router
- `public/js/events/events.js`: listeners, routing (hashchange), handlers UI
- `public/js/app-core.js`: inicialización/boot, wiring

## Fase 6: Entry
- `public/app.js` pasa a entry liviano (~50-150 líneas) que importa y arranca. Mantener `type=module`.

## Validación obligatoria
- `node --check public/app.js`
- `node --check public/js/**/*.js` (uno por archivo al crear/modificar)
- Bump `?v=N` en `index.html` y `SHELL`/`CACHE` en `sw.js` en cada fase que toque archivos de public
- Commit + push a `dev` por fase completada

## Notas
- Mantener funciones con mismo nombre/signatura. 
- Evitar mover código con dependencias circulares; extraer en orden (utils -> services -> state -> ui -> events -> app)
- No usar `continue` en callbacks, seguir reglas AGENTS.md

Iniciar Fase 1.
