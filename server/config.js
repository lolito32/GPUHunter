import path from 'node:path';
import { loadEnv } from './env.js';

loadEnv();

const int = (v, d) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : d;
};

export const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');

export const PORT = int(process.env.PORT, 3000);
export const HOST = process.env.HOST || '0.0.0.0';
export const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
export const SYNC_INTERVAL_MIN = int(process.env.SYNC_INTERVAL_MIN, 12);
export const MAX_PAGES = int(process.env.MAX_PAGES, 4);
export const SCRAP_TIMEOUT_MS = int(process.env.SCRAP_TIMEOUT_MS, 30000);

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export const GPU_SUBCATEGORIES = new Set([6, 62, 116]);

export const STORES = [
  { key: 'compragamer', name: 'CompraGamer', url: 'https://www.compragamer.com', direct: true },
  { key: 'mexx', name: 'Mexx', url: 'https://www.mexx.com.ar', direct: true },
  { key: 'venex', name: 'Venex', url: 'https://www.venex.com.ar', direct: true },
  { key: 'gezatek', name: 'Gezatek', url: 'https://gezatek.com.ar', direct: true },
  { key: 'fullhard', name: 'FullH4rd', url: 'https://fullh4rd.com.ar', direct: true },
  { key: 'malditohard', name: 'MalditoHard', url: 'https://www.malditohard.com.ar', direct: true },
  { key: 'hardgamers', name: 'HardGamers', url: 'https://www.hardgamers.com.ar', direct: false }
];

export const STORE_BY_KEY = Object.fromEntries(STORES.map((s) => [s.key, s]));

export const DEFAULT_SETTINGS = {
  stores: Object.fromEntries(STORES.map((s) => [s.key, true])),
  intervalMin: SYNC_INTERVAL_MIN,
  maxPages: MAX_PAGES,
  alertCooldownMin: 720,
  notifyOnlyOnNewLow: true
};

export const DEFAULT_TARGETS = {
  'rx-6600': 350000,
  'rx-6700': 450000,
  'rx-6700-xt': 550000,
  'rx-7600': 500000,
  'rx-9060-xt': 730000,
  'rtx-3050': 420000,
  'rtx-3060': 790000,
  'rtx-3070': 950000,
  'rtx-5050': 590000,
  'rtx-5060': 750000,
  'rtx-5060-ti': 830000
};
