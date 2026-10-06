# AGENTS.md

Guía operativa del repo **GPUHunter**: monitor de precios de placas de video (ARG). Backend Node.js (Express + cheerio, ESM) + PWA vanilla en `public/` + app Android nativa via Capacitor en `android/`. Comunicación y UI en **español**, sin emojis en UI ni mensajes.

## Comandos
- `npm start` → `node server/index.js` (puerto 3000). `npm run sync` → CLI de scraping único. `npm run icons` → regenera íconos.
- Verificación tras tocar JS: `node --check <archivo>` (varios en una cadena con `if ($?)`).
- Smokes: levantar un server en puerto efímero con `DATA_DIR` temporal (`PORT=3220 node server/index.js`).
- **Siempre commitear y pushear** al terminar (`git commit` en español + `git push origin main`). Era pedido explícito del dueño.

## Entorno (Windows + PowerShell 5.1)
- No existe `&&`: encadenar con `;` y `if ($?)`.
- NO ejecutar scripts inline de Node con `$(...)` ni `\"` (PowerShell los rompe): escribir `.mjs` temporales en `C:\Users\kasper\AppData\Local\Temp\opencode\`.
- El server de desarrollo corre en `http://localhost:3000` (proceso en background); al cambiar `server/**` hay que reiniciarlo (matar por puerto `Get-NetTCPConnection -LocalPort 3000`).

## Arquitectura y datos
- `data/db.json` (gitignored) guarda products/targets/settings/alerts/devices/status. Escritura atómica tmp+rename; guardado diferido (`scheduleSave` ~800ms) → no leer el archivo inmediatamente tras un PUT.
- **Render free borra el disco**: server expone `fresh: 1` si la db no existe/está vacía; la PWA restaura sus targets desde `localStorage` con `PUT /api/targets`. Si `ADMIN_TOKEN` está seteado, la app manda `X-Admin-Token` (guardado en Ajustes).
- API `/api/products` usa claves cortas: `st, nm, gp, pr, ur, im, dl, sc, tg`. No cambiar sin tocar `public/app.js`.

## Scrapers (7)
- Los selectores exactos por tienda viven en cada módulo de `server/scrapers/`; NO rediseñar a ciegas.
- **FullH4rd (Cloudflare)**: cualquier header `accept` → 403. `server/lib/http.js` (`curlGet`) omite ese header y cae a `curl` del PATH (requisito; en Render ya está).
- **CompraGamer**: catálogo JSON estático (`getJSON`). Imágenes: `https://imagenes.compragamer.com/productos/compragamer_Imganen_general_<imagenes[0].nombre>-mini.jpg` (el typo "Imganen" está en su config, es real).
- **MalditoHard**: dominio caído → 0 items esperado, no rompe el ciclo.

## Frontend (PWA)
- Al tocar `public/*`: bump `?v=N` en `index.html` (css y js), `SHELL` y `CACHE` en `sw.js`. Hoy en v7.
- Estética dark mínima Vercel/Linear; sin gradientes/neón/iridiscencias/emojis.
- `app.js` detecta Capacitor (`window.Capacitor.isNativePlatform()`); en la app Android la URL del servidor va en `localStorage` (`gh_api`, configurable en Ajustes) porque `capacitor://` no es origen válido.

## App Android / Capacitor
- `capacitor.config.json` en la raíz: `appId: ar.com.gpuhunter`, `webDir: public`, scheme `https`. `android/` está versionado (generado con `npx cap add android`).
- Tras cambios en `public/`: `npx cap sync android` (ya fue corrido).
- **Push (FCM)**: backend con `server/services/fcm.js` (firebase-admin). Credenciales: env `FIREBASE_SERVICE_ACCOUNT` (JSON plano o base64) o archivo `DATA_DIR/firebase-service-account.json`. Sin credenciales el server NO llega a arrancar? No: corre, y `sendPushToDevices` loguea "no configurado".
- Telegram fue **eliminado** (monitor.js ahora dispara FCM a `devices` vía `sendPushToDevices`).
- Para compilar el APK con push hace falta `android/app/google-services.json` (NO está en el repo; las notificaciones no funcionan sin él). El flujo push del usuario: Ajustes → URL del servidor → Activar alertas (pide permiso, obtiene token, `POST /api/register-device`).