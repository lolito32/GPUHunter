'use strict';
export const ONBOARDING_KEY = 'onboarding_completed';

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

export function lsGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function lsSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}
