'use strict';
import { api } from './api.js';
import { isNative } from './update.js';
import { esc } from '../utils/format.js';
export function getPush() {
    try {
      const c = window.Capacitor;
      if (!c) return null;
      if (c.Plugins && c.Plugins.PushNotifications) return c.Plugins.PushNotifications;
      if (typeof c.registerPlugin === 'function') return c.registerPlugin('PushNotifications');
    } catch {}
    return null;
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
    clearTimeout(showPushBanner._t);
    showPushBanner._t = setTimeout(() => el.classList.remove('on'), 7000);
  }
export async function registerDeviceToken(token) {
    const body = { token, platform: isNative() ? 'android' : 'web' };
    const res = await api('/register-device', { method: 'POST', body });
    store.set('push_on', true);
    store.set('push_token', token);
    return res;
  }
export function setupPushListeners(push) {
    if (pushListenersReady) return;
    pushListenersReady = true;
    push.addListener('pushNotificationReceived', (n) => showPushBanner(n.notification || n));
    push.addListener('pushNotificationActionPerformed', (r) => {
      const url = r && r.notification && r.notification.data && r.notification.data.url;
      if (url) window.open(url, '_blank');
    });
  }
export async function enrollPush(force) {
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
