'use strict';
import { esc } from '../utils/format.js';

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
    '<div class="pb-title">' +
    esc((note && (note.title || (note.data && note.data.title))) || 'GPUHunter') +
    '</div>' +
    (body ? '<div class="pb-body">' + esc(body) + '</div>' : '');
  el.classList.add('on');
  clearTimeout(showPushBanner._t);
  showPushBanner._t = setTimeout(() => el.classList.remove('on'), 7000);
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
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('on'), 2400);
}
