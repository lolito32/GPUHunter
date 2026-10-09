import compragamer from './compragamer.js';
import mexx from './mexx.js';
import venex from './venex.js';
import gezatek from './gezatek.js';
import fullhard from './fullhard.js';
import malditohard from './malditohard.js';
import tech710 from './710tech.js';
import maximus from './maximus.js';
import pchardware from './pchardware.js';
import computienda from './computienda.js';
import tecnobytes from './tecnobytes.js';
import hardgamers from './hardgamers.js';
import { SCRAP_TIMEOUT_MS } from '../config.js';
import { delay } from '../lib/http.js';

export const SCRAPERS = [
  compragamer,
  mexx,
  venex,
  gezatek,
  fullhard,
  malditohard,
  tech710,
  maximus,
  pchardware,
  computienda,
  tecnobytes
];

const withTimeout = (promise, ms, label) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout ${ms}ms en ${label}`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });

async function runOne(scraper, ctx) {
  const started = Date.now();
  try {
    const items = await withTimeout(Promise.resolve(scraper.fetch(ctx)), ctx.timeoutMs || SCRAP_TIMEOUT_MS, scraper.key);
    return { key: scraper.key, ok: true, items, ms: Date.now() - started };
  } catch (err) {
    return { key: scraper.key, ok: false, items: [], ms: Date.now() - started, error: err.message };
  }
}

async function pooled(jobs, concurrency) {
  const results = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
    while (cursor < jobs.length) {
      const index = cursor++;
      results[index] = await jobs[index]();
    }
  });
  await Promise.all(workers);
  return results;
}

export async function runCycle(ctx) {
  const jobs = [];
  const skipped = [];
  for (const scraper of SCRAPERS) {
    if (ctx.settings.stores && ctx.settings.stores[scraper.key] === false) {
      skipped.push(scraper.key);
      continue;
    }
    jobs.push(() => runOne(scraper, ctx));
  }
  const primaryResults = await pooled(jobs, 3);

  const covered = primaryResults.filter((r) => r.ok && r.items.length > 0).map((r) => r.key);
  let fallback = null;
  if (ctx.settings.stores && ctx.settings.stores.hardgamers !== false) {
    fallback = await runOne(hardgamers, { ...ctx, covered, maxPages: Math.min(ctx.maxPages || 4, 4) });
    await delay(150);
  }

  return { primary: primaryResults, skipped, fallback, covered };
}
