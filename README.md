# GPUHunter

Monitor de precios de **placas de video (GPU)** en tiendas argentinas. App Android nativa (Capacitor) + PWA ultra-ligera (menos de 40 KB) + backend Node.js con scraping cada 10-15 minutos, notificaciones push (Firebase FCM) y objetivos de precio configurables.

Diseñada para usarse desde el celular: cero frameworks, JSON paginado, cache offline vía service worker. Liviana para equipos bajos en RAM (probada con Samsung A04).

## Tiendas cubiertas

| Tienda | Método |
|---|---|
| CompraGamer | Catálogo JSON estático (`static.compragamer.com/productos`, subcategorías 6/62/116) |
| Mexx | HTML paginado (`/productos-rubro/placas-de-video/`) |
| Venex | HTML paginado (título real desde el `onclick` de la card) |
| Gezatek | JSON-LD `ItemList`/`Product` |
| FullH4rd | HTML paginado (fallback a `curl` por Cloudflare) |
| MalditoHard | Candidatos + fallback genérico JSON-LD/microdata |
| HardGamers | Buscador paginado (fallback: solo tiendas no cubiertas en el ciclo) |

## Requisitos

- Node.js >= 20
- `curl` en el `PATH` (usado como fallback anti-Cloudflare; en Render/Railway ya viene instalado)

## Instalación local

```bash
npm install
npm run sync      # primera corrida: llena data/db.json
npm start         # http://localhost:3000
```

Otros scripts:

- `npm run dev` — arranque con auto-reload
- `npm run sync` — sincronización única desde CLI (con resumen por tienda)
- `npm run icons` — regenera los íconos PNG del service worker

## Variables de entorno

Copia `.env.example` a `.env` (o setéalas en el proveedor de hosting). El parser de `.env` es propio, no requiere `dotenv`.

| Variable | Default | Descripción |
|---|---|---|
| `PORT` | `3000` | Puerto HTTP |
| `HOST` | `0.0.0.0` | Bind del servidor |
| `SYNC_INTERVAL_MIN` | `12` | Minutos entre ciclos de scraping (10-15 recomendado) |
| `MAX_PAGES` | `4` | Páginas a recorrer por tienda en cada ciclo |
| `SCRAP_TIMEOUT_MS` | `30000` | Timeout por request |
| `DATA_DIR` | `./data` | Carpeta de datos (`db.json`) |
| `ADMIN_TOKEN` | vacío | Si está seteado, las escrituras exigen la cabecera `X-Admin-Token` |
| `FIREBASE_SERVICE_ACCOUNT` | vacío | JSON de cuenta de servicio de Firebase (activar FCM) |

## Notificaciones push (FCM)

1. En Firebase Console creá un proyecto y agregá una app **Android** (package `ar.com.gpuhunter`, donde está `capacitor.config.json`). Necesitás el archivo `google-services.json` en `android/app/` para compilar la app con push.
2. En el backend seteá `FIREBASE_SERVICE_ACCOUNT` con el JSON de la cuenta de servicio (o guardalo en `DATA_DIR/firebase-service-account.json`).
3. En la app: **Ajustes → URL del servidor** (ej. `https://gpuhunter.onrender.com`) → *Guardar ajustes* → *Activar alertas en este dispositivo*.
4. Al tocar la notificación se abre la oferta directamente. En primer plano se muestra un banner táctil.

Flujo de alerta: si el precio de un producto **baja** por debajo de tu objetivo (o aparece una oferta nueva ya bajo el objetivo) se envía un push a todos los dispositivos registrados. Hay cooldown por producto (`alertCooldownMin`, default 12 h) y máximo 6 alertas por corrida.

