import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../config.js';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

let messaging = null;
let initError = '';

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

export async function sendPushToDevices(devices, payload) {
  const allDevices = devices || {};
  const product = payload && payload.product ? payload.product : null;
  const productPrice = Number(payload && payload.price !== undefined ? payload.price : (product?.price || 0));
  const productGpuKey = String(payload?.data?.gpu || product?.gpu || '').trim();
  const productNameNorm = String(product?.name || '').toLowerCase();

  const tokens = Object.entries(allDevices)
    .filter(([token, pref]) => {
      if (!token || typeof token !== 'string') return false;
      const p = pref || {};
      const gpuModels = Array.isArray(p.gpuModels) ? p.gpuModels : [];
      const maxPrice = Number(p.maxPrice || 0);

      // Si el usuario configuró modelos de interés, verificar coincidencia (por key o por substring en el nombre)
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

      // Si el usuario configuró un precio máximo, verificar que el precio actual no lo supere
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
      notification: { title: payload.title, body: payload.body },
      data: payload.data || {},
      android: {
        priority: 'high',
        notification: {
          channelId: 'gpuhunter-alerts',
          sound: 'default',
          clickAction: 'OPEN_URL',
          imageUrl: payload.image || undefined
        }
      },
      webpush: { fcmOptions: { link: payload.url || '/' } }
    });
    let sent = 0;
    let errors = 0;
    const invalid = [];
    res.responses.forEach((r, i) => {
      if (r.success) sent++;
      else {
        errors++;
        const code = r.error?.code || '';
        if (code.includes('registration-token-not-registered') || code.includes('invalid-argument')) {
          invalid.push(tokens[i]);
        }
      }
    });
    for (const t of invalid) unregisterSafe(t);
    return { sent, errors, invalid: invalid.length };
  } catch (e) {
    console.error('[fcm] error send:', e.message);
    return { sent: 0, errors: tokens.length, reason: e.message };
  }
}

export async function sendPushToToken(token, payload) {
  const clean = typeof token === 'string' ? token.trim() : '';
  if (!clean) return { sent: 0, errors: 1, reason: 'token inválido' };
  if (!messaging) {
    console.log('[fcm] no enviado (no configurado):', payload.title);
    return { sent: 0, errors: 1, reason: initError };
  }
  try {
    const message = {
      token: clean,
      notification: { title: payload.title, body: payload.body },
      android: { priority: 'high' }
    };
    if (payload.data) message.data = payload.data;
    const id = await messaging.send(message);
    return { sent: 1, errors: 0, id };
  } catch (e) {
    const code = e.errorInfo?.code || e.message || '';
    console.error('[fcm] error send token:', code);
    if (code.includes('registration-token-not-registered') || code.includes('invalid-argument')) {
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
