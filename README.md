# GPUHunter

Monitor de precios de **placas de video (GPU)** en tiendas argentinas. PWA ultra-ligera (menos de 40 KB) + backend Node.js con scraping cada 10-15 minutos, alertas por Telegram y objetivos de precio configurables.

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
| `TELEGRAM_BOT_TOKEN` | vacío | Token del bot de Telegram |
| `TELEGRAM_CHAT_ID` | vacío | Chat ID donde llegan las alertas |

## Telegram

1. Creá un bot con [@BotFather](https://t.me/BotFather) y copiá el token.
2. Conseguí tu `chat_id` hablando con [@userinfobot](https://t.me/userinfobot) (o enviando un mensaje a tu bot y mirando `https://api.telegram.org/bot<TOKEN>/getUpdates`).
3. Completalo en **Ajustes** dentro de la PWA y tocá *Probar*, o seteá las dos variables de entorno.

Flujo de alerta: si el precio de un producto **baja** por debajo de tu objetivo (o aparece una oferta nueva ya bajo el objetivo) se envía un mensaje con link directo. Hay cooldown por producto (`alertCooldownMin`, default 12 h) y máximo 6 mensajes por corrida.

## API

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/health` | Salud del proceso |
| GET | `/api/status` | Última sincronización, si está corriendo |
| GET | `/api/meta` | Totales, GPUs, tiendas y objetivos |
| GET | `/api/products` | Listado paginado: `gpu`, `store`, `q`, `deal=1`, `sort=price-asc\|price-desc\|name`, `page`, `limit` (max 500) |
| GET/PUT | `/api/targets` | Objetivos de precio por modelo |
| GET/PUT | `/api/settings` | Telegram, tiendas habilitadas, intervalo |
| POST | `/api/sync` | Dispara una sincronización manual |
| POST | `/api/telegram/test` | Envía un mensaje de prueba |

`PUT /targets`, `PUT /settings`, `POST /sync` y `POST /telegram/test` requieren `X-Admin-Token` solo si `ADMIN_TOKEN` está definido. El token de Telegram se devuelve enmascarado (`GET /api/settings`).

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
  services/         sync, monitor (targets), telegram
public/             PWA (HTML/CSS/JS + sw + manifest, sin dependencias)
scripts/make-icons.js  íconos PNG generados por código
data/db.json        datos en runtime (gitignored)
```

Los datos viven en `data/db.json` (tmp + rename atómico): productos con historial de precios, targets, ajustes y estado de alertas. Sin compilar módulos nativos, así que funciona en el free tier.

## Despliegue en Render (gratis)

1. Subí el repo a GitHub y creá un **Web Service**.
2. Build command: `npm install` · Start command: `npm start`.
3. **Disco (Disk) persistente** montado en `./data` para que no se pierdan precios y alertas entre deploys (sin disco, el estado se regenera en la primera corrida).
4. Seteá `ADMIN_TOKEN` (y Telegram si querés alertas) en *Environment*.
5. Abrí la URL pública, *Add to Home Screen* para instalarla como app.

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