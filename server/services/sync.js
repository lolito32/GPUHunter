import { runCycle } from '../scrapers/index.js';
import {
  getSettings,
  getStatus,
  getTargets,
  mergeProducts,
  pruneStale,
  pruneAlerts,
  setStatus,
  flush
} from '../store.js';
import { detectGpu, looksLikeVideoCard } from '../gpu.js';
import { processDrops } from './monitor.js';

let current = null;

export function isSyncing() {
  return Boolean(current);
}

export function runSync(trigger = 'cron') {
  if (current) return current;
  current = execute(trigger).finally(() => {
    current = null;
  });
  return current;
}

async function execute(trigger) {
  const startedAt = Date.now();
  const settings = getSettings();
  const cycle = await runCycle({
    settings,
    maxPages: settings.maxPages || 4,
    trigger
  });

  const results = [...cycle.primary, cycle.fallback].filter(Boolean);
  const products = [];

  for (const result of results) {
    for (const item of result.items) {
      if (!item.price || item.price <= 0 || !item.name) continue;
      if (!looksLikeVideoCard(item.name)) continue;
      const gpu = detectGpu(item.name);
      if (!gpu) continue;
      products.push({
        id: `${item.store}:${item.id}`,
        store: item.store,
        name: item.name.trim(),
        gpu: gpu.key,
        price: item.price,
        url: item.url,
        source: item.source || ''
      });
    }
  }

  const merged = mergeProducts(products, startedAt);
  const removed = pruneStale(startedAt);
  pruneAlerts();

  const targets = getTargets();
  const firstDeals = merged.addedProducts
    .filter((product) => targets[product.gpu] && product.price <= targets[product.gpu])
    .map((product) => ({ product, from: product.price, to: product.price }));
  const candidates = [...merged.drops, ...firstDeals];

  const stores = {};
  for (const result of results) {
    stores[result.key] = {
      ok: Boolean(result.ok),
      items: result.items.length,
      ms: result.ms || 0,
      error: result.error || ''
    };
  }
  for (const key of cycle.skipped) {
    stores[key] = { ok: false, items: 0, ms: 0, error: '', skipped: true };
  }

  const alertResult = await processDrops(candidates).catch((err) => ({ sent: 0, reason: err.message }));

  const lastRun = {
    trigger,
    at: startedAt,
    products: products.length,
    added: merged.added,
    changed: merged.changed,
    removed,
    alerts: alertResult.sent || 0,
    stores
  };
  const previousRuns = (getStatus().runs || []).filter((run) => run && run.at !== startedAt);

  setStatus({
    lastSync: startedAt,
    lastDurationMs: Date.now() - startedAt,
    lastRun,
    runs: [lastRun, ...previousRuns].slice(0, 10)
  });
  flush();

  return { ...lastRun, alertInfo: alertResult, durationMs: Date.now() - startedAt };
}
