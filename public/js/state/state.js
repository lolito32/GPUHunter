'use strict';
import { store } from '../utils/store.js';

export const state = {
  meta: null,
  gpu: store.get('gpu', ''),
  storeKey: store.get('store', ''),
  deal: store.get('deal', false),
  used: store.get('used', false),
  sort: store.get('sort', 'price-asc'),
  q: '',
  items: [],
  history: {},
  page: 1,
  pages: 1,
  total: 0,
  loading: false,
  metaAt: 0,
  restoreTried: false,
  debugUnlocked: store.get('debug', false)
};
