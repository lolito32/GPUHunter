import { getTargets, getSettings, getAlert, markAlerted, recordAlert, getDevices } from '../store.js';
import { STORE_BY_KEY } from '../config.js';
import { labelForKey } from '../gpu.js';
import { formatARS } from '../lib/price.js';
import { sendPushToDevices } from './fcm.js';

function buildTitle(product) {
  return `${labelForKey(product.gpu)} bajo el objetivo`;
}

function buildBody(product, from, to, target) {
  const store = STORE_BY_KEY[product.store];
  const storeName = store ? store.name : product.store;
  const before = from > to ? ` · bajó de ${formatARS(from)}` : '';
  return `${storeName}: ${formatARS(to)}${before} (objetivo ${formatARS(target)})`;
}

const MAX_ALERTS_PER_RUN = 6;

export async function processDrops(drops) {
  const settings = getSettings();
  const devices = getDevices();
  const targets = getTargets();
  const now = Date.now();
  const cooldownMs = (settings.alertCooldownMin || 720) * 60 * 1000;
  const notifications = [];

  for (const { product, from, to } of drops) {
    const target = targets[product.gpu];
    if (!target || to > target) continue;
    const alert = getAlert(product.id);
    if (alert) {
      if (settings.notifyOnlyOnNewLow && alert.p && to >= alert.p) continue;
      if (now - alert.t < cooldownMs) continue;
    }
    markAlerted(product.id, to, now);
    notifications.push({
      product,
      from,
      to,
      target,
      payload: {
        title: buildTitle(product),
        body: buildBody(product, from, to, target),
        image: product.image || '',
        url: product.url,
        data: {
          url: product.url,
          gpu: String(product.gpu),
          price: String(to),
          target: String(target),
          store: String(product.store)
        }
      }
    });
  }

  if (notifications.length === 0) return { sent: 0 };
  if (Object.keys(devices).length === 0) return { sent: 0, reason: 'sin-dispositivos-registrados' };

  const queue = notifications.slice(0, MAX_ALERTS_PER_RUN);
  let sent = 0;
  let errors = 0;
  for (const n of queue) {
    const r = await sendPushToDevices(devices, n.payload);
    sent += r.sent;
    errors += r.errors || 0;
  }
  for (let i = 0; i < sent; i++) recordAlert();
  return { sent, errors, skipped: notifications.length - queue.length };
}
