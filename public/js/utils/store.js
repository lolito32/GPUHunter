'use strict';
export const store = {
  get: (k, d) => {
    try {
      const v = localStorage.getItem('gh_' + k);
      return v === null ? d : JSON.parse(v);
    } catch { return d; }
  },
  set: (k, v) => {
    try { localStorage.setItem('gh_' + k, JSON.stringify(v)); } catch {}
  }
};
