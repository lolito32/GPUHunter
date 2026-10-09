'use strict';

import { api, adminToken } from './api.js';

const $ = (id) => document.getElementById(id);

export function setupEvents() {
  const btnSync = $('btn-sync');
  if (btnSync) {
    btnSync.addEventListener('click', async () => {
      const msg = $('sync-msg');
      const statusEl = $('status');
      if (statusEl) statusEl.textContent = 'Sincronizando...';
      btnSync.disabled = true;
      try {
        await api('/sync', { method: 'POST' });
        if (statusEl) statusEl.textContent = 'Sincronización iniciada';
      } catch (err) {
        if (statusEl) statusEl.textContent = 'Error al sincronizar';
      } finally {
        btnSync.disabled = false;
      }
    });
  }
}
