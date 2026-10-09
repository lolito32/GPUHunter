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
export const SYNC_INTERVAL_MIN = int(process.env.SYNC_INTERVAL_MIN, 240);
export const MAX_PAGES = int(process.env.MAX_PAGES, 4);
export const SCRAP_TIMEOUT_MS = int(process.env.SCRAP_TIMEOUT_MS, 30000);

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export const GPU_SUBCATEGORIES = new Set([6, 62, 116]);

export const GPU_CATALOG = [
  'gtx-1050-ti', 'gtx-1060', 'gtx-1650', 'gtx-1650-super', 'gtx-1660', 'gtx-1660-super', 'gtx-1660-ti',
  'rtx-2060', 'rtx-2060-super', 'rtx-2070', 'rtx-2070-super', 'rtx-2080', 'rtx-2080-super', 'rtx-2080-ti',
  'rtx-3050', 'rtx-3060', 'rtx-3060-ti', 'rtx-3070', 'rtx-3070-ti', 'rtx-3080', 'rtx-3080-ti', 'rtx-3090', 'rtx-3090-ti',
  'rtx-4060', 'rtx-4060-ti', 'rtx-4070', 'rtx-4070-super', 'rtx-4070-ti', 'rtx-4080', 'rtx-4080-super', 'rtx-4090',
  'rtx-5050', 'rtx-5060', 'rtx-5060-ti', 'rtx-5070', 'rtx-5070-ti', 'rtx-5080', 'rtx-5090',
  'rx-570', 'rx-580', 'rx-590', 'rx-5500-xt', 'rx-5600-xt', 'rx-5700', 'rx-5700-xt', 'rx-6400', 'rx-6500-xt',
  'rx-6600', 'rx-6600-xt', 'rx-6650-xt', 'rx-6700', 'rx-6700-xt', 'rx-6750-xt', 'rx-6800', 'rx-6800-xt',
  'rx-6900-xt', 'rx-6950-xt', 'rx-7600', 'rx-7600-xt', 'rx-7700-xt', 'rx-7800-xt', 'rx-7900-xt', 'rx-7900-xtx',
  'rx-9060', 'rx-9060-xt', 'rx-9070', 'rx-9070-xt',
  'arc-a380', 'arc-a580', 'arc-a750', 'arc-a770', 'arc-b570', 'arc-b580'
];

export const STORES = [
  { key: 'compragamer', name: 'CompraGamer', url: 'https://www.compragamer.com', direct: true },
  { key: 'mexx', name: 'Mexx', url: 'https://www.mexx.com.ar', direct: true },
  { key: 'venex', name: 'Venex', url: 'https://www.venex.com.ar', direct: true },
  { key: 'gezatek', name: 'Gezatek', url: 'https://gezatek.com.ar', direct: true },
  // { key: 'fullhard', name: 'FullH4rd', url: 'https://fullh4rd.com.ar', direct: true }, // Cloudflare JS challenge (403)
  // { key: 'malditohard', name: 'MalditoHard', url: 'https://www.malditohard.com.ar', direct: true }, // dominio dado de baja (NXDOMAIN)
  { key: '710tech', name: '710tech', url: 'https://710tech.com.ar', direct: true },
  { key: 'maximus', name: 'Maximus Gaming Hardware', url: 'https://www.maximus.com.ar', direct: true },
  // { key: 'pchardware', name: 'PC Hardware', url: 'https://www.pchardwareonline.com.ar', direct: true }, // precios solo por contacto
  { key: 'computienda', name: 'Computienda', url: 'https://www.computienda.com.ar', direct: true },
  { key: 'tecnobytes', name: 'Tecnobytes', url: 'https://www.tecnobytestore.com.ar', direct: true },
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
