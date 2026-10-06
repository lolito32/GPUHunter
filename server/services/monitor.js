import { getTargets, getSettings, getAlert, markAlerted, recordAlert } from '../store.js';
import { STORE_BY_KEY } from '../config.js';
import { labelForKey } from '../gpu.js';
import { formatARS } from '../lib/price.js';
import { escapeHtml, sendQueue } from './telegram.js';

function buildMessage(product, from, to, target) {
  const store = STORE_BY_KEY[product.store];
  const storeName = store ? store.name : product.store;
  const source = product.source ? ` · vía ${escapeHtml(product.source)}` : '';
  const before = from > to ? ` (bajó de ${formatARS(from)})` : '';
  return [
    `🔻 <b>${escapeHtml(labelForKey(product.gpu))}</b> bajo objetivo${source}`,
    `Tienda: <b>${escapeHtml(storeName)}</b>`,
    `Precio: <b>${formatARS(to)}</b>${before}`,
    `Objetivo: ${formatARS(target)}`,
    `<a href="${escapeHtml(product.url)}">Ver oferta</a>`
  ].join('\n');
}

const MAX_ALERTS_PER_RUN = 6;

export async function processDrops(drops) {
  const settings = getSettings();
  const tg = settings.telegram || {};
  if (!tg.enabled || !tg.token || !tg.chatId) {
    return { sent: 0, reason: 'telegram-sin-configurar' };
  }
  const targets = getTargets();
  const now = Date.now();
  const cooldownMs = (settings.alertCooldownMin || 720) * 60 * 1000;
  const messages = [];

  for (const { product, from, to } of drops) {
    const target = targets[product.gpu];
    if (!target || to > target) continue;
    const alert = getAlert(product.id);
    if (alert) {
      if (settings.notifyOnlyOnNewLow && alert.p && to >= alert.p) continue;
      if (now - alert.t < cooldownMs) continue;
    }
    markAlerted(product.id, to, now);
    messages.push(buildMessage(product, from, to, target));
  }

  if (messages.length === 0) return { sent: 0 };

  const queue = messages.slice(0, MAX_ALERTS_PER_RUN);
  const result = await sendQueue(tg.token, tg.chatId, queue);
  for (let i = 0; i < result.sent; i++) recordAlert();
  return { sent: result.sent, errors: result.errors, skipped: messages.length - queue.length };
}
