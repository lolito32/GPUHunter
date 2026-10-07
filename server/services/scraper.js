import { getAllProducts, getSettings, getDevices } from '../store.js';
import { sendPushToDevices } from './fcm.js';
import { STORE_BY_KEY } from '../config.js';
import { labelForKey } from '../gpu.js';
import { formatARS } from '../lib/price.js';
import { db, initDb } from '../db.js';

function buildRealDealTitle(product) {
  return `¡Oferta real en ${labelForKey(product.gpu)}!`;
}

function buildRealDealBody(product, currentPrice, avgPrice, discountPct) {
  const store = STORE_BY_KEY[product.store];
  const storeName = store ? store.name : product.store;
  return `${storeName}: ${formatARS(currentPrice)} (media histórica ${formatARS(avgPrice)}, -${discountPct}%)`;
}

export async function evaluateRealDeals() {
  const products = getAllProducts();
  const devices = getDevices();
  if (!products || Object.keys(products).length === 0) return { evaluated: 0, deals: 0, sent: 0 };
  if (!devices || Object.keys(devices).length === 0) return { evaluated: 0, deals: 0, sent: 0, reason: 'sin-dispositivos' };

  let evaluated = 0;
  let dealsCount = 0;
  const realDeals = [];

  try {
    await initDb().catch(() => {});
  } catch (e) {
    // ignore db init errors
  }

  for (const product of Object.values(products)) {
    evaluated++;
    const history = product.history || [];
    if (history.length < 3) continue; // necesitamos suficiente historial para un promedio confiable

    const prices = history.map((h) => h.p).filter((p) => typeof p === 'number' && p > 0);
    if (prices.length < 3) continue;

    const sum = prices.reduce((acc, p) => acc + p, 0);
    const avgPrice = sum / prices.length;
    const currentPrice = product.price;

    if (!currentPrice || currentPrice >= avgPrice) continue;

    const diff = avgPrice - currentPrice;
    const discountPct = Math.round((diff / avgPrice) * 100);

    if (discountPct >= 10) {
      dealsCount++;
      realDeals.push({
        product,
        currentPrice,
        avgPrice: Math.round(avgPrice),
        discountPct,
        payload: {
          title: buildRealDealTitle(product),
          body: buildRealDealBody(product, currentPrice, Math.round(avgPrice), discountPct),
          image: product.image || '',
          url: product.url,
          data: {
            url: product.url,
            gpu: String(product.gpu),
            price: String(currentPrice),
            avg: String(Math.round(avgPrice)),
            store: String(product.store)
          }
        }
      });
    }
  }

  for (const product of Object.values(products)) {
    try {
      const now = Date.now();
      const pid = product.id || String(product.url || (product.store + '_' + product.gpu + '_' + product.name)).substring(0, 200);
      await db('products')
        .insert({
          id: pid,
          model_name: product.name,
          store: product.store,
          product_url: product.url,
          image_url: product.image || '',
          created_at: new Date(now),
          updated_at: new Date(now)
        })
        .onConflict('id')
        .merge({
          model_name: product.name,
          store: product.store,
          product_url: product.url,
          image_url: product.image || '',
          updated_at: new Date(now)
        });

      const lastPriceRow = await db('price_history')
        .select('price')
        .where('product_id', pid)
        .orderBy('recorded_at', 'desc')
        .orderBy('id', 'desc')
        .first();

      const lastPrice = lastPriceRow ? Number(lastPriceRow.price) : null;
      if (lastPrice === null || lastPrice !== Number(product.price)) {
        await db('price_history').insert({
          product_id: pid,
          price: product.price,
          recorded_at: new Date(now)
        });
      }
    } catch (e) {
      // ignore db errors
    }
  }

  let sent = 0;
  let errors = 0;
  for (const deal of realDeals) {
    const r = await sendPushToDevices(devices, deal.payload);
    sent += r.sent;
    errors += r.errors || 0;
  }

  return { evaluated, deals: dealsCount, sent, errors };
}
