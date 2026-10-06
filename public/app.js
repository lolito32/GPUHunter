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

  async function api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    const token = store.get('admin', '');
    if (token) headers['x-admin-token'] = token;
    if (options.body) headers['content-type'] = 'application/json';
    const res = await fetch('/api' + path, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || 'Error ' + res.status);
      err.status = res.status;
      throw err;
    }
    return data;
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
      const data = await api('/products?' + query({ page }));
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
      $('tg-token').placeholder = s.telegram.tokenMasked || '123456:ABC-DEF…';
      $('tg-chat').value = s.telegram.chatId || '';
      $('tg-enabled').checked = s.telegram.enabled;
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
    const token = $('tg-token').value.trim();
    const body = {
      telegram: {
        chatId: $('tg-chat').value.trim(),
        enabled: $('tg-enabled').checked
      },
      stores,
      intervalMin: Number($('interval').value),
      maxPages: Number($('maxpages').value)
    };
    if (token && !token.includes('*')) body.telegram.token = token;
    const admin = $('admin-token').value.trim();
    if (admin) {
      store.set('admin', admin);
    }
    btn.disabled = true;
    msg.className = 'msg';
    msg.textContent = 'Guardando…';
    try {
      const data = await api('/settings', { method: 'PUT', body });
      store.set('stores', data.stores);
      $('tg-token').value = '';
      $('tg-token').placeholder = data.telegram.tokenMasked || 'sin token';
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

  async function testTelegram() {
    const msg = $('tg-msg');
    const token = $('tg-token').value.trim();
    const chatId = $('tg-chat').value.trim();
    const body = {};
    if (token && !token.includes('*')) body.token = token;
    if (chatId) body.chatId = chatId;
    msg.className = 'msg';
    msg.textContent = 'Enviando prueba…';
    try {
      await api('/telegram/test', { method: 'POST', body });
      msg.className = 'msg ok';
      msg.textContent = 'Mensaje de prueba enviado. Revisá Telegram.';
    } catch (err) {
      msg.className = 'msg err';
      msg.textContent = err.status === 401 ? 'Token de admin requerido.' : err.message;
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
  $('btn-test-tg').addEventListener('click', testTelegram);
  window.addEventListener('hashchange', route);

  async function boot() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    await loadMeta();
    route();
    if (state.items.length === 0) load(1);
    setInterval(() => {
      if (!state.meta || Date.now() - state.metaAt < 60000) return;
      loadMeta();
    }, 60000);
  }

  boot();
})();
