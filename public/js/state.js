'use strict';

const ls = {
  get: (k, d) => {
    try {
      const v = localStorage.getItem(k);
      return v === null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  }
};

export const state = {
  meta: null,
  gpu: ls.get('gh_gpu', ''),
  storeKey: ls.get('gh_store', ''),
  deal: ls.get('gh_deal', false),
  sort: ls.get('gh_sort', 'price-asc'),
  q: '',
  items: [],
  page: 1,
  pages: 1,
  total: 0,
  loading: false,
  metaAt: 0,
  restoreTried: false,
  updateBannerShown: false
};
