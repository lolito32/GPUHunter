import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../config.js';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

let messaging = null;
let initError = '';

function formatPayload(payload) {
  const p = payload || {};
  const title = String(p.title || 'GPUHunter · Nueva oferta').trim();
  const body = String(p.body || '').trim();
  const imageUrl = String(p.imageUrl || p.image || '').trim();
  const url = String(p.url || p?.data?.url || '/').trim();

  const data = {
    url,
    ...(p.data && typeof p.data === 'object' ? p.data : {})
  };
  if (url && !data.url) data.url = url;

  return {
    title,
    body,
    imageUrl: imageUrl || undefined,
    url,
    data
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
  const productPrice = Number(rawPayload && rawPayload.price !== undefined ? rawPayload.price : (product?.price || 0));
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
    const androidNotification = {
      channelId: 'gpuhunter-alerts',
      sound: 'default',
      clickAction: 'OPEN_URL'
    };
    if (payload.imageUrl) {
      androidNotification.imageUrl = payload.imageUrl;
    }

    const res = await messaging.sendEachForMulticast({
      tokens,
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
    });
    let sent = 0;
    let errors = 0;
    const invalid = [];
    res.responses.forEach((r, i) => {
      if (r.success) sent++;
      else {
        errors++;
        const errObj = r.error || {};
        const code = String(errObj.code || errObj.message || '');
        if (
          code.includes('messaging/invalid-registration-token') ||
          code.includes('messaging/registration-token-not-registered') ||
          code.includes('registration-token-not-registered') ||
          code.includes('invalid-argument')
        ) {
          invalid.push(tokens[i]);
        }
      }
    });
    for (const t of invalid) unregisterSafe(t);
    if (invalid.length > 0) {
      console.log(`[fcm] depurados ${invalid.length} tokens FCM caducados u obsoleto(s)`);
    }
    return { sent, errors, invalid: invalid.length };
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
    const androidNotification = {
      channelId: 'gpuhunter-alerts',
      sound: 'default',
      clickAction: 'OPEN_URL'
    };
    if (payload.imageUrl) {
      androidNotification.imageUrl = payload.imageUrl;
    }

    const message = {
      token: clean,
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
    const id = await messaging.send(message);
    return { sent: 1, errors: 0, id };
  } catch (e) {
    const errObj = e.errorInfo || e;
    const code = String(errObj.code || e.message || '');
    console.error('[fcm] error send token:', code);
    if (
      code.includes('messaging/invalid-registration-token') ||
      code.includes('messaging/registration-token-not-registered') ||
      code.includes('registration-token-not-registered') ||
      code.includes('invalid-argument')
    ) {
      console.log(`[fcm] depurado 1 token FCM caducado u obsoleto`);
      unregisterSafe(clean);
    }
    return { sent: 0, errors: 1, reason: code };
  }
}

function unregisterSafe(token) {
  import('../store.js')
    .then((m) => m.unregisterDevice(token))
    .catch(() => {});
}
