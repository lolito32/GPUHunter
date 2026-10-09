'use strict';
import { $ } from '../utils/dom.js';
import { esc, money, timeAgo } from '../utils/format.js';
import { formatCostPerFps } from '../utils/fps.js';
import { store } from '../utils/store.js';
import { state } from '../state/state.js';
import { api, apiBase, adminToken, DEFAULT_ADMIN } from '../services/api.js';
import { sparkline, mountCharts } from '../components/chart.js';
import { getPush } from '../services/push.js';
import { isNative } from '../services/update.js';

let pollTimer = null;

export function renderStatus() {
  const m = state.meta || {
    lastSync: store.get('cached_last_sync', 0),
    total: store.get('cached_total', state.items.length || 0),
    underTarget: 0
  };
  const el = $('status');
  if (!el) return;
  const timeStr = timeAgo(m.lastSync);
  const totalOffers = m.total !== undefined ? m.total : (state.total || state.items.length);
  if (state.offline) {
    el.textContent = 'Offline - Datos guardados (' + timeStr + ') · ' + totalOffers + ' ofertas';
    el.title = 'Modo offline - Última sincronización ' + timeStr;
  } else {
    el.textContent =
      'Actualizado ' + timeStr + ' · ' + totalOffers + ' ofertas' + (m.underTarget ? ' · ' + m.underTarget + ' bajo objetivo' : '');
    el.title = m.syncing ? 'Sincronizando…' : 'Última sincronización ' + timeStr;
  }
}

export function renderChips() {
  const m = state.meta;
  if (!m) return;

  const statusHtml = [
    '<button class="chip' + (state.deal ? ' on' : '') + '" data-deal="1">Bajo objetivo <span class="n">' + (m.underTarget || 0) + '</span></button>',
    '<button class="chip' + (state.used ? ' on' : '') + '" data-used="1">Usadas <span class="n">' + (m.usedCount || 0) + '</span></button>'
  ];
  $('chips-status').innerHTML = statusHtml.join('');

  const gpus = m.gpus;
  const gpuHtml = ['<button class="chip' + (state.gpu === '' ? ' on' : '') + '" data-gpu="">Todas <span class="n">' + m.total + '</span></button>'];
  for (const g of gpus) {
    gpuHtml.push(
      '<button class="chip' + (state.gpu === g.k ? ' on' : '') + (g.n ? '' : ' zero') + '" data-gpu="' + esc(g.k) + '">' + esc(g.l) +
        ' <span class="n">' + g.n + '</span></button>'
    );
  }
  $('chips-gpu').innerHTML = gpuHtml.join('');

  const stores = m.stores.filter((s) => s.on !== false && s.count > 0);
  const storeHtml = ['<button class="chip' + (state.storeKey === '' ? ' on' : '') + '" data-store="">Todas las tiendas</button>'];
  for (const s of stores) {
    storeHtml.push(
      '<button class="chip' + (state.storeKey === s.k ? ' on' : '') + '" data-store="' + esc(s.k) + '">' +
        esc(s.n) + ' <span class="n">' + s.count + '</span></button>'
    );
  }
  $('chips-store').innerHTML = storeHtml.join('');

  if ($('price-min')) $('price-min').value = state.minPrice || '';
  if ($('price-max')) $('price-max').value = state.maxPrice || '';
  renderFiltersCount();
}

export function renderFiltersCount() {
  const el = $('filters-count');
  if (!el) return;
  let n = 0;
  if (state.deal) n++;
  if (state.used) n++;
  if (state.gpu) n++;
  if (state.storeKey) n++;
  if (state.minPrice) n++;
  if (state.maxPrice) n++;
  el.textContent = String(n);
  el.classList.toggle('on', n > 0);
}

