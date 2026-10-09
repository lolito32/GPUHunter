import * as cheerio from 'cheerio';
import { getText, delay } from '../lib/http.js';
import { detectGpu, labelForKey } from '../gpu.js';
import { getAllProducts, getHistory, seedHistory, flush } from '../store.js';

const SEARCH = 'https://www.hardgamers.com.ar/search?category=placas-de-video';
const ORIGIN = 'https://www.hardgamers.com.ar';
const CHART_RE = /var\s+chartConfig\s*=\s*(\{[\s\S]*?\});/;

const pad = (n) => String(n).padStart(2, '0');
const toISO = (date) => date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());

function toSeries(labels, prices, now = new Date()) {
  const n = Math.min(Array.isArray(labels) ? labels.length : 0, Array.isArray(prices) ? prices.length : 0);
  const items = [];
  for (let i = 0; i < n; i++) {
    const [dayStr, monthStr] = String(labels[i]).split('-');
    const price = Number(prices[i]);
    const day = Number(dayStr);
    const month = Number(monthStr);
    if (!Number.isFinite(price) || price <= 0 || !day || !month) continue;
    items.push({ day, month, price });
  }
  if (!items.length) return [];

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dated = new Array(items.length);
  let year = now.getFullYear();
  let lastDate = null;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    let date = new Date(year, it.month - 1, it.day);
    let guard = 0;
    if (lastDate) {
      while (date >= lastDate && guard++ < 6) {
        year--;
        date = new Date(year, it.month - 1, it.day);
      }
    } else {
      while (date > today && guard++ < 6) {
        year--;
        date = new Date(year, it.month - 1, it.day);
      }
    }
    dated[i] = { d: toISO(date), p: Math.round(it.price) };
    lastDate = date;
  }
  return dated;
}

function parseChart(html) {
  const match = String(html || '').match(CHART_RE);
  if (!match) return [];
  try {
    const config = JSON.parse(match[1]);
    const labels = (config.data && config.data.labels) || [];
    const dataset = config.data && config.data.datasets && config.data.datasets[0];
    const prices = (dataset && dataset.data) || [];
    return toSeries(labels, prices);
  } catch {
    return [];
  }
}

function urlsFromDb(wanted) {
  const map = new Map();
  for (const product of Object.values(getAllProducts())) {
    if (!product || product.store !== 'hardgamers' || !product.gpu || !product.url) continue;
    if (wanted.has(product.gpu) && !map.has(product.gpu)) map.set(product.gpu, product.url);
  }
  return map;
}

async function findProductUrl(gpu) {
  const text = labelForKey(gpu);
  if (!text) return null;
  const url = SEARCH + '&text=' + encodeURIComponent(text);
  try {
    const html = await getText(url, { headers: { referer: ORIGIN + '/' } });
    const $ = cheerio.load(html);
    let found = null;
    $('article.One-Bit-Product').each((_, el) => {
      if (found) return;
      const card = $(el);
      const name = card.find('.product-name').first().text().trim();
      const href = card.find('a[href*="/product/"]').first().attr('href') || '';
      if (!name || !href) return;
      const gpuMatch = detectGpu(name);
      if (gpuMatch && gpuMatch.key === gpu) {
        found = href.startsWith('http') ? href : ORIGIN + href;
      }
    });
    return found;
  } catch {
    return null;
  }
}

async function pooled(jobs, concurrency) {
  const results = [];
  let cursor = 0;
  const size = Math.max(1, Math.min(concurrency, jobs.length || 1));
  const workers = Array.from({ length: size }, async () => {
    while (cursor < jobs.length) {
      const index = cursor++;
      results[index] = await jobs[index]();
    }
  });
  await Promise.all(workers);
  return results;
}

export async function backfillHistory({ maxModels = 30, concurrency = 1 } = {}) {
  const products = Object.values(getAllProducts());
  const frequency = new Map();
  for (const product of products) {
    if (product && product.gpu) frequency.set(product.gpu, (frequency.get(product.gpu) || 0) + 1);
  }
  const wanted = new Set(
    [...frequency.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxModels)
      .map(([gpu]) => gpu)
  );
  if (!wanted.size) return { entries: {}, models: 0, points: 0, reason: 'sin productos' };

  const urls = urlsFromDb(wanted);
  const missing = [...wanted].filter((gpu) => !urls.has(gpu));
  const searched = await pooled(
    missing.map((gpu) => async () => {
      const url = await findProductUrl(gpu);
      await delay(1500 + Math.random() * 600);
      return { gpu, url };
    }),
    concurrency
  );
  for (const { gpu, url } of searched) {
    if (url) urls.set(gpu, url);
  }

  const targets = [...urls.entries()];
  const jobs = targets.map(([gpu, url]) => async () => {
    try {
      const html = await getText(url, { headers: { referer: SEARCH } });
      const series = parseChart(html);
      await delay(1500 + Math.random() * 600);
      return { gpu, series };
    } catch {
      return { gpu, series: [] };
    }
  });

  const results = await pooled(jobs, concurrency);
  const entries = {};
  let points = 0;
  for (const { gpu, series } of results) {
    if (series && series.length) {
      entries[gpu] = series;
      points += series.length;
    }
  }
  return { entries, models: Object.keys(entries).length, points };
}

let attempted = false;
let running = null;

export function maybeBackfill() {
  if (attempted) return running;
  attempted = true;
  const current = getHistory();
  const hasTrend = Object.values(current).some((arr) => Array.isArray(arr) && arr.length >= 2);
  if (hasTrend) return null;

  running = backfillHistory({})
    .then(({ entries, models, points }) => {
      if (models) {
        seedHistory(entries);
        flush();
      }
      console.log(`[backfill] historial desde HardGamers: ${models} modelos, ${points} puntos`);
      return { models, points };
    })
    .catch((err) => {
      console.error('[backfill] error:', err.message);
      return { models: 0, points: 0 };
    });
  return running;
}
