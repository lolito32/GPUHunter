# GPUHunter — Contexto Único para Agentes

Monitor de precios de GPUs (tiendas argentinas): backend Node.js + PWA vanilla + app Android (Capacitor). Comunicación y UI en **español**, sin emojis.

## 1. Stack Técnico y Reglas de Entorno
- Node.js >=20, **ESM** (`"type": "module"`), Express 4, cheerio, firebase-admin, dotenv. Backend en `server/`, PWA en `public/`, nativo en `android/`.
- Hosting en **Render** (disco efímero en free tier): la db puede vaciarse; la PWA la restaura desde `localStorage`.
- Dependencias puras JS: **prohibido** agregar librerías con binarios nativos o C++ (Render no garantiza toolchain de build).
- Desarrollo local en Windows + PowerShell 5.1: encadenar con `; if ($?)`, nunca `&&`. No ejecutar scripts node inline con `$(...)`; usar `.mjs` temporales en el directorio temp del sistema.
- Servidor en `http://localhost:3000` en background: reiniciar (matar por puerto 3000) tras tocar `server/**`.
- Al terminar tarea: commitear y pushear a `dev` (mensaje en español).

## 2. Mapeo de Archivos Clave
- `server/index.js` — bootstrap de Express, sirve `public/` y catch-all SPA.
- `server/api.js` — rutas `/api/*`; claves cortas de products (`st, nm, gp, pr, ur, im, dl, sc, tg`); CORS `Access-Control-Allow-Origin: *` **obligatorio** para la WebView nativa (`https://localhost`).
- `server/store.js` — `data/db.json` con escritura atómica (tmp+rename) y guardado diferido (`scheduleSave` ~800 ms): no leer la db justo después de un PUT.
- `server/services/scraper.js` + `server/scrapers/` — orquesta los 7 scrapers (fullhard, compragamer, gezatek, hardgamers, malditohard, mexx, venex). Selectores exactos viven en cada módulo; no rediseñar a ciegas. MalditoHard caído = 0 items, no rompe el ciclo.
- `server/lib/http.js` — `curlGet` para FullH4rd (Cloudflare): omitir header `accept`, cae a `curl` del PATH (requisito también en Render).
- `server/services/monitor.js` — ciclo de sync y disparo de alertas; `server/services/fcm.js` — push vía firebase-admin (canal `gpuhunter-alerts`, poda de tokens inválidos).
- `public/app.js` — lógica PWA: hash routing, detección Capacitor, URL del servidor en `localStorage` (`gh_api`), restauración de targets si la API responde `fresh: 1`.
- `public/index.html` + `public/sw.js` — al tocar `public/*`: bump `?v=N` en index.html y de `SHELL`/`CACHE` en sw.js; luego `npx cap sync android`.
- `data/db.json` — gitignored; `README.md` — documentación de usuario.

## 3. Reglas de Operación Estrictas para Agentes
1. Imports relativos **siempre con extensión `.js`** (ESM).
2. **Prohibido** `continue` dentro de callbacks o `forEach` (usar `for...of` o `return`).
3. **Prohibido** ejecutar scripts de verificación en bucle continuo por consola.
4. Validar sintaxis con `node --check <archivo>` **una sola vez** por archivo y finalizar la tarea.
