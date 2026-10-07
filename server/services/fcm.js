import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, STORE_BY_KEY } from '../config.js';
import { unregisterDevice } from '../store.js';
import { labelForKey } from '../gpu.js';
import { formatARS } from '../lib/price.js';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

let messaging = null;
let initError = '';

const MAX_TITLE = 90;
const MAX_BODY = 200;

function cleanText(value, max = 0) {
  const text = String(value === undefined || value === null ? '' : value)
    .replace(/\s+/g, ' ')
    .trim();
  if (!max || text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + '…';
}

function firstText(values, max = 0) {
  for (const value of values) {
    const text = cleanText(value, max);
    if (text) return text;
  }
  return '';
}

function toPositiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function resolveContext(p) {
  const product = p.product && typeof p.product === 'object' ? p.product : null;
  const storeKey = firstText([p.store, p.data?.store, product?.store], 40);
  const store = STORE_BY_KEY[storeKey];
  const price = toPositiveNumber(p.price ?? p.data?.price ?? product?.price);
  const prevPrice = toPositiveNumber(p.prevPrice ?? p.from ?? p.data?.prev ?? p.data?.from);
  const avgPrice = toPositiveNumber(p.avgPrice ?? p.avg ?? p.data?.avg);

  let discountPct = toPositiveNumber(p.discountPct ?? p.data?.discountPct);
  if (!discountPct && prevPrice > price && price > 0) {
    discountPct = Math.round(((prevPrice - price) / prevPrice) * 100);
  }
  if (!discountPct && avgPrice > price && price > 0) {
    discountPct = Math.round(((avgPrice - price) / avgPrice) * 100);
  }

  const gpuKey = firstText([p.gpu, p.data?.gpu, product?.gpu], 40);
  return {
    product,
    storeName: (store && store.name) || storeKey,
    name: firstText([p.name, product?.name], 70),
    gpuLabel: gpuKey ? labelForKey(gpuKey) : '',
    price,
    prevPrice,
    avgPrice,
    discountPct
  };
}

function buildAutoTitle(ctx) {
  const head = ctx.name || (ctx.gpuLabel ? `${ctx.gpuLabel} en oferta` : '');
  const discount = ctx.discountPct > 0 ? ` · -${Math.round(ctx.discountPct)}%` : '';
  return cleanText(head ? `GPUHunter · ${head}${discount}` : 'GPUHunter · Nueva oferta', MAX_TITLE);
}

function buildAutoBody(ctx) {
  const store = ctx.storeName ? `${ctx.storeName}: ` : '';
  if (ctx.price > 0) {
    const amount = formatARS(Math.round(ctx.price));
    const before =
      ctx.prevPrice > ctx.price ? ` (antes ${formatARS(Math.round(ctx.prevPrice))})` : '';
    const avg =
      !before && ctx.avgPrice > ctx.price
        ? ` (media histórica ${formatARS(Math.round(ctx.avgPrice))})`
        : '';
    return cleanText(`${store}${amount}${before}${avg}`, MAX_BODY);
  }
  return cleanText(`Revisá la oferta${ctx.storeName ? ' en ' + ctx.storeName : ''} desde la app.`, MAX_BODY);
}

export function formatPayload(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const ctx = resolveContext(p);

  const title = cleanText(p.title, MAX_TITLE) || buildAutoTitle(ctx);
  const body = cleanText(p.body, MAX_BODY) || buildAutoBody(ctx);
  const imageUrl = firstText([p.imageUrl, p.image, ctx.product?.image], 500);
  const url = firstText([p.url, p.data?.url, p.link, ctx.product?.url], 1000) || '/';

  const data = {};
  if (p.data && typeof p.data === 'object') {
    for (const [key, value] of Object.entries(p.data)) {
      if (value === undefined || value === null) continue;
      data[String(key)] = typeof value === 'string' ? value : String(value);
    }
  }
  data.url = url;
  data.title = title;
  data.body = body;
  if (imageUrl) data.imageUrl = imageUrl;

  return { title, body, imageUrl: imageUrl || undefined, url, data };
}

export function buildMessage(payload) {
  const androidNotification = {
    channelId: 'gpuhunter-alerts',
    sound: 'default',
    clickAction: 'OPEN_URL'
  };
  if (payload.imageUrl) {
    androidNotification.imageUrl = payload.imageUrl;
    androidNotification.style = 'bigPicture';
  }

  return {
    notification: {
      title: payload.title,
      body: payload.body,
      imageUrl: payload.imageUrl || undefined
    },
    data: payload.data,
    android: {
      priority: 'high',
      notification: androidNotification
    },
    webpush: {
      fcmOptions: { link: payload.url || '/' },
      notification: {
        image: payload.imageUrl || undefined
      }
    }
  };
}

function parseCandidate(raw) {
  if (!raw) return null;
  const text = typeof raw === 'string' ? raw.trim() : '';
  const attempts = text ? [text, Buffer.from(text, 'base64').toString('utf8')] : [];
  let firstError = null;
  for (const attempt of attempts) {
    try {
      const parsed = JSON.parse(attempt);
      if (parsed && typeof parsed === 'object') return parsed;
      if (!firstError) firstError = new Error('el JSON no es una cuenta de servicio');
    } catch (e) {
      if (!firstError) firstError = e;
    }
  }
  throw firstError || new Error('credencial vacía');
}

function resolveServiceAccount() {
  const file = path.join(DATA_DIR, 'firebase-service-account.json');
  const sources = [
    ['FIREBASE_SERVICE_ACCOUNT', process.env.FIREBASE_SERVICE_ACCOUNT],
    [file, fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '']
  ];
  for (const [name, raw] of sources) {
    if (!raw) continue;
    try {
      return parseCandidate(raw);
    } catch (e) {
      console.error('[FCM] Error al parsear ' + name + ':', e.message);
    }
  }
  return null;
}

function initFirebase() {
  const serviceAccount = resolveServiceAccount();
  if (!serviceAccount) {
    initError = 'sin credenciales válidas (FIREBASE_SERVICE_ACCOUNT vacío)';
    console.warn('[FCM] No se encontraron credenciales válidas.');
    return null;
  }
  try {
    if (!getApps().length) {
      initializeApp({ credential: cert(serviceAccount) });
      console.log('[FCM] Firebase Admin inicializado exitosamente desde variable de entorno.');
    }
    return getMessaging();
  } catch (e) {
    initError = 'error al inicializar: ' + e.message;
    console.error('[FCM] Error al inicializar firebase-admin:', e.message);
    return null;
  }
}

messaging = initFirebase();

export function isFcmConfigured() {
  return Boolean(
    process.env.FIREBASE_SERVICE_ACCOUNT ||
      fs.existsSync(path.join(DATA_DIR, 'firebase-service-account.json'))
  );
}

export async function sendPushToDevices(devices, rawPayload) {
  const payload = formatPayload(rawPayload);
  const allDevices = devices || {};
  const product = rawPayload && rawPayload.product ? rawPayload.product : null;
  const productPrice = toPositiveNumber(
    (rawPayload && rawPayload.price) || product?.price || payload.data?.price
  );
  const productGpuKey = String(payload.data?.gpu || product?.gpu || '').trim();
  const productNameNorm = String(product?.name || '').toLowerCase();

  const tokens = Object.entries(allDevices)
    .filter(([token, pref]) => {
      if (!token || typeof token !== 'string') return false;
      const p = pref || {};
      const gpuModels = Array.isArray(p.gpuModels) ? p.gpuModels : [];
      const maxPrice = Number(p.maxPrice || 0);

      if (gpuModels.length > 0) {
        const matchesGpu = gpuModels.some((m) => {
          const targetNorm = String(m).toLowerCase().trim();
          if (!targetNorm) return false;
          if (productGpuKey && targetNorm === String(productGpuKey).toLowerCase().trim()) return true;
          if (productNameNorm && productNameNorm.includes(targetNorm)) return true;
          return false;
        });
        if (!matchesGpu) return false;
      }

      if (maxPrice > 0 && productPrice > 0 && productPrice > maxPrice) {
        return false;
      }

      return true;
    })
    .map(([token]) => token);

  if (!tokens.length) return { sent: 0, errors: 0 };
  if (!messaging) {
    console.log('[fcm] no enviado (no configurado):', payload.title);
    return { sent: 0, errors: 1, reason: initError };
  }
  try {
    const res = await messaging.sendEachForMulticast({
      tokens,
      ...buildMessage(payload)
    });
    const stale = new Set();
    let sent = 0;
    let errors = 0;
    res.responses.forEach((r, i) => {
      if (r.success) {
        sent++;
        return;
      }
      errors++;
      if (isStaleTokenError(r.error)) stale.add(tokens[i]);
    });
    const invalid = [...stale];
    let purged = 0;
    for (const t of invalid) if (unregisterSafe(t)) purged++;
    console.log(
      `[fcm] envío multicast: ${sent} enviados, ${errors} con error, ${purged} token(s) caducado(s) depurado(s)`
    );
    return { sent, errors, invalid: invalid.length, purged };
  } catch (e) {
    console.error('[fcm] error send:', e.message);
    return { sent: 0, errors: tokens.length, reason: e.message };
  }
}

export async function sendPushToToken(token, rawPayload) {
  const payload = formatPayload(rawPayload);
  const clean = typeof token === 'string' ? token.trim() : '';
  if (!clean) return { sent: 0, errors: 1, reason: 'token inválido' };
  if (!messaging) {
    console.log('[fcm] no enviado (no configurado):', payload.title);
    return { sent: 0, errors: 1, reason: initError };
  }
  try {
    const id = await messaging.send({
      token: clean,
      ...buildMessage(payload)
    });
    console.log('[fcm] envío directo: 1 enviado, 0 token(s) caducado(s) depurado(s)');
    return { sent: 1, errors: 0, id };
  } catch (e) {
    const errObj = e.errorInfo || e;
    const code = String(errObj.code || e.code || e.message || '');
    console.error('[fcm] error send token:', code);
    const purged = isStaleTokenError(errObj) && unregisterSafe(clean) ? 1 : 0;
    console.log(`[fcm] envío directo: 0 enviados, 1 con error, ${purged} token(s) caducado(s) depurado(s)`);
    return { sent: 0, errors: 1, purged, reason: code };
  }
}

const STALE_TOKEN_CODES = [
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
  'invalid-registration-token',
  'registration-token-not-registered'
];

export function isStaleTokenError(err) {
  const e = err || {};
  const code = String(e.code || '');
  const message = String(e.message || '');
  if (STALE_TOKEN_CODES.some((c) => code.includes(c) || message.includes(c))) return true;
  if (code.includes('invalid-argument')) {
    return /registration[ -]token|device token|token/i.test(message) && !/payload|data|priority|notification/i.test(message);
  }
  return false;
}

function unregisterSafe(token) {
  try {
    const ok = unregisterDevice(token);
    if (ok) console.log(`[fcm] token obsoleto removido de la base de datos: ${String(token).slice(0, 16)}...`);
    return ok;
  } catch (e) {
    console.error('[fcm] no se pudo remover el token:', e.message);
    return false;
  }
}
