'use strict';

export function getLS(key, def) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? def : JSON.parse(v);
  } catch {
    return def;
  }
}

export function setLS(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
}

export const store = {
  get: (k, d) => getLS('gh_' + k, d),
  set: (k, v) => setLS('gh_' + k, v)
};
