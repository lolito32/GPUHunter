import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, DEFAULT_SETTINGS, DEFAULT_TARGETS } from './config.js';

const FILE = path.join(DATA_DIR, 'db.json');
const HISTORY_LIMIT = 24;
const STALE_MS = 7 * 24 * 60 * 60 * 1000;

const emptyData = () => ({
  v: 1,
  products: {},
  targets: { ...DEFAULT_TARGETS },
  settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
  alerts: {},
  devices: {},
  status: { lastSync: 0, lastDurationMs: 0, lastRun: null, runs: [], alertsSent: 0 }
});

let data = emptyData();
let saveTimer = null;
let freshStart = false;

function readDisk() {
  try {
    if (!fs.existsSync(FILE)) {
      freshStart = true;
      return;
    }
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (!parsed || typeof parsed !== 'object') throw new Error('db inválida');
    if (Object.keys(parsed.products || {}).length === 0) freshStart = true;
    data = {
      ...emptyData(),
      ...parsed,
      targets: { ...DEFAULT_TARGETS, ...(parsed.targets || {}) },
      settings: {
        ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
        ...(parsed.settings || {}),
        stores: { ...DEFAULT_SETTINGS.stores, ...((parsed.settings && parsed.settings.stores) || {}) }
      },
      devices: parsed.devices && typeof parsed.devices === 'object' ? parsed.devices : {},
      status: { ...emptyData().status, ...(parsed.status || {}) }
    };
  } catch {
    data = emptyData();
    freshStart = true;
  }
}

export const isFreshStart = () => freshStart;

function writeDisk() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, FILE);
}

export function init() {
  readDisk();
  return data;
}

export function scheduleSave(delay = 800) {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    flush();
  }, delay);
  if (saveTimer.unref) saveTimer.unref();
}

export function flush() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  try {
    writeDisk();
  } catch (err) {
    console.error('[store] error al guardar:', err.message);
  }
}

export const getTargets = () => data.targets;
export const getSettings = () => data.settings;
export const getStatus = () => data.status;
export const getAllProducts = () => data.products;

export function setTargets(next) {
  data.targets = { ...DEFAULT_TARGETS, ...next };
  scheduleSave();
}

export function setSettings(patch) {
  data.settings = {
    ...data.settings,
    ...patch,
    stores: { ...data.settings.stores, ...(patch.stores || {}) }
  };
  scheduleSave();
}

export function pruneAlerts(maxAgeMs = 30 * 24 * 60 * 60 * 1000) {
  const cutoff = Date.now() - maxAgeMs;
  for (const [id, alert] of Object.entries(data.alerts)) {
    const ts = typeof alert === 'number' ? alert : alert.t;
    if (!ts || ts < cutoff) delete data.alerts[id];
  }
}

export function getAlert(id) {
  const alert = data.alerts[id];
  if (!alert) return null;
  if (typeof alert === 'number') return { t: alert, p: 0 };
  return alert;
}

export function markAlerted(id, price, ts = Date.now()) {
  data.alerts[id] = { t: ts, p: price };
  scheduleSave();
}
export function recordAlert() {
  data.status.alertsSent = (data.status.alertsSent || 0) + 1;
}

export function getDevices() {
  return data.devices || {};
}

export function registerDevice({ token, platform = 'android', model = '' }) {
  if (!token || typeof token !== 'string') return false;
  const clean = token.trim();
  if (!clean) return false;
  if (!data.devices) data.devices = {};
  const now = Date.now();
  data.devices[clean] = {
    registeredAt: data.devices[clean]?.registeredAt || now,
    lastSeen: now,
    platform: platform || 'android',
    model: model || ''
  };
  scheduleSave();
  return true;
}

export function unregisterDevice(token) {
  if (!token || !data.devices || !data.devices[token]) return false;
  delete data.devices[token];
  scheduleSave();
  return true;
}

export function mergeProducts(list, seenAt = Date.now()) {
  let added = 0;
  let changed = 0;
  const drops = [];
  const addedProducts = [];
  for (const item of list) {
    const existing = data.products[item.id];
    if (!existing) {
      const created = {
        id: item.id,
        store: item.store,
        name: item.name,
        gpu: item.gpu,
        price: item.price,
        prevPrice: item.price,
        url: item.url,
        image: item.image || '',
        source: item.source || '',
        updatedAt: seenAt,
        seenAt,
        history: [{ t: seenAt, p: item.price }]
      };
      data.products[item.id] = created;
      addedProducts.push(created);
      added++;
      continue;
    }
    const before = existing.price;
    existing.seenAt = seenAt;
    existing.name = item.name;
    existing.url = item.url;
    existing.gpu = item.gpu;
    existing.source = item.source || '';
    if (item.image) existing.image = item.image;
    if (item.price !== before) {
      existing.prevPrice = before;
      existing.price = item.price;
      existing.updatedAt = seenAt;
      const hist = existing.history || [];
      hist.push({ t: seenAt, p: item.price });
      existing.history = hist.slice(-HISTORY_LIMIT);
      changed++;
      if (item.price < before) drops.push({ product: existing, from: before, to: item.price });
    }
  }
  return { added, changed, drops, addedProducts, total: list.length };
}

export function pruneStale(now = Date.now()) {
  let removed = 0;
  for (const [id, product] of Object.entries(data.products)) {
    if (now - (product.seenAt || 0) > STALE_MS) {
      delete data.products[id];
      removed++;
    }
  }
  return removed;
}

export function setStatus(status) {
  data.status = { ...data.status, ...status };
  if (Array.isArray(data.status.runs)) {
    data.status.runs = data.status.runs.slice(0, 10);
  }
  scheduleSave();
}
