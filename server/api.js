import express from 'express';
import {
  ADMIN_TOKEN,
  STORES,
  SYNC_INTERVAL_MIN,
  MAX_PAGES,
  GPU_CATALOG
} from './config.js';
import {
  getAllProducts,
  getHistory,
  getSettings,
  getStatus,
  getTargets,
  isFreshStart,
  setSettings,
  setTargets
} from './store.js';
import { labelForKey } from './gpu.js';
import { runSync, isSyncing } from './services/sync.js';
import { registerDevice, unregisterDevice, getDevices } from './store.js';
import { isFcmConfigured, sendPushToDevices, sendPushToToken } from './services/fcm.js';

const router = express.Router();
const API_HISTORY_POINTS = 120;

router.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'content-type, x-admin-token');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const adminOnly = (req, res, next) => {
  if (!ADMIN_TOKEN) return next();
  if (req.get('x-admin-token') === ADMIN_TOKEN) return next();
  res.status(401).json({ error: 'Se requiere cabecera X-Admin-Token' });
};

router.get('/health', (_req, res) => {
  res.json({ ok: true, uptime: Math.round(process.uptime()) });
});

router.get('/ping', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

router.get('/status', (_req, res) => {
  const status = getStatus();
  res.set('Cache-Control', 'no-store');
  res.json({
    lastSync: status.lastSync || 0,
    lastDurationMs: status.lastDurationMs || 0,
    alertsSent: status.alertsSent || 0,
    syncing: isSyncing(),
    intervalMin: getSettings().intervalMin || SYNC_INTERVAL_MIN,
    lastRun: status.lastRun || null,
    fresh: isFreshStart() ? 1 : 0,
    version: '1.0.0'
  });
});

router.get('/meta', (_req, res) => {
  const products = Object.values(getAllProducts());
  const targets = getTargets();
  const settings = getSettings();
  const gpuMap = new Map();
  const storeMap = new Map();
  let underTarget = 0;
  let usedCount = 0;

  for (const product of products) {
    const gpu = gpuMap.get(product.gpu) || { k: product.gpu, l: labelForKey(product.gpu), n: 0 };
    gpu.n++;
    gpuMap.set(product.gpu, gpu);

    const store = storeMap.get(product.store) || { k: product.store, n: 0 };
    store.n++;
    storeMap.set(product.store, store);

    if (product.used) usedCount++;
    if (targets[product.gpu] && product.price <= targets[product.gpu]) underTarget++;
  }

  const status = getStatus();
  const gpus = [...gpuMap.values()];
  for (const key of GPU_CATALOG) {
    if (!gpuMap.has(key)) gpus.push({ k: key, l: labelForKey(key), n: 0 });
  }
  for (const key of Object.keys(targets)) {
    if (!gpuMap.has(key) && !GPU_CATALOG.includes(key)) gpus.push({ k: key, l: labelForKey(key), n: 0 });
  }
  const order = new Map(GPU_CATALOG.map((k, i) => [k, i]));
  gpus.sort(
    (a, b) => b.n - a.n || (order.get(a.k) ?? 9999) - (order.get(b.k) ?? 9999) || a.l.localeCompare(b.l, 'es')
  );

  res.set('Cache-Control', 'no-store');
  res.json({
    lastSync: status.lastSync || 0,
    lastDurationMs: status.lastDurationMs || 0,
    syncing: isSyncing(),
    fresh: isFreshStart() ? 1 : 0,
    total: products.length,
    underTarget,
    usedCount,
    alertsSent: status.alertsSent || 0,
    intervalMin: settings.intervalMin || SYNC_INTERVAL_MIN,
    gpus,
    stores: STORES.map((s, i) => ({
      k: s.key,
      n: s.name,
      order: i,
      on: settings.stores[s.key] !== false,
      count: storeMap.get(s.key)?.n || 0
    })),
    targets
  });
});

router.get('/offers', (req, res) => {
  req.url = '/products';
  router.handle(req, res);
});

const FPS_MAP = {
  'gtx-1050-ti': 35, 'gtx-1060': 50, 'gtx-1650': 45, 'gtx-1650-super': 55,
  'gtx-1660': 65, 'gtx-1660-super': 75, 'gtx-1660-ti': 80,
  'rtx-2060': 85, 'rtx-2060-super': 95, 'rtx-2070': 105, 'rtx-2070-super': 115,
  'rtx-2080': 120, 'rtx-2080-super': 130, 'rtx-2080-ti': 145,
  'rtx-3050': 65, 'rtx-3060': 85, 'rtx-3060-ti': 115, 'rtx-3070': 140,
  'rtx-3070-ti': 155, 'rtx-3080': 180, 'rtx-3080-ti': 195, 'rtx-3090': 200, 'rtx-3090-ti': 210,
  'rtx-4060': 105, 'rtx-4060-ti': 130, 'rtx-4070': 175, 'rtx-4070-super': 195,
  'rtx-4070-ti': 210, 'rtx-4080': 245, 'rtx-4080-super': 255, 'rtx-4090': 310,
  'rtx-5050': 80, 'rtx-5060': 120, 'rtx-5060-ti': 150, 'rtx-5070': 200,
  'rtx-5070-ti': 230, 'rtx-5080': 280, 'rtx-5090': 350,
  'rx-570': 50, 'rx-580': 60, 'rx-590': 70, 'rx-5500-xt': 55, 'rx-5600-xt': 80,
  'rx-5700': 100, 'rx-5700-xt': 115, 'rx-6400': 35, 'rx-6500-xt': 45,
  'rx-6600': 75, 'rx-6600-xt': 95, 'rx-6650-xt': 100, 'rx-6700': 110,
  'rx-6700-xt': 125, 'rx-6750-xt': 135, 'rx-6800': 160, 'rx-6800-xt': 180,
  'rx-6900-xt': 195, 'rx-6950-xt': 205, 'rx-7600': 105, 'rx-7600-xt': 115,
  'rx-7700-xt': 150, 'rx-7800-xt': 185, 'rx-7900-xt': 230, 'rx-7900-xtx': 260,
  'arc-a380': 40, 'arc-a580': 70, 'arc-a750': 95, 'arc-a770': 105,
  'arc-b570': 110, 'arc-b580': 130
};
function getGpuFps(gpuKey) {
  if (!gpuKey) return 70;
  return FPS_MAP[gpuKey] || 70;
}

router.get('/products', (req, res) => {
  const { gpu, store, q, deal, used } = req.query;
  const page = clamp(req.query.page, 1, 1, 10000);
  const limit = clamp(req.query.limit, 60, 1, 500);
  const validSorts = ['price-asc', 'price-desc', 'name', 'value-asc', 'value-desc'];
  const sort = validSorts.includes(req.query.sort) ? req.query.sort : 'price-asc';
  const targets = getTargets();
  const needle = normalize(q);
  const minPrice = optionalNumber(req.query.min, 0);
  const maxPrice = optionalNumber(req.query.max, 0);

  let list = Object.values(getAllProducts());
  if (gpu) list = list.filter((p) => p.gpu === gpu);
  if (store) list = list.filter((p) => p.store === store);
  if (needle) list = list.filter((p) => normalize(p.name).includes(needle));
  if (deal === '1') list = list.filter((p) => targets[p.gpu] && p.price <= targets[p.gpu]);
  if (used === '1') list = list.filter((p) => p.used);
  if (minPrice !== null) list = list.filter((p) => p.price >= minPrice);
  if (maxPrice !== null) list = list.filter((p) => p.price <= maxPrice);

  if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  else if (sort === 'price-desc') list.sort((a, b) => b.price - a.price);
  else if (sort === 'value-asc') list.sort((a, b) => (a.price / getGpuFps(a.gpu)) - (b.price / getGpuFps(b.gpu)));
  else if (sort === 'value-desc') list.sort((a, b) => (b.price / getGpuFps(b.gpu)) - (a.price / getGpuFps(a.gpu)));
  else list.sort((a, b) => a.price - b.price);

  const total = list.length;
  const start = (page - 1) * limit;
  const slice = list.slice(start, start + limit);
  const history = getHistory();
  const items = slice.map((p) => {
    const item = { id: p.id, st: p.store, nm: p.name, gp: p.gpu, pr: p.price, ur: p.url };
    if (p.image) item.im = p.image;
    if (p.prevPrice && p.prevPrice !== p.price) item.dl = p.price - p.prevPrice;
    if (p.source) item.sc = p.source;
    if (p.used) item.us = 1;
    if (targets[p.gpu] && p.price <= targets[p.gpu]) item.tg = 1;
    const series = history[p.id];
    if (Array.isArray(series) && series.length) item.hs = series.slice(-API_HISTORY_POINTS);
    return item;
  });

  res.set('Cache-Control', 'public, max-age=30');
  res.json({
    items,
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
    lastSync: getStatus().lastSync || 0
  });
});

router.get('/history', (req, res) => {
  const all = getHistory();
  res.set('Cache-Control', 'public, max-age=60');
  const { gpu } = req.query;
  if (gpu) {
    res.json({ [gpu]: Array.isArray(all[gpu]) ? all[gpu] : [] });
    return;
  }
  res.json(all);
});

router.get('/app/version', (_req, res) => {
  res.json({
    latestVersion: '1.2.0',
    minVersion: '1.0.0',  
    apkUrl: 'https://github.com/lolito32/GPUHunter/releases/download/v1.2.0/GPUHunter-v1.2.0.apk'
  });
});

router.get('/targets', (_req, res) => {
  res.json({ targets: getTargets() });
});

router.put('/targets', adminOnly, (req, res) => {
  const incoming = req.body && typeof req.body === 'object' ? req.body.targets || req.body : {};
  const clean = {};
  for (const [key, value] of Object.entries(incoming)) {
    const price = Number(value);
    if (!Number.isFinite(price)) continue;
    clean[key] = price <= 0 ? 0 : Math.round(price);
  }
  setTargets(clean);
  res.json({ targets: getTargets() });
});

router.get('/settings', (_req, res) => {
  res.json(publicSettings());
});

router.put('/settings', adminOnly, (req, res) => {
  const body = req.body || {};
  const current = getSettings();
  const patch = {};

  if (body.stores && typeof body.stores === 'object') {
    patch.stores = { ...current.stores };
    for (const store of STORES) {
      if (typeof body.stores[store.key] === 'boolean') patch.stores[store.key] = body.stores[store.key];
    }
    patch.stores.hardgamers = patch.stores.hardgamers !== false;
  }
  if (body.intervalMin !== undefined) patch.intervalMin = clamp(body.intervalMin, SYNC_INTERVAL_MIN, 5, 1440);
  if (body.maxPages !== undefined) patch.maxPages = clamp(body.maxPages, MAX_PAGES, 1, 8);
  if (body.alertCooldownMin !== undefined) patch.alertCooldownMin = clamp(body.alertCooldownMin, 720, 5, 10080);
  if (typeof body.notifyOnlyOnNewLow === 'boolean') patch.notifyOnlyOnNewLow = body.notifyOnlyOnNewLow;

  setSettings(patch);
  res.json(publicSettings());
});

router.post('/register-device', (req, res) => {
  const body = req.body || {};
  if (body.remove) {
    const ok = unregisterDevice(body.token);
    res.json({ ok, devices: Object.keys(getDevices()).length });
    return;
  }
  const ok = registerDevice({
    token: body.token,
    platform: body.platform,
    model: body.model,
    gpuModels: body.gpuModels,
    maxPrice: body.maxPrice
  });
  if (!ok) {
    res.status(400).json({ error: 'token inválido' });
    return;
  }
  res.json({ ok: true, devices: Object.keys(getDevices()).length, fcm: isFcmConfigured() });
});

const MAX_PREF_GPU_MODELS = 30;
const MAX_PREF_PRICE = 100000000;

router.post('/user/preferences', (req, res) => {
  const body = req.body || {};
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  if (!token || token.length < 20) {
    res.status(400).json({ error: 'token inválido o faltante' });
    return;
  }
  if (body.gpuModels !== undefined && body.gpuModels !== null) {
    if (!Array.isArray(body.gpuModels)) {
      res.status(400).json({ error: 'gpuModels debe ser una lista de modelos' });
      return;
    }
    if (body.gpuModels.some((m) => typeof m !== 'string')) {
      res.status(400).json({ error: 'gpuModels debe contener solo texto' });
      return;
    }
    if (body.gpuModels.length > MAX_PREF_GPU_MODELS) {
      res.status(400).json({ error: `gpuModels admite hasta ${MAX_PREF_GPU_MODELS} modelos` });
      return;
    }
  }
  if (body.maxPrice !== undefined && body.maxPrice !== null && body.maxPrice !== '') {
    const parsed = Number(body.maxPrice);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_PREF_PRICE) {
      res.status(400).json({ error: 'maxPrice debe ser un importe en ARS entre 0 y ' + MAX_PREF_PRICE });
      return;
    }
  }
  const ok = registerDevice({
    token,
    gpuModels: body.gpuModels,
    maxPrice: body.maxPrice
  });
  if (!ok) {
    res.status(400).json({ error: 'no se pudieron actualizar las preferencias' });
    return;
  }
  const device = getDevices()[token];
  res.json({ ok: true, preferences: { gpuModels: device.gpuModels || [], maxPrice: device.maxPrice || 0 } });
});

router.post('/test-notification', adminOnly, (req, res) => {
  const body = req.body || {};
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  if (!token) {
    res.status(400).json({ success: false, message: 'Falta el token FCM' });
    return;
  }
  res.json({ success: true, message: 'Notificación programada en 30s' });
  setTimeout(() => {
    sendPushToToken(token, {
      title: 'Oferta de Prueba GPUHunter',
      body: 'Si ves este mensaje, las notificaciones Push nativas en segundo plano funcionan correctamente.'
    })
      .then((r) => console.log('[api] test-notification:', JSON.stringify(r)))
      .catch((e) => console.error('[api] test-notification error:', e.message));
  }, 30000);
});

router.post('/sync', adminOnly, (req, res) => {
  if (isSyncing()) {
    res.status(202).json({ queued: false, busy: true });
    return;
  }
  runSync('manual').catch((err) => console.error('[sync] error:', err.message));
  res.status(202).json({ queued: true });
});

router.post('/test-push', adminOnly, (req, res) => {
  const body = req.body || {};
  const raw = Number(body.delaySec);
  const delaySec = Number.isFinite(raw) ? Math.min(Math.max(Math.round(raw), 0), 300) : 30;
  const devices = getDevices();
  const count = Object.keys(devices).length;
  const fcm = isFcmConfigured();
  res.json({ ok: true, delaySec, devices: count, fcm });
  if (!count || !fcm) return;
  setTimeout(() => {
    sendPushToDevices(getDevices(), {
      title: 'GPUHunter · notificación de prueba',
      body: 'Push de prueba desde el panel Debug (' + new Date().toLocaleTimeString('es-AR') + ')',
      url: '/',
      data: { url: '/', test: '1' }
    })
      .then((r) => console.log('[api] test-push:', JSON.stringify(r)))
      .catch((e) => console.error('[api] test-push error:', e.message));
  }, delaySec * 1000);
});

function publicSettings() {
  const settings = getSettings();
  return {
    stores: { ...settings.stores },
    intervalMin: settings.intervalMin || SYNC_INTERVAL_MIN,
    maxPages: settings.maxPages || MAX_PAGES,
    alertCooldownMin: settings.alertCooldownMin || 720,
    notifyOnlyOnNewLow: settings.notifyOnlyOnNewLow !== false,
    adminTokenRequired: Boolean(ADMIN_TOKEN),
    devices: Object.keys(getDevices()).length,
    fcm: isFcmConfigured()
  };
}

const normalize = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

function clamp(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function optionalNumber(value, min = 0) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min) return null;
  return Math.round(n);
}

export default router;
