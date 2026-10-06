import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import api from './api.js';
import { PORT, HOST, DATA_DIR, SYNC_INTERVAL_MIN } from './config.js';
import { init, flush, getSettings } from './store.js';
import { runSync, isSyncing } from './services/sync.js';

init();

const app = express();
const PUBLIC_DIR = path.resolve(process.cwd(), 'public');

app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.use('/api', api);

app.use(
  express.static(PUBLIC_DIR, {
    index: 'index.html',
    maxAge: '0',
    setHeaders(res, filePath) {
      if (/\.(html|css|js|webmanifest)$/.test(filePath) || filePath.endsWith('sw.js')) {
        res.setHeader('Cache-Control', 'no-cache');
      } else if (filePath.includes('icons')) {
        res.setHeader('Cache-Control', 'public, max-age=86400');
      }
    }
  })
);

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.use((err, _req, res, _next) => {
  console.error('[api]', err.message);
  res.status(500).json({ error: 'error interno' });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`[gpuhunter] escuchando en http://${HOST}:${PORT} (datos: ${DATA_DIR})`);
});

let timer = null;

function schedule(delayMs) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(tick, delayMs);
  if (timer.unref) timer.unref();
}

async function tick() {
  if (!isSyncing()) {
    try {
      const result = await runSync('cron');
      console.log(
        `[gpuhunter] sync ${new Date(result.at).toISOString()} · ${result.products} productos · ${result.durationMs}ms · alertas ${result.alerts}`
      );
    } catch (err) {
      console.error('[gpuhunter] sync error:', err.message);
    }
  }
  schedule(nextDelay());
}

function nextDelay() {
  const settings = getSettings();
  const minutes = Number(settings.intervalMin) > 0 ? Number(settings.intervalMin) : SYNC_INTERVAL_MIN;
  const jitter = 0.92 + Math.random() * 0.16;
  return Math.round(minutes * 60000 * jitter);
}

schedule(15000);

const shutdown = () => {
  flush();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('unhandledRejection', (err) => console.error('[gpuhunter] unhandled:', err));
process.on('uncaughtException', (err) => console.error('[gpuhunter] uncaught:', err));

if (!fs.existsSync(PUBLIC_DIR)) {
  console.warn(`[gpuhunter] falta la carpeta public/ en ${PUBLIC_DIR}`);
}