## API

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/health` | Salud del proceso |
| GET | `/api/status` | Última sincronización, si está corriendo |
| GET | `/api/meta` | Totales, GPUs, tiendas y objetivos |
| GET | `/api/products` | Listado paginado: `gpu`, `store`, `q`, `deal=1`, `sort=price-asc\|price-desc\|name`, `page`, `limit` (max 500) |
| GET/PUT | `/api/targets` | Objetivos de precio por modelo |
| GET/PUT | `/api/settings` | Tiendas habilitadas, intervalo, estado FCM y dispositivos |
| POST | `/api/register-device` | Registra/da de baja el token FCM de un dispositivo |
| POST | `/api/sync` | Dispara una sincronización manual |

`PUT /targets`, `PUT /settings` y `POST /sync` requieren `X-Admin-Token` solo si `ADMIN_TOKEN` está definido.

## Estructura

```
server/
  index.js          servidor + scheduler con jitter
  api.js            rutas Express
  cli-sync.js       sincronización única con reporte
  config.js         env, tiendas, targets por defecto
  gpu.js            detección de modelo (NVIDIA/AMD/Intel)
  store.js          persistencia JSON indexada (escritura atómica)
  lib/http.js       fetch con retry + fallback a curl
  lib/price.js      parser de precios AR ($1.234.567,89)
  scrapers/         un módulo por tienda + runner
  services/         sync, monitor (targets/alertas), fcm (firebase-admin)
public/             PWA (HTML/CSS/JS + sw + manifest, sin dependencias)
android/            proyecto nativo Android (Capacitor, generado)
capacitor.config.json  config de Capacitor (webDir: public, appId: ar.com.gpuhunter)
scripts/make-icons.js  íconos PNG generados por código
data/db.json        datos en runtime (gitignored)
```

Los datos viven en `data/db.json` (tmp + rename atómico): productos con historial de precios, targets, ajustes y estado de alertas. Sin compilar módulos nativos, así que funciona en el free tier.

## App Android (Capacitor)

- `npx cap add android` baja el wrapper nativo en `android/` (ya incluido en este repo).
- Para regenerar el bundle web en la app: `npx cap sync android`.
- Compilar el APK con Android Studio (o `./gradlew assembleDebug` en `android/`).
- La app nativa usa `https` como scheme; el server se configura desde **Ajustes** (la URL queda en `localStorage`, no se compila).

## Despliegue en Render (gratis)

1. Subí el repo a GitHub y creá un **Web Service**.
2. Build command: `npm install` · Start command: `npm start`.
3. Seteá `ADMIN_TOKEN` (y `FIREBASE_SERVICE_ACCOUNT` si querés notificaciones push) en *Environment*.
4. Abrí la URL pública, *Add to Home Screen* para instalarla como app.

**Respaldo automático de objetivos**: el plan gratis de Render borra `db.json` cada vez que el servicio se duerme o redespliega. Para que no se pierdan tus targets, la PWA los guarda en el `localStorage` del celular y, al abrir la app, detecta el arranque limpio del server (campo `fresh` en `GET /api/meta`) y los restaura sola con un `PUT /api/targets`. Flujo: dormirse → despertar → abrir la app → objetivos restaurados, sin pasos manuales.

- Si seteaste `ADMIN_TOKEN`, cargá el mismo token una vez en **Ajustes** de la PWA (queda guardado en el celular) para que el restore pueda autenticarse.
- Los productos se repueblan solos en el primer ciclo de scraping (~15 s).
- Alternativa sin disco efímero: plan **Hobby ($7/mes)** con disco persistente montado en `./data`, o Railway con volumen.

## Despliegue en Railway

1. *New Project → Deploy from GitHub* (Railway detecta Node y usa `npm start`).
2. Agregá un volumen en `/data` y seteá `DATA_DIR=/data`.
3. Configurá las variables de entorno igual que en Render.

## Notas

- **FullH4rd / Cloudflare**: cualquier cabecera `Accept` dispara el challenge; el fallback `curl` la omite y responde 200.
- **MalditoHard**: si el dominio está caído, la tienda queda en 0 ofertas sin romper el ciclo.
- Cada corrida tarda ~15 s con 6 tiendas directas + HardGamers (pool de 3 requests en paralelo).
- La PWA cachea el shell; los datos se piden siempre a la red con fallback offline.
#