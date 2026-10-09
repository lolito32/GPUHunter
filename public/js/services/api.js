'use strict';
import { $ } from '../utils/dom.js';
import { store } from '../utils/store.js';
import { state } from '../state/state.js';
import { renderStatus } from '../views/render.js';

export const DEFAULT_API = 'https://gpuhunter.onrender.com';
export const DEFAULT_ADMIN = '70b8622e07ec575a85ed5af40ca0692c';

export function apiBase() {
  const saved = store.get('api', '');
  return saved || DEFAULT_API;
}

export function adminToken() {
  return store.get('admin', '') || DEFAULT_ADMIN;
}

export async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = adminToken();
  if (token) headers['x-admin-token'] = token;
  if (options.body) headers['content-type'] = 'application/json';

  const isOfferFetch = path.startsWith('/products') || path.startsWith('/offers');
  const timeout = options.timeout || (isOfferFetch && options.initial ? 30000 : 10000);
  const retries = options.retries !== undefined ? options.retries : (isOfferFetch ? 1 : 0);

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      const statusEl = $('status');
      if (statusEl) statusEl.textContent = 'Despertando servidor...';
      await new Promise((r) => setTimeout(r, 5000));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(apiBase() + '/api' + path, {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal
      });
      clearTimeout(timer);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data.error || 'Error ' + res.status);
        err.status = res.status;
        throw err;
      }

      if (attempt > 0 && isOfferFetch) {
        if (!state.meta) {
          state.meta = {
            gpus: [],
            stores: [],
            targets: {},
            lastSync: data.lastSync || Date.now(),
            total: data.total || 0
          };
        } else if (!state.meta.lastSync) {
          state.meta.lastSync = data.lastSync || Date.now();
        }
        if (data.total !== undefined) state.meta.total = data.total;
        renderStatus();
      }

      return data;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (err.name === 'AbortError') {
        const timeoutErr = new Error('Timeout de la petición');
        timeoutErr.status = 504;
        lastErr = timeoutErr;
      }
      if (attempt === retries) {
        throw lastErr;
      }
    }
  }
  throw lastErr;
}