export function cardHtml(item) {
  const target = state.meta && state.meta.targets ? state.meta.targets[item.gp] : 0;
  const deal = item.tg === 1 || (target && item.pr <= target);
  let delta = '';
  if (item.dl) {
    const down = item.dl < 0;
    delta =
      '<span class="delta ' + (down ? 'down' : 'up') + '">' +
      (down ? '-' : '+') +
      money(Math.abs(item.dl)) +
      '</span>';
  }
  const source = item.sc ? '<span class="via">via ' + esc(item.sc) + '</span>' : '';
  const usedTag = item.us ? '<span class="used-tag">USADA</span>' : '';
  const tag = deal ? '<span class="deal-tag">bajo objetivo</span>' : '';
  const valueBadge = formatCostPerFps(item.gp, item.pr) ? '<span class="value-badge" title="Costo por FPS ($/FPS)">' + esc(formatCostPerFps(item.gp, item.pr)) + '</span>' : '';
  const thumb = item.im
    ? '<img class="thumb" src="' +
      esc(item.im) +
      '" alt="" width="62" height="62" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">'
    : '';
  const hist = state.history && state.history[item.id];
  let trend = '';
  if (hist && hist.length) {
    const body =
      hist.length > 1
        ? sparkline(hist, { key: item.id })
        : '<p class="spark-empty">Todavía no hay precios anteriores para esta oferta. GPUHunter acaba de empezar a registrar su historial; el gráfico se irá completando con las próximas variaciones de precio.</p>';
    const count = hist.length === 1 ? '1 registro' : hist.length + ' registros';
    trend =
      '<details class="spark">' +
      '<summary class="spark-btn">' +
      '<svg class="spark-ico" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M4 16l4-5 3 3 5-7 4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 20h16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>' +
      '<span class="spark-btn-text">Ver historial de precios</span>' +
      '<span class="spark-count">' + esc(count) + '</span>' +
      '</summary>' +
      '<div class="spark-body">' + body + '</div>' +
      '</details>';
  }
  return (
    '<article class="row-item"><div class="row-main">' +
    thumb +
    '<div class="row-col">' +
    '<div class="row-top"><span class="store-pill">' + esc(storeName(item.st)) + '</span>' +
    usedTag + source + tag + valueBadge + '</div>' +
    '<h3 class="name">' + esc(item.nm) + '</h3>' +
    '<div class="row-bottom"><div class="price-wrap"><span class="price">' + money(item.pr) +
    '</span>' + delta + '</div>' +
    '<a class="go" href="' + esc(item.ur) + '" target="_blank" rel="noopener noreferrer">Ver</a>' +
    '</div>' +
    trend +
    '</div></div></article>'
  );
}

export function storeName(key) {
  const found = state.meta && state.meta.stores.find((s) => s.k === key);
  return found ? found.n : key;
}

export function renderList(append) {
  const list = $('list');
  if (!append) list.innerHTML = '';
  if (state.items.length === 0) {
    list.innerHTML =
      '<div class="empty">Sin resultados con estos filtros.<br>Probá quitar filtros o sincronizar de nuevo.</div>';
  } else {
    const frag = document.createDocumentFragment();
    const wrapper = document.createElement('div');
    wrapper.innerHTML = state.items.map(cardHtml).join('');
    while (wrapper.firstChild) frag.appendChild(wrapper.firstChild);
    if (append) list.appendChild(frag);
    else list.replaceChildren(frag);
    mountCharts(list);
  }
  $('list-meta').textContent = state.total
    ? state.items.length + ' de ' + state.total + ' ofertas' + (state.meta ? ' · ' + (state.offline ? 'Offline (' + timeAgo(state.meta.lastSync) + ')' : 'Actualizado ' + timeAgo(state.meta.lastSync)) : '')
    : '';
  $('btn-more').classList.toggle('hidden', state.page >= state.pages);
}

export function query(extra) {
  const p = new URLSearchParams();
  p.set('limit', '60');
  p.set('sort', state.sort);
  if (state.gpu) p.set('gpu', state.gpu);
  if (state.storeKey) p.set('store', state.storeKey);
  if (state.deal) p.set('deal', '1');
  if (state.used) p.set('used', '1');
  if (state.q) p.set('q', state.q);
  if (state.minPrice) p.set('min', String(state.minPrice));
  if (state.maxPrice) p.set('max', String(state.maxPrice));
  if (extra && extra.page) p.set('page', String(extra.page));
  return p.toString();
}

