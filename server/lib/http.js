import { execFile } from 'node:child_process';
import { USER_AGENT, SCRAP_TIMEOUT_MS } from '../config.js';

export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const STATUS_MARK = '__GPUHUNTER_STATUS__';
const CURL_BIN = process.platform === 'win32' ? 'curl.exe' : 'curl';
const MAX_BUFFER = 24 * 1024 * 1024;

class HttpStatusError extends Error {
  constructor(status, url) {
    super(`HTTP ${status} en ${url}`);
    this.status = status;
    this.url = url;
  }
}

function curlGet(url, { headers = {}, timeout = SCRAP_TIMEOUT_MS }) {
  const args = ['-sS', '-L', '--compressed', '--max-time', String(Math.ceil(timeout / 1000)), '-A', USER_AGENT];
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === 'accept') continue;
    args.push('-H', `${key}: ${value}`);
  }
  args.push('-w', `\n${STATUS_MARK}%{http_code}`, url);

  return new Promise((resolve, reject) => {
    execFile(
      CURL_BIN,
      args,
      { maxBuffer: MAX_BUFFER, timeout: timeout + 5000, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(`curl fallo en ${url}: ${stderr || err.message}`));
        const idx = stdout.lastIndexOf(STATUS_MARK);
        if (idx < 0) return reject(new Error(`curl sin estado en ${url}`));
        const status = Number(stdout.slice(idx + STATUS_MARK.length).trim());
        const body = stdout.slice(0, idx);
        if (status >= 400) return reject(new HttpStatusError(status, url));
        resolve(body);
      }
    );
  });
}

function browserHeaders(headers) {
  return {
    accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
    'accept-language': 'es-AR,es;q=0.9',
    ...headers
  };
}

export async function get(url, { headers = {}, timeout = SCRAP_TIMEOUT_MS, retries = 1, type = 'text' } = {}) {
  const finalHeaders = browserHeaders(headers);
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: { 'user-agent': USER_AGENT, ...finalHeaders }
      });
      if (!res.ok) throw new HttpStatusError(res.status, url);
      const body = type === 'json' ? await res.json() : await res.text();
      return body;
    } catch (err) {
      lastError = err;
      const status = err.status || 0;
      const blocked = [403, 429, 503, 599].includes(status) || err.name === 'AbortError';
      if (blocked) {
        try {
          const body = await curlGet(url, { headers: finalHeaders, timeout });
          return type === 'json' ? JSON.parse(body) : body;
        } catch (curlErr) {
          lastError = curlErr;
        }
      }
      if (attempt < retries && !blocked) await delay(400 + Math.random() * 600);
      else if (attempt < retries) await delay(800 + Math.random() * 800);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

export const getText = (url, options) => get(url, options);
export const getJSON = (url, options) => get(url, { ...options, type: 'json' });
