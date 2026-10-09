'use strict';
import { checkAppUpdate } from './js/services/update.js';
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const fmt = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
  const money = (n) => '$' + fmt.format(n);
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );

  const store = {
    get: (k, d) => {
      try {
        const v = localStorage.getItem('gh_' + k);
        return v === null ? d : JSON.parse(v);
      } catch {
        return d;
      }
    },
    set: (k, v) => {
      try {
        localStorage.setItem('gh_' + k, JSON.stringify(v));
      } catch {}
    }
  };

  const DEFAULT_API = 'https://gpuhunter.onrender.com';
  const DEFAULT_ADMIN = '70b8622e07ec575a85ed5af40ca0692c';

  function apiBase() {
    const saved = store.get('api', '');
    return saved || DEFAULT_API;
  }

  function adminToken() {
    return store.get('admin', '') || DEFAULT_ADMIN;
  }

  const ONBOARDING_KEY = 'onboarding_completed';

  function lsGet(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function lsSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {}
  }

  const state = {
    meta: null,
    gpu: store.get('gpu', ''),
    storeKey: store.get('store', ''),
    deal: store.get('deal', false),
    sort: store.get('sort', 'price-asc'),
    q: '',
    items: [],
    page: 1,
    pages: 1,
    total: 0,
    loading: false,
    metaAt: 0,
    restoreTried: false
  };

  let pollTimer = null;

  let debugUnlocked = store.get('debug', false);

  async function api(path, options = {}) {
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
            state.meta = { gpus: [], stores: [], targets: {}, lastSync: data.lastSync || Date.now(), total: data.total || 0 };
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

  const isNative = () =>
    !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

  function getPush() {
    try {
      const c = window.Capacitor;
      if (!c) return null;
      if (c.Plugins && c.Plugins.PushNotifications) return c.Plugins.PushNotifications;
      if (typeof c.registerPlugin === 'function') return c.registerPlugin('PushNotifications');
    } catch {}
    return null;
  }

  function showPushBanner(note) {
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
    clearTimeout(showPushBanner._t);
    showPushBanner._t = setTimeout(() => el.classList.remove('on'), 7000);
  }

  async function registerDeviceToken(token) {
    const body = { token, platform: isNative() ? 'android' : 'web' };
    const res = await api('/register-device', { method: 'POST', body });
    store.set('push_on', true);
    store.set('push_token', token);
    return res;
  }

  let pushListenersReady = false;

  function setupPushListeners(push) {
    if (pushListenersReady) return;
    pushListenersReady = true;
    push.addListener('pushNotificationReceived', (n) => showPushBanner(n.notification || n));
    push.addListener('pushNotificationActionPerformed', (r) => {
      const url = r && r.notification && r.notification.data && r.notification.data.url;
      if (url) window.open(url, '_blank');
    });
  }

  async function enrollPush(force) {
    const push = getPush();
    if (!push) return { activated: false, reason: 'no-native' };
    try {
      await push.createChannel({
        id: 'gpuhunter-alerts',
        name: 'Alertas GPUHunter',
        description: 'Ofertas por debajo de tu objetivo',
        importance: 5,
        vibration: true,
        sound: 'default'
      });
    } catch {}

    setupPushListeners(push);

    if (force) {
      const permStatus = await push.requestPermissions();
      if (permStatus && permStatus.receive === 'denied') return { activated: false, reason: 'denied' };
    }

    return new Promise(async (resolve) => {
      let timeoutId = setTimeout(() => {
        resolve({ activated: false, reason: 'no-token' });
      }, 10000);

      push.addListener('registration', async (tokenObj) => {
        clearTimeout(timeoutId);
        const token = tokenObj && tokenObj.value;
        if (!token) {
          resolve({ activated: false, reason: 'no-token' });
          return;
        }
        try {
          await registerDeviceToken(token);
          resolve({ activated: true });
        } catch (err) {
          resolve({ activated: false, reason: err.message });
        }
      });

      push.addListener('registrationError', (err) => {
        clearTimeout(timeoutId);
        resolve({ activated: false, reason: err && err.error ? err.error : 'registration-error' });
      });

      try {
        await push.register();
      } catch (err) {
        clearTimeout(timeoutId);
        resolve({ activated: false, reason: err.message });
      }
    });
  }

  function maybeShowOnboarding() {
    if (lsGet(ONBOARDING_KEY) !== null) return false;
    const el = $('onboarding');
    if (!el) return false;
    el.classList.remove('hidden');
    return true;
  }

  function finishOnboarding() {
    lsSet(ONBOARDING_KEY, 'true');
    const el = $('onboarding');
    if (el) el.classList.add('hidden');
    if ((location.hash || '#/') === '#/') route();
    else location.hash = '#/';
  }

  async function startOnboarding() {
    const btn = $('btn-onboarding-start');
    const msg = $('onboarding-msg');
    btn.disabled = true;
    msg.className = 'msg';
    msg.textContent = 'Activando notificaciones…';
    try {
      const r = await enrollPush(true);
      if (r.activated) {
        msg.className = 'msg ok';
        msg.textContent = 'Dispositivo registrado.';
      } else if (r.reason === 'no-native') {
        msg.className = 'msg';
        msg.textContent = 'Las alertas push están disponibles en la app Android.';
      } else {
        msg.className = 'msg err';
        msg.textContent = 'No se pudieron activar las alertas. Podés reintentarlo desde Ajustes.';
      }
    } catch (err) {
      msg.className = 'msg err';
      msg.textContent = (err && err.message) || 'No se pudieron activar las alertas.';
    }
    await new Promise((r) => setTimeout(r, 500));
    finishOnboarding();
  }

  function timeAgo(ts) {
    if (!ts) return 'nunca';
    const diff = Math.max(0, Date.now() - ts);
    const min = Math.round(diff / 60000);
    if (min < 1) return 'hace instantes';
    if (min < 60) return 'hace ' + min + ' min';
    const h = Math.floor(min / 60);
    if (h < 24) return 'hace ' + h + ' h';
    return 'hace ' + Math.floor(h / 24) + ' d';
  }

  function renderStatus() {
    const m = state.meta;
    const el = $('status');
    if (!m) return;
    el.textContent =
      'Sync ' + timeAgo(m.lastSync) + ' · ' + m.total + ' ofertas' + (m.underTarget ? ' · ' + m.underTarget + ' bajo objetivo' : '');
    el.title = m.syncing ? 'Sincronizando…' : 'Última sincronización ' + timeAgo(m.lastSync);
  }

  function renderChips() {
    const m = state.meta;
    if (!m) return;
    const gpus = m.gpus.slice(0, 18);
    const gpuHtml = ['<button class="chip' + (state.gpu === '' ? ' on' : '') + '" data-gpu="">Todas <span class="n">' + m.total + '</span></button>'];
    if (state.deal) {
      gpuHtml.push('<button class="chip on" data-deal="1">Bajo objetivo <span class="n">' + m.underTarget + '</span></button>');
    } else {
      gpuHtml.push('<button class="chip" data-deal="1">Bajo objetivo <span class="n">' + m.underTarget + '</span></button>');
    }
    for (const g of gpus) {
      gpuHtml.push(
        '<button class="chip' + (state.gpu === g.k ? ' on' : '') + '" data-gpu="' + esc(g.k) + '">' + esc(g.l) +
          ' <span class="n">' + g.n + '</span></button>'
      );
    }
    $('chips-gpu').innerHTML = gpuHtml.join('');

    const stores = m.stores.filter((s) => s.on !== false && s.count > 0);
    const html = ['<button class="chip' + (state.storeKey === '' ? ' on' : '') + '" data-store="">Todas las tiendas</button>'];
    for (const s of stores) {
      html.push(
        '<button class="chip' + (state.storeKey === s.k ? ' on' : '') + '" data-store="' + esc(s.k) + '">' +
          esc(s.n) + ' <span class="n">' + s.count + '</span></button>'
      );
    }
    $('chips-store').innerHTML = html.join('');
  }

  function cardHtml(item) {
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
    const tag = deal ? '<span class="deal-tag">bajo objetivo</span>' : '';
    const thumb = item.im
      ? '<img class="thumb" src="' +
        esc(item.im) +
        '" alt="" width="62" height="62" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">'
      : '';
    return (
      '<article class="row-item"><div class="row-main">' +
      thumb +
      '<div class="row-col">' +
      '<div class="row-top"><span class="store-pill">' + esc(storeName(item.st)) + '</span>' +
      source + tag + '</div>' +
      '<h3 class="name">' + esc(item.nm) + '</h3>' +
      '<div class="row-bottom"><div class="price-wrap"><span class="price">' + money(item.pr) +
      '</span>' + delta + '</div>' +
      '<a class="go" href="' + esc(item.ur) + '" target="_blank" rel="noopener noreferrer">Ver</a>' +
      '</div></div></div></article>'
    );
  }

  function storeName(key) {
    const found = state.meta && state.meta.stores.find((s) => s.k === key);
    return found ? found.n : key;
  }

  function renderList(append) {
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
    }
    $('list-meta').textContent = state.total
      ? state.items.length + ' de ' + state.total + ' ofertas' + (state.meta ? ' · datos ' + timeAgo(state.meta.lastSync) : '')
      : '';
    $('btn-more').classList.toggle('hidden', state.page >= state.pages);
  }

  function query(extra) {
    const p = new URLSearchParams();
    p.set('limit', '60');
    p.set('sort', state.sort);
    if (state.gpu) p.set('gpu', state.gpu);
    if (state.storeKey) p.set('store', state.storeKey);
    if (state.deal) p.set('deal', '1');
    if (state.q) p.set('q', state.q);
    if (extra && extra.page) p.set('page', String(extra.page));
    return p.toString();
  }

  async function load(page) {
    if (state.loading) return;
    state.loading = true;
    if (page === 1) {
      $('list').innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
      $('btn-more').classList.add('hidden');
    }
    try {
      const data = await api('/products?' + query({ page }), { initial: page === 1 });
      state.page = data.page;
      state.pages = data.pages;
      state.total = data.total;
      state.items = page === 1 ? data.items : state.items.concat(data.items);
      renderList(page !== 1);
    } catch (err) {
      $('list').innerHTML = '<div class="empty">No se pudo cargar: ' + esc(err.message) + '</div>';
    } finally {
      state.loading = false;
    }
  }

  async function loadMeta() {
    try {
      state.meta = await api('/meta');
      state.metaAt = Date.now();
      if (!state.meta.fresh) store.set('targets', state.meta.targets || {});
      else maybeRestoreTargets(state.meta);
      renderStatus();
      renderChips();
    } catch (err) {
      $('status').textContent = 'Sin conexión con el servidor';
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

  async function maybeRestoreTargets(m) {
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

  function renderTargets() {
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

  async function saveTargets() {
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

  async function loadConfig() {
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

  function renderStoresFromSettings(settingsStores, saved) {
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

  async function saveConfig() {
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

  async function syncNow() {
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

  function route() {
    const hash = location.hash || '#/';
    const map = { '#/': 'offers', '#/targets': 'targets', '#/config': 'config' };
    const view = map[hash] || 'offers';
    for (const name of ['offers', 'targets', 'config']) {
      $('view-' + name).classList.toggle('hidden', name !== view);
    }
    document.querySelectorAll('[data-nav]').forEach((a) => {
      a.classList.toggle('active', a.dataset.nav === view);
    });
    if (view === 'offers') {
      if (Date.now() - state.metaAt > 90000) loadMeta();
      if (state.items.length === 0) load(1);
    } else if (view === 'targets') {
      if (!state.meta) loadMeta().then(renderTargets);
      else renderTargets();
    } else if (view === 'config') {
      loadConfig();
    }
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  $('chips-gpu').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-gpu], [data-deal]');
    if (!chip) return;
    if (chip.dataset.deal) state.deal = !state.deal;
    else state.gpu = chip.dataset.gpu;
    store.set('gpu', state.gpu);
    store.set('deal', state.deal);
    renderChips();
    load(1);
  });

  $('chips-store').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-store]');
    if (!chip) return;
    state.storeKey = chip.dataset.store;
    store.set('store', state.storeKey);
    renderChips();
    load(1);
  });

  $('q').addEventListener(
    'input',
    debounce((e) => {
      state.q = e.target.value.trim().toLowerCase();
      load(1);
    }, 260)
  );

  $('sort').value = state.sort;
  $('sort').addEventListener('change', (e) => {
    state.sort = e.target.value;
    store.set('sort', state.sort);
    load(1);
  });

  $('btn-more').addEventListener('click', () => load(state.page + 1));
  $('btn-sync').addEventListener('click', syncNow);
  $('btn-save-targets').addEventListener('click', saveTargets);
  $('btn-save-config').addEventListener('click', saveConfig);
  $('btn-enable-push').addEventListener('click', async () => {
    const msg = $('push-msg');
    msg.className = 'msg';
    msg.textContent = 'Activando alertas…';
    try {
      const r = await enrollPush(true);
      if (!r.activated) {
        msg.className = 'msg err';
        msg.textContent =
          r.reason === 'no-native' ? 'Las notificaciones nativas solo funcionan en la app Android instalada.' : 'No se pudo activar las alertas.';
        return;
      }
      msg.className = 'msg ok';
      msg.textContent = 'Dispositivo registrado correctamente';
      refreshFcmStatus();
    } catch (e) {
      msg.className = 'msg err';
      msg.textContent = e.message || 'No se pudo activar las alertas';
    }
  });
  window.addEventListener('hashchange', route);

  $('btn-onboarding-start').addEventListener('click', startOnboarding);

  function renderDebug() {
    const el = $('debug-section');
    if (!el) return;
    el.classList.toggle('hidden', !debugUnlocked);
    if (debugUnlocked) refreshFcmStatus();
  }

  function toast(text) {
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
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('on'), 2400);
  }

  let wordTaps = 0;
  let wordTapTimer = null;

  $('wordmark').addEventListener('click', () => {
    wordTaps++;
    clearTimeout(wordTapTimer);
    wordTapTimer = setTimeout(() => {
      wordTaps = 0;
    }, 1600);
    if (wordTaps < 5) return;
    wordTaps = 0;
    clearTimeout(wordTapTimer);
    debugUnlocked = !debugUnlocked;
    store.set('debug', debugUnlocked);
    renderDebug();
    toast(debugUnlocked ? 'Modo Debug activado' : 'Modo Debug desactivado');
  });

  async function refreshFcmStatus() {
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

  $('btn-fcm-refresh').addEventListener('click', refreshFcmStatus);

  $('btn-test-push').addEventListener('click', async () => {
    const msg = $('test-msg');
    const tokenGuardado = store.get('push_token', '') || '';
    if (!tokenGuardado) {
      msg.className = 'msg err';
      msg.textContent = 'Sin token FCM en este dispositivo: activá las alertas desde Ajustes.';
      return;
    }
    msg.className = 'msg';
    msg.textContent = 'Programando notificación de prueba…';
    try {
      const r = await api('/test-notification', { method: 'POST', body: { token: tokenGuardado } });
      msg.className = 'msg ok';
      msg.textContent = r.message || 'Prueba programada.';
      toast('Prueba programada. Puedes cerrar la app ahora.');
    } catch (err) {
      msg.className = 'msg err';
      msg.textContent = err.status === 401 ? 'Token de admin requerido (cargalo arriba).' : err.message;
    }
  });

  $('btn-sim-drop').addEventListener('click', () => {
    showPushBanner({
      title: 'GPUHunter',
      body: 'Simulación: RTX 4060 bajó $45.000 y quedó en $389.999 (bajo objetivo)'
    });
    const msg = $('test-msg');
    msg.className = 'msg ok';
    msg.textContent = 'Banner local disparado en foreground.';
  });

  async function boot() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    if (isNative()) {
      const enrolled = store.get('push_on', false) && store.get('push_token', '');
      const onboarded = lsGet(ONBOARDING_KEY) === 'true';
      if (enrolled || onboarded) enrollPush(false).catch(() => {});
    }
    renderDebug();
    await loadMeta();
    route();
    if (state.items.length === 0) load(1);
    setInterval(() => {
      if (!state.meta || Date.now() - state.metaAt < 60000) return;
      loadMeta();
    }, 60000);
  }

  maybeShowOnboarding();
  boot();
})();
