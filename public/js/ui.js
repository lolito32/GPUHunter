'use strict';

import { api } from './api.js';

const $ = (id) => document.getElementById(id);
const fmt = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const money = (n) => '$' + fmt.format(n);
const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );

export function isNative() {
  return !!(typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
}

export function toast(text) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.classList.add('on');
  if (toast._t) clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('on'), 2400);
}

export function showPushBanner(note) {
  let el = document.getElementById('push-banner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'push-banner';
    el.className = 'push-banner';
    document.body.appendChild(el);
    el.addEventListener('click', () => {
      const url = (note && (note.data && note.data.url)) || '';
      if (url) window.open(url, '_blank');
      el.classList.remove('on');
    });
  }
  const body = (note && (note.body || (note.data && note.data.body))) || '';
  el.innerHTML =
    '<div class="pb-title">' + esc((note && (note.title || (note.data && note.data.title))) || 'GPUHunter') +
    '</div>' + (body ? '<div class="pb-body">' + esc(body) + '</div>' : '');
  el.classList.add('on');
  if (showPushBanner._t) clearTimeout(showPushBanner._t);
  showPushBanner._t = setTimeout(() => el.classList.remove('on'), 7000);
}

function compareVersions(a, b) {
  if (!a) a = '0.0.0';
  if (!b) b = '0.0.0';
  const pa = String(a).split('.').map((x) => parseInt(x) || 0);
  const pb = String(b).split('.').map((x) => parseInt(x) || 0);
  const max = Math.max(pa.length, pb.length);
  for (let i = 0; i < max; i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da !== db) return da - db;
  }
  return 0;
}

export function showUpdateBanner(version, apkUrl) {
  let el = document.getElementById('update-banner');
  if (el && el.parentNode) {
    el.parentNode.removeChild(el);
    el = null;
  }
  el = document.createElement('div');
  el.id = 'update-banner';
  el.style.position = 'fixed';
  el.style.top = '0';
  el.style.left = '0';
  el.style.right = '0';
  el.style.zIndex = '2147483647';
  el.style.background = '#ff9f0a';
  el.style.color = '#1b1b1f';
  el.style.padding = '12px 16px';
  el.style.boxShadow = '0 4px 10px rgba(0,0,0,0.4)';
  el.style.fontSize = '15px';
  el.style.display = 'flex';
  el.style.flexDirection = 'column';
  el.style.gap = '8px';
  document.body.prepend(el);
  el.innerHTML =
    '<div style="font-weight:bold">Nueva versión disponible (v' + esc(version) + ')</div>' +
    '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">' +
    '<button class="btn" id="update-btn-update" style="background:#fff;color:#1b1b1f;padding:8px 10px">Actualizar / Descargar APK</button>' +
    '<button class="btn" id="update-btn-close" style="background:transparent;border:1px solid rgba(0,0,0,0.4);color:#1b1b1f;padding:8px 10px">Cerrar</button>' +
    '</div>';
  const btnUpdate = document.getElementById('update-btn-update');
  const btnClose = document.getElementById('update-btn-close');
  if (btnUpdate) {
    btnUpdate.addEventListener('click', () => {
      window.open(apkUrl, '_blank', 'noopener');
    });
  }
  if (btnClose) {
    btnClose.addEventListener('click', () => {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
  }
}

export async function checkAppUpdate(stateRef) {
  try {
    const v = await api('/app/version');
    const latest = v && v.latestVersion;
    const apkUrl = v && v.apkUrl;
    let local = localStorage.getItem('gh_app_version');
    if (local === null) {
      local = '1.0.0';
      try { localStorage.setItem('gh_app_version', JSON.stringify(local)); } catch {}
    } else {
      try { local = JSON.parse(local); } catch { local = '1.0.0'; }
    }
    console.log('[UpdateCheck]', { local, latest, apkUrl, native: isNative() });
    if (!latest || !apkUrl) return;
    if (compareVersions(latest, local) > 0) {
      if (stateRef) stateRef.updateBannerShown = false;
      showUpdateBanner(latest, apkUrl);
    }
  } catch (err) {
    console.log('[UpdateCheck]', 'error', err && err.message);
  }
}
