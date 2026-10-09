'use strict';
const DEFAULT_API='https://gpuhunter.onrender.com';
const DEFAULT_ADMIN='70b8622e07ec575a85ed5af40ca0692c';
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
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), timeout);
      const res = await fetch(apiBase() + '/api' + path, {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(t);
      if (!res.ok) {
        let msg = res.status + ' ' + res.statusText;
        try { const e = await res.json(); if (e && e.error) msg = e.error; } catch {}
        const err = new Error(msg);
        err.status = res.status;
        throw err;
      }
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) return await res.json();
      return await res.text();
    } catch (err) {
      lastErr = err;
      if (err.name === 'AbortError') {
        const timeoutErr = new Error('Timeout de la petición');
        timeoutErr.status = 504;
        lastErr = timeoutErr;
      }
      if (attempt === retries) throw lastErr;
    }
  }
  throw lastErr;
}
