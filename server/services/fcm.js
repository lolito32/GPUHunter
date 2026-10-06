import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../config.js';

let admin = null;
let initError = '';

function tryInit() {
  if (admin || initError) return admin;
  const raw =
    process.env.FIREBASE_SERVICE_ACCOUNT ||
    (fs.existsSync(path.join(DATA_DIR, 'firebase-service-account.json'))
      ? fs.readFileSync(path.join(DATA_DIR, 'firebase-service-account.json'), 'utf8')
      : '');
  if (!raw) {
    initError = 'sin credenciales (FIREBASE_SERVICE_ACCOUNT vacío)';
    console.warn('[fcm] no configurado:', initError);
    return null;
  }
  return import('firebase-admin')
    .then(({ default: fb }) => {
      let cred;
      try {
        cred = fb.credential.cert(JSON.parse(raw));
      } catch {
        try {
          cred = fb.credential.cert(JSON.parse(Buffer.from(raw, 'base64').toString('utf8')));
        } catch (e2) {
          initError = 'credenciales inválidas: ' + e2.message;
          console.error('[fcm]', initError);
          return null;
        }
      }
      fb.initializeApp({ credential: cred });
      admin = fb;
      console.log('[fcm] firebase-admin inicializado');
      return admin;
    })
    .catch((e) => {
      initError = e.message;
      console.error('[fcm] error al inicializar:', e.message);
      return null;
    });
}

export function isFcmConfigured() {
  return Boolean(
    process.env.FIREBASE_SERVICE_ACCOUNT ||
      fs.existsSync(path.join(DATA_DIR, 'firebase-service-account.json'))
  );
}

export async function sendPushToDevices(devices, payload) {
  const tokens = Object.keys(devices || {});
  if (!tokens.length) return { sent: 0, errors: 0 };
  const app = await tryInit();
  if (!app) {
    console.log('[fcm] no enviado (no configurado):', payload.title);
    return { sent: 0, errors: 1, reason: initError };
  }
  try {
    const res = await app.messaging().sendEachForMulticast({
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

function unregisterSafe(token) {
  import('../store.js')
    .then((m) => m.unregisterDevice(token))
    .catch(() => {});
}
