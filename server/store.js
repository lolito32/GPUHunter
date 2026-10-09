import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, DEFAULT_SETTINGS, DEFAULT_TARGETS } from './config.js';

const FILE = path.join(DATA_DIR, 'db.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const HISTORY_LIMIT = 24;
const HISTORY_MAX_POINTS = 730;
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
let history = {};
let saveTimer = null;
let freshStart = false;
let historyDirty = false;

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

function readHistory() {
  try {
    if (!fs.existsSync(HISTORY_FILE)) {
      history = {};
      return;
    }
    const parsed = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    history = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    history = {};
  }
}

function writeHistory() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = HISTORY_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(history));
  fs.renameSync(tmp, HISTORY_FILE);
}

export function init() {
  readDisk();
  readHistory();
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
  if (historyDirty) {
    try {
      writeHistory();
      historyDirty = false;
    } catch (err) {
      console.error('[store] error al guardar historial:', err.message);
    }
  }
}

export const getTargets = () => data.targets;
export const getSettings = () => data.settings;
export const getStatus = () => data.status;
export const getAllProducts = () => data.products;
export const getHistory = () => history;

export function recordHistory(list, seenAt = Date.now()) {
  const day = new Date(seenAt).toISOString().slice(0, 10);
  let touched = false;
  for (const item of list) {
    if (!item || !item.id || !item.price || item.price <= 0) continue;
    const arr = Array.isArray(history[item.id]) ? history[item.id] : [];
    const last = arr[arr.length - 1];
    let changed = false;
    if (last && last.d === day) {
      if (last.p !== item.price) {
        arr[arr.length - 1] = { d: day, p: item.price };
        changed = true;
      }
    } else if (!last || last.p !== item.price) {
      arr.push({ d: day, p: item.price });
      changed = true;
    }
    if (changed) {
      history[item.id] = arr.length > HISTORY_MAX_POINTS ? arr.slice(-HISTORY_MAX_POINTS) : arr;
      touched = true;
    }
  }
  if (touched) {
    historyDirty = true;
    scheduleSave();
  }
  return touched;
}

export function pruneHistory() {
  let removed = 0;
  for (const key of Object.keys(history)) {
    if (!data.products[key]) {
      delete history[key];
      removed++;
    }
  }
  if (removed) {
    historyDirty = true;
    scheduleSave();
  }
  return removed;
}

export function seedHistory(entries) {
  if (!entries || typeof entries !== 'object') return 0;
  let added = 0;
  for (const [gpu, series] of Object.entries(entries)) {
    if (!gpu || !Array.isArray(series) || !series.length) continue;
    const merged = new Map();
    const existing = Array.isArray(history[gpu]) ? history[gpu] : [];
    for (const pt of existing) {
      if (pt && pt.d) merged.set(pt.d, Number(pt.p));
    }
    for (const pt of series) {
      if (!pt || !pt.d || !Number.isFinite(Number(pt.p))) continue;
      if (!merged.has(pt.d)) {
        merged.set(pt.d, Number(pt.p));
        added++;
      }
    }
    const arr = [...merged.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([d, p]) => ({ d, p }));
    history[gpu] = arr.slice(-HISTORY_MAX_POINTS);
  }
  historyDirty = true;
  return added;
}

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

const MAX_GPU_MODELS = 30;

export function registerDevice({ token, platform, model, gpuModels, maxPrice }) {
  if (!token || typeof token !== 'string') return false;
  const clean = token.trim();
  if (clean.length < 20) return false;
  if (!data.devices) data.devices = {};
  const now = Date.now();
  const existing = data.devices[clean] || {};

  let cleanGpuModels = Array.isArray(existing.gpuModels) ? existing.gpuModels : [];
  if (Array.isArray(gpuModels)) {
    const seen = new Set();
    cleanGpuModels = [];
    for (const raw of gpuModels) {
      const value = String(raw ?? '').replace(/\s+/g, ' ').trim();
      if (!value) continue;
      const key = value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      cleanGpuModels.push(value);
      if (cleanGpuModels.length >= MAX_GPU_MODELS) break;
    }
  }

  let cleanMaxPrice = Number(existing.maxPrice) > 0 ? Math.round(Number(existing.maxPrice)) : 0;
  if (maxPrice !== undefined && maxPrice !== null && maxPrice !== '') {
    const parsed = Number(maxPrice);
    if (Number.isFinite(parsed) && parsed >= 0) cleanMaxPrice = Math.round(parsed);
  }

  data.devices[clean] = {
    registeredAt: existing.registeredAt || now,
    lastSeen: now,
    platform: platform || existing.platform || 'android',
    model: model || existing.model || '',
    gpuModels: cleanGpuModels,
    maxPrice: cleanMaxPrice
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
        used: item.used ? 1 : 0,
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
    existing.used = item.used ? 1 : 0;
    if (item.image) {
      existing.image = item.image;
      existing.imageBorrowed = 0;
    }
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

const IMG_STOP = new Set([
  'placa', 'placas', 'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'con', 'para',
  'video', 'tarjeta', 'tarjetas', 'grafica', 'graficas', 'gpu', 'graficos',
  'geforce', 'radeon', 'nvidia', 'amd', 'intel', 'gb', 'memoria', 'pcie'
]);

function imageSignature(name) {
  const seen = new Set();
  const text = String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ');
  for (const token of text.split(' ')) {
    if (!token || IMG_STOP.has(token)) continue;
    if (/^\d{1,2}$/.test(token) || /^\d+gb$/.test(token) || /^gddr\d*x?$/.test(token)) continue;
    seen.add(token);
  }
  return [...seen].sort();
}

function similarity(a, b) {
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  let inter = 0;
  for (const token of a) if (setB.has(token)) inter++;
  const union = new Set([...a, ...b]).size;
  return union ? inter / union : 0;
}

export function fillMissingImages() {
  const products = Object.values(data.products);
  const index = new Map();
  for (const product of products) {
    if (!product || !product.image || product.imageBorrowed || !product.gpu) continue;
    const sig = imageSignature(product.name);
    if (!sig.length) continue;
    const arr = index.get(product.gpu) || [];
    arr.push({ sig, image: product.image, store: product.store });
    index.set(product.gpu, arr);
  }
  if (!index.size) return 0;

  let filled = 0;
  for (const product of products) {
    if (!product || product.image || !product.gpu) continue;
    const candidates = index.get(product.gpu);
    if (!candidates) continue;
    const sig = imageSignature(product.name);
    if (!sig.length) continue;
    let best = null;
    let bestScore = 0.7;
    for (const candidate of candidates) {
      if (candidate.store === product.store) continue;
      const score = similarity(sig, candidate.sig);
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    if (best) {
      product.image = best.image;
      product.imageBorrowed = 1;
      filled++;
    }
  }
  if (filled) scheduleSave();
  return filled;
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

export function pruneUnsupportedGpus(isSupported) {
  if (typeof isSupported !== 'function') return 0;
  let removed = 0;
  for (const [id, product] of Object.entries(data.products)) {
    if (!product || !isSupported(product.gpu)) {
      delete data.products[id];
      removed++;
    }
  }
  if (removed) scheduleSave();
  return removed;
}

export function setStatus(status) {
  data.status = { ...data.status, ...status };
  if (Array.isArray(data.status.runs)) {
    data.status.runs = data.status.runs.slice(0, 10);
  }
  scheduleSave();
}
