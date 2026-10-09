# SYSTEM CONTEXT: GPUHunter
**CRITICAL INSTRUCTION FOR ALL AI AGENTS:** Read this document entirely before executing any task. This is a strict machine-to-machine operations protocol.

## 1. CORE ARCHITECTURE & ENVIRONMENT
- **Stack:** Node.js >=20, ESM (`"type": "module"`), Express 4, Cheerio, Firebase-admin, vanilla JS (Frontend), Capacitor (Android).
- **Hosting:** Render (Free Tier). Ephemeral disk: `data/db.json` is volatile and can be wiped. PWA restores it via `localStorage`.
- **Dependencies:** Strictly pure JS. PROHIBITED to add native binaries or C/C++ packages (Render build toolchain is unsupported).
- **Local Env:** Windows OS + PowerShell 5.1.
- **Server:** `http://localhost:3000`. Restart by killing port 3000 process ONLY when `server/**` files are modified.

## 2. STRICT OPERATIONAL DIRECTIVES (CRITICAL)
- **FILE MANIPULATION (HARD RULE):** You are STRICTLY PROHIBITED from using terminal commands (e.g., `Set-Content`, `Out-File`, `echo`, `$out+=`) to write, create, or modify code. You MUST use your native internal file-editing tools (e.g., `write_file`, `edit_file`).
- **RESTRICTED TERMINAL USAGE:** The terminal is strictly restricted to:
  1. Git commands (`git status`, `git add`, `git commit`, `git push`).
  2. Syntax validation (`node --check <file>`). Execute ONCE per file. DO NOT run infinite validation loops.
  3. Capacitor synchronization (`npx cap sync android`).
  4. Node.js server restart.
- **GIT WORKFLOW:** Commit and push EXCLUSIVELY to the `dev` branch. NEVER push to `main`. Commit messages must be clear and written in Spanish.
- **CODING STANDARDS:**
  - ESM imports MUST include the `.js` extension explicitly (e.g., `import { api } from './js/services/api.js'`).
  - PROHIBITED to use `continue` inside callbacks or `forEach`. Use `for...of` or `return` instead.
  - DO NOT modify business logic or existing function signatures during refactoring tasks.

## 3. FILE SYSTEM MAPPING
### Backend (`server/`)
- `server/index.js`: Express bootstrap, SPA catch-all logic.
- `server/api.js`: Routes `/api/*`. Payload keys: `st, nm, gp, pr, ur, im, dl, sc, tg, us` (`us: 1` = usada). CORS `Access-Control-Allow-Origin: *` is MANDATORY for Capacitor native WebView (`https://localhost`).
- `server/store.js`: Atomic `data/db.json` writing (tmp+rename), deferred `scheduleSave` (~800ms). DO NOT read immediately after a PUT.
- `server/services/scraper.js` & `server/scrapers/`: Scraper orchestration. Selectors are exact; DO NOT redesign blindly. Note: "MalditoHard" down = 0 items (this is expected, do not break the loop).
- `server/lib/http.js`: `curlGet` for FullH4rd (Cloudflare bypass). Drops `accept` header, falls back to system `curl` in PATH.
- `server/services/monitor.js` & `server/services/fcm.js`: Sync loop, alerts, Firebase push (channel `gpuhunter-alerts`, automatic invalid token pruning).

### Frontend (`public/` - Modular ESM Architecture)
- `public/app.js`: Lightweight entry point. Bootstraps the app and imports modules.
- `public/js/utils/`: Independent helpers (`dom.js`, `format.js`, `store.js`).
- `public/js/services/`: API and Network clients (`api.js`, `push.js`, `update.js`).
- `public/js/state/`: Global state manager (`state.js`).
- `public/js/components/`: Reusable UI elements and alerts (`banners.js`).
- `public/js/views/`: UI render logic and DOM construction (`render.js`).
- `public/js/events/`: Routers and event listeners (`events.js`).

### Cache & Versioning Rules
- **Cache/Version Control:** Whenever ANY file in `public/*` is modified, you MUST bump the version parameter `?v=N` in `public/index.html` AND update the `SHELL`/`CACHE` strings in `public/sw.js`.
- Execute `npx cap sync android` only when web asset changes impact the native Capacitor wrapper.

## 4. REGLAS DE OPERACIÓN ESTRICTAS PARA AGENTES
- **AUTO-EXPLORACIÓN (PROHIBIDO PEDIR DATOS AL USUARIO):** Está TERMINANTEMENTE PROHIBIDO solicitar al usuario el HTML, los selectores CSS, la estructura del DOM, las URLs de catálogo o capturas de pantalla de un sitio. El agente DEBE resolverlo de forma autónoma con este procedimiento:
  1. Localizar la URL del listado de placas de video mediante `websearch`/`webfetch`.
  2. Crear un script temporal `temp-<store>.mjs` (usando las herramientas internas de archivo) que descargue el HTML con `getText` y lo inspeccione con Cheerio para volcar la estructura de las tarjetas de producto.
  3. Deducir los selectores exactos: contenedor de tarjeta, título/enlace, precio, imagen e identificador.
  4. Implementar el scraper definitivo en `server/scrapers/<store>.js` y registrarlo en `server/scrapers/index.js` y `server/config.js`.
  5. Validar con `node --check` y ELIMINAR el script temporal.
- 6. MANDATORY AUTO-EXPLORATION: When adding new stores, you MUST NOT ask the user for HTML snippets or selectors. You MUST write temporary Node.js scripts (e.g., `temp-fetch.mjs`) to fetch the target website, parse the DOM with Cheerio in your own console, deduce the CSS selectors, implement the actual scraper in `server/scrapers/`, and then delete the temporary script.
- **NUNCA** delegar en el usuario el descubrimiento de selectores ni la resolución de bloqueos anti-bot. El agente es 100% responsable de la exploración del sitio.