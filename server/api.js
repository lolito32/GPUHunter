import express from 'express';
import {
  ADMIN_TOKEN,
  STORES,
  SYNC_INTERVAL_MIN,
  MAX_PAGES
} from './config.js';
import {
  getAllProducts,
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
import { isFcmConfigured } from './services/fcm.js';

const router = express.Router();

const adminOnly = (req, res, next) => {
  if (!ADMIN_TOKEN) return next();
  if (req.get('x-admin-token') === ADMIN_TOKEN) return next();
  res.status(401).json({ error: 'Se requiere cabecera X-Admin-Token' });
};

router.get('/health', (_req, res) => {
  res.json({ ok: true, uptime: Math.round(process.uptime()) });
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

  for (const product of products) {
    const gpu = gpuMap.get(product.gpu) || { k: product.gpu, l: labelForKey(product.gpu), n: 0 };
    gpu.n++;
    gpuMap.set(product.gpu, gpu);

    const store = storeMap.get(product.store) || { k: product.store, n: 0 };
    store.n++;
    storeMap.set(product.store, store);

    if (targets[product.gpu] && product.price <= targets[product.gpu]) underTarget++;
  }

  const status = getStatus();
  const gpus = [...gpuMap.values()];
  for (const key of Object.keys(targets)) {
    if (!gpuMap.has(key)) gpus.push({ k: key, l: labelForKey(key), n: 0 });
  }
  gpus.sort((a, b) => b.n - a.n || a.l.localeCompare(b.l, 'es'));

  res.set('Cache-Control', 'no-store');
  res.json({
    lastSync: status.lastSync || 0,
    lastDurationMs: status.lastDurationMs || 0,
    syncing: isSyncing(),
    fresh: isFreshStart() ? 1 : 0,
    total: products.length,
    underTarget,
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

router.get('/products', (req, res) => {
  const { gpu, store, q, deal } = req.query;
  const page = clamp(req.query.page, 1, 1, 10000);
  const limit = clamp(req.query.limit, 60, 1, 500);
  const sort = ['price-asc', 'price-desc', 'name'].includes(req.query.sort) ? req.query.sort : 'price-asc';
  const targets = getTargets();
  const needle = normalize(q);

  let list = Object.values(getAllProducts());
  if (gpu) list = list.filter((p) => p.gpu === gpu);
  if (store) list = list.filter((p) => p.store === store);
  if (needle) list = list.filter((p) => normalize(p.name).includes(needle));
  if (deal === '1') list = list.filter((p) => targets[p.gpu] && p.price <= targets[p.gpu]);

  if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  else if (sort === 'price-desc') list.sort((a, b) => b.price - a.price);
  else list.sort((a, b) => a.price - b.price);

  const total = list.length;
  const start = (page - 1) * limit;
  const slice = list.slice(start, start + limit);
  const items = slice.map((p) => {
    const item = { st: p.store, nm: p.name, gp: p.gpu, pr: p.price, ur: p.url };
    if (p.image) item.im = p.image;
    if (p.prevPrice && p.prevPrice !== p.price) item.dl = p.price - p.prevPrice;
    if (p.source) item.sc = p.source;
    if (targets[p.gpu] && p.price <= targets[p.gpu]) item.tg = 1;
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
  if (body.intervalMin !== undefined) patch.intervalMin = clamp(body.intervalMin, SYNC_INTERVAL_MIN, 5, 120);
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
    model: body.model
  });
  if (!ok) {
    res.status(400).json({ error: 'token inválido' });
    return;
  }
  res.json({ ok: true, devices: Object.keys(getDevices()).length, fcm: isFcmConfigured() });
});

router.post('/sync', adminOnly, (req, res) => {
  if (isSyncing()) {
    res.status(202).json({ queued: false, busy: true });
    return;
  }
  runSync('manual').catch((err) => console.error('[sync] error:', err.message));
  res.status(202).json({ queued: true });
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

export default router;