export async function load(page) {
  if (state.loading) return;
  state.loading = true;
  if (page === 1) {
    $('list').innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
    $('btn-more').classList.add('hidden');
  }
  try {
    const data = await api('/products?' + query({ page }), { initial: page === 1 });
    for (const item of data.items) {
      if (item.hs) state.history[item.id] = item.hs;
    }
    state.page = data.page;
    state.pages = data.pages;
    state.total = data.total;
    state.items = page === 1 ? data.items : state.items.concat(data.items);
    if (page === 1) {
      store.set('cached_items', data.items);
      store.set('cached_total', data.total);
      store.set('cached_pages', data.pages);
      if (data.total !== undefined) store.set('cached_total', data.total);
    }
    state.offline = false;
    renderList(page !== 1);
  } catch (err) {
    const cachedItems = store.get('cached_items', null);
    if (page === 1 && cachedItems && cachedItems.length > 0) {
      state.items = cachedItems;
      state.total = store.get('cached_total', cachedItems.length);
      state.pages = store.get('cached_pages', 1);
      state.page = 1;
      state.offline = true;
      if (!state.meta) {
        state.meta = {
          lastSync: store.get('cached_last_sync', 0),
          total: state.total,
          gpus: [],
          stores: []
        };
      }
      renderList(false);
      renderStatus();
    } else {
      $('list').innerHTML = '<div class="empty">No se pudo cargar: ' + esc(err.message) + '<br>Modo offline sin datos cacheados.</div>';
    }
  } finally {
    state.loading = false;
  }
}

export async function loadMeta() {
  try {
    state.meta = await api('/meta');
    state.metaAt = Date.now();
    state.offline = false;
    if (!state.meta.fresh) store.set('targets', state.meta.targets || {});
    else maybeRestoreTargets(state.meta);
    store.set('cached_meta', state.meta);
    if (state.meta.lastSync) store.set('cached_last_sync', state.meta.lastSync);
    if (state.meta.total !== undefined) store.set('cached_total', state.meta.total);
    renderStatus();
    renderChips();
  } catch (err) {
    const cachedMeta = store.get('cached_meta', null);
    if (cachedMeta) {
      state.meta = cachedMeta;
      state.offline = true;
      renderStatus();
      renderChips();
    } else {
      state.offline = true;
      state.meta = {
        lastSync: store.get('cached_last_sync', 0),
        total: store.get('cached_total', 0),
        gpus: [],
        stores: []
      };
      renderStatus();
    }
  }
}

function sameTargets(a, b) {
  const keys = Object.keys(a || {});
  if (!keys.length) return true;
  for (const k of keys) {
    if (Number(a[k]) !== Number((b || {})[k])) return false;
  }
  return true;
}

export async function maybeRestoreTargets(m) {
  if (state.restoreTried) return;
  state.restoreTried = true;
  const backup = store.get('targets', null);
  if (!backup || typeof backup !== 'object' || sameTargets(backup, m.targets)) return;
  try {
    const data = await api('/targets', { method: 'PUT', body: { targets: backup } });
    state.meta.targets = data.targets;
    store.set('targets', data.targets);
    renderStatus();
    renderTargets();
  } catch {
    // 401 (token) u otro error: se reintenta en la próxima apertura de la app
  }
}

export function renderTargets() {
  const m = state.meta;
  if (!m) return;
  const keys = new Set(Object.keys(m.targets || {}));
  for (const g of m.gpus) keys.add(g.k);
  const list = [...keys].sort();
  const rows = list.map((key) => {
    const found = m.gpus.find((g) => g.k === key);
    const label = found ? found.l : key.toUpperCase();
    const count = found ? found.n : 0;
    const value = m.targets && m.targets[key] != null ? m.targets[key] : '';
    return (
      '<div class="target-row"><div class="label">' + esc(label) +
      '<small>' + (count ? count + ' ofertas activas' : 'sin stock ahora') + '</small></div>' +
      '<input type="number" inputmode="numeric" min="0" step="1000" data-target="' + esc(key) + '" value="' + esc(value) + '" placeholder="sin límite"></div>'
    );
  });
  $('targets-list').innerHTML = rows.join('');
}

export async function saveTargets() {
  const btn = $('btn-save-targets');
  const msg = $('targets-msg');
  const targets = {};
  document.querySelectorAll('[data-target]').forEach((input) => {
    const value = Number(input.value);
    if (Number.isFinite(value) && value >= 0) targets[input.dataset.target] = value;
  });
  btn.disabled = true;
  msg.className = 'msg';
  msg.textContent = 'Guardando…';
  try {
    const data = await api('/targets', { method: 'PUT', body: { targets } });
    state.meta.targets = data.targets;
    store.set('targets', data.targets);
    msg.className = 'msg ok';
    msg.textContent = 'Objetivos guardados.';
  } catch (err) {
    msg.className = 'msg err';
    msg.textContent = err.status === 401 ? 'Token de admin requerido (mirá Ajustes).' : err.message;
  } finally {
    btn.disabled = false;
  }
}

