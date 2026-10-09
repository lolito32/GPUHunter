'use strict';
import { $, debounce } from '../utils/dom.js';
import { store, lsGet, lsSet, ONBOARDING_KEY } from '../utils/store.js';
import { state } from '../state/state.js';
import { api } from '../services/api.js';
import { enrollPush } from '../services/push.js';
import { toast, showPushBanner } from '../components/banners.js';
import { isNative, registerServiceWorker } from '../services/update.js';
import {
  load,
  loadMeta,
  renderChips,
  renderTargets,
  loadConfig,
  renderDebug,
  refreshFcmStatus,
  saveTargets,
  saveConfig,
  syncNow
} from '../views/render.js';

export function route() {
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

export function maybeShowOnboarding() {
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

export function setupEvents() {
  $('chips-gpu').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-gpu], [data-deal], [data-used]');
    if (!chip) return;
    if (chip.dataset.deal) state.deal = !state.deal;
    else if (chip.dataset.used) state.used = !state.used;
    else state.gpu = chip.dataset.gpu;
    store.set('gpu', state.gpu);
    store.set('deal', state.deal);
    store.set('used', state.used);
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
    state.debugUnlocked = !state.debugUnlocked;
    store.set('debug', state.debugUnlocked);
    renderDebug();
    toast(state.debugUnlocked ? 'Modo Debug activado' : 'Modo Debug desactivado');
  });

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
}

export async function boot() {
  registerServiceWorker();
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
