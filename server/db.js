import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config.js';

const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

let usePg = false;
let pgClient = null;

function ensureDataDir() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch {}
}

async function initPg() {
  if (!process.env.DATABASE_URL) return false;
  try {
    const pg = (await import('pg')).default || (await import('pg'));
    const { Client } = pg;
    pgClient = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    await pgClient.connect();
    await pgClient.query(`CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      model_name TEXT,
      store TEXT,
      product_url TEXT,
      image_url TEXT,
      created_at TIMESTAMP,
      updated_at TIMESTAMP
    )`);
    await pgClient.query(`CREATE TABLE IF NOT EXISTS price_history (
      id SERIAL PRIMARY KEY,
      product_id TEXT,
      price DECIMAL(12,2),
      recorded_at TIMESTAMP
    )`);
    usePg = true;
    return true;
  } catch {
    pgClient = null;
    usePg = false;
    return false;
  }
}

function readJson() {
  ensureDataDir();
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const raw = fs.readFileSync(HISTORY_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch {}
  return { products: [], price_history: [] };
}

function writeJson(data) {
  ensureDataDir();
  try {
    const tmp = HISTORY_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, HISTORY_FILE);
  } catch {}
}

const jsonStore = {
  async init() {
    const d = readJson();
    jsonStore.data = d;
  },
  data: { products: [], price_history: [] }
};

let initialized = false;

export async function initDb() {
  if (initialized) return dbAdapter;
  await initPg();
  if (!usePg) {
    await jsonStore.init().catch(() => {});
  }
  initialized = true;
  return dbAdapter;
}

const dbAdapter = {
  async upsertProduct(p) {
    if (usePg && pgClient) {
      await pgClient.query(
        `INSERT INTO products (id, model_name, store, product_url, image_url, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (id) DO UPDATE SET
           model_name=EXCLUDED.model_name,
           store=EXCLUDED.store,
           product_url=EXCLUDED.product_url,
           image_url=EXCLUDED.image_url,
           updated_at=EXCLUDED.updated_at`,
        [p.id, p.model_name, p.store, p.product_url, p.image_url, p.created_at, p.updated_at]
      );
      return;
    }
    const arr = jsonStore.data.products;
    const ex = arr.find(x => x.id === p.id);
    if (ex) {
      ex.model_name = p.model_name;
      ex.store = p.store;
      ex.product_url = p.product_url;
      ex.image_url = p.image_url;
      ex.updated_at = p.updated_at;
    } else {
      arr.push({ ...p });
    }
    writeJson(jsonStore.data);
  },
  async getLastPrice(productId) {
    if (usePg && pgClient) {
      const r = await pgClient.query(
        `SELECT price FROM price_history WHERE product_id=$1 ORDER BY recorded_at DESC, id DESC LIMIT 1`,
        [productId]
      );
      return r.rows.length ? Number(r.rows[0].price) : null;
    }
    const arr = jsonStore.data.price_history.filter(x => x.product_id === productId);
    if (arr.length === 0) return null;
    arr.sort((a,b)=>{
      const da=new Date(a.recorded_at||0).getTime();
      const db=new Date(b.recorded_at||0).getTime();
      if(db!==da) return db-da;
      return (b.id||0)-(a.id||0);
    });
    return Number(arr[0].price);
  },
  async insertPriceHistory(row) {
    if (usePg && pgClient) {
      await pgClient.query(
        `INSERT INTO price_history (product_id, price, recorded_at) VALUES ($1,$2,$3)`,
        [row.product_id, row.price, row.recorded_at]
      );
      return;
    }
    const arr = jsonStore.data.price_history;
    const id = arr.length > 0 ? Math.max(...arr.map(x=>x.id||0))+1 : 1;
    arr.push({ id, product_id: row.product_id, price: row.price, recorded_at: row.recorded_at });
    writeJson(jsonStore.data);
  },
  async getHistory(productId) {
    if (usePg && pgClient) {
      const r = await pgClient.query(
        `SELECT id, product_id, price, recorded_at FROM price_history WHERE product_id=$1 ORDER BY recorded_at ASC, id ASC`,
        [productId]
      );
      return r.rows.map(x=>({ id:x.id, product_id:x.product_id, price:Number(x.price), recorded_at:x.recorded_at }));
    }
    const arr = jsonStore.data.price_history.filter(x => x.product_id === productId);
    arr.sort((a,b)=>{
      const da=new Date(a.recorded_at||0).getTime();
      const db=new Date(b.recorded_at||0).getTime();
      if(da!==db) return da-db;
      return (a.id||0)-(b.id||0);
    });
    return arr.map(x=>({ id:x.id, product_id:x.product_id, price:Number(x.price), recorded_at:x.recorded_at }));
  },
  async getStats(productId) {
    const h = await this.getHistory(productId);
    if (!h.length) return { min:0, max:0, avg:0, count:0 };
    const prices = h.map(x=>Number(x.price)).filter(n=>Number.isFinite(n));
    if (!prices.length) return { min:0, max:0, avg:0, count:0 };
    const min=Math.min(...prices), max=Math.max(...prices), avg=prices.reduce((a,b)=>a+b,0)/prices.length;
    return { min, max, avg: Math.round(avg*100)/100, count: prices.length };
  }
};

export function db() { return dbAdapter; }
export { dbAdapter };