export async function loadConfig() {
  try {
    const s = await api('/settings');
    $('api-url').value = apiBase();
    $('admin-token').value = adminToken();
    $('admin-token-field').classList.toggle('hidden', !s.adminTokenRequired);
    $('fcm-token').value = store.get('push_token', '') || '';
    $('interval').value = s.intervalMin;
    $('maxpages').value = s.maxPages;
    renderStoresFromSettings(s.stores, store.get('stores', null));
  } catch (err) {
    $('config-msg').className = 'msg err';
    $('config-msg').textContent = err.message;
  }
}

export function renderStoresFromSettings(settingsStores, saved) {
  const src = settingsStores || {};
  const base = (state.meta && state.meta.stores ? state.meta.stores : []).map((s, i) => ({ ...s, order: i }));
  const enabled = saved || {};
  $('stores-list').innerHTML = base
    .sort((a, b) => a.order - b.order)
    .map(
      (s) =>
        '<label class="store-line"><span>' + esc(s.n) + (s.count ? '<small>' + s.count + ' ofertas</small>' : '') +
        '</span><input type="checkbox" data-store-key="' + esc(s.k) + '"' +
        (enabled[s.k] !== undefined ? (enabled[s.k] ? ' checked' : '') : src[s.k] !== false ? ' checked' : '') +
        '></label>'
    )
    .join('');
}

export async function saveConfig() {
  const btn = $('btn-save-config');
  const msg = $('config-msg');
  const stores = {};
  document.querySelectorAll('[data-store-key]').forEach((box) => {
    stores[box.dataset.storeKey] = box.checked;
  });
  const admin = $('admin-token').value.trim();
  store.set('admin', admin || DEFAULT_ADMIN);
  const apiUrl = $('api-url').value.trim().replace(/\/+$/, '');
  store.set('api', apiUrl);
  const body = {
    stores,
    intervalMin: Number($('interval').value),
    maxPages: Number($('maxpages').value)
  };
  btn.disabled = true;
  msg.className = 'msg';
  msg.textContent = 'Guardando…';
  try {
    const data = await api('/settings', { method: 'PUT', body });
    store.set('stores', data.stores);
    msg.className = 'msg ok';
    msg.textContent = 'Ajustes guardados.';
    await loadMeta();
    renderStoresFromSettings(data.stores, data.stores);
  } catch (err) {
    msg.className = 'msg err';
    msg.textContent = err.status === 401 ? 'Token de admin inválido o ausente.' : err.message;
  } finally {
    btn.disabled = false;
  }
}

export async function syncNow() {
  const btn = $('btn-sync');
  if (btn.classList.contains('busy')) return;
  btn.classList.add('busy');
  try {
    await api('/sync', { method: 'POST' });
    $('status').textContent = 'Sincronizando…';
    pollUntilDone();
  } catch (err) {
    btn.classList.remove('busy');
    $('status').textContent = err.status === 401 ? 'Se requiere token de admin' : 'Error al sincronizar';
    setTimeout(renderStatus, 2500);
  }
}

function pollUntilDone() {
  clearTimeout(pollTimer);
  pollTimer = setTimeout(async () => {
    try {
      const s = await api('/status');
      if (s.syncing) return pollUntilDone();
      $('btn-sync').classList.remove('busy');
      await loadMeta();
      load(1);
    } catch {
      $('btn-sync').classList.remove('busy');
    }
  }, 2500);
}

export function renderDebug() {
  const el = $('debug-section');
  if (!el) return;
  el.classList.toggle('hidden', !state.debugUnlocked);
  if (state.debugUnlocked) refreshFcmStatus();
}

export async function refreshFcmStatus() {
  const el = $('fcm-status');
  if (!el) return;
  const token = store.get('push_token', '') || '';
  const push = getPush();
  let channel = 'gpuhunter-alerts: no disponible (solo app Android)';
  if (push) {
    try {
      await push.createChannel({
        id: 'gpuhunter-alerts',
        name: 'Alertas GPUHunter',
        description: 'Ofertas por debajo de tu objetivo',
        importance: 5,
        vibration: true,
        sound: 'default'
      });
      channel = 'gpuhunter-alerts: activo';
    } catch (err) {
      channel = 'gpuhunter-alerts: error (' + ((err && err.message) || String(err)) + ')';
    }
  }
  el.value = [
    'Token: ' + (token || 'sin registro'),
    'Canal: ' + channel,
    'Alertas: ' + (store.get('push_on', false) ? 'activadas en este dispositivo' : 'sin activar'),
    'Entorno: ' + (isNative() ? 'app Android' : 'navegador / PWA')
  ].join('\n');
}
