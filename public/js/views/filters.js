'use strict';
import { $ } from '../utils/dom.js';
import { esc } from '../utils/format.js';
import { store } from '../utils/store.js';
import { state } from '../state/state.js';

const BRAND_LABELS = { nvidia: 'NVIDIA', amd: 'AMD', intel: 'Intel' };

const SERIES_ORDER = [
  'rtx-5000', 'rtx-4000', 'rtx-3000', 'rtx-2000',
  'gtx-16', 'gtx-10', 'gtx',
  'rx-9000', 'rx-7000', 'rx-6000', 'rx-5000',
  'arc'
];

const SERIES_LABELS = {
  'rtx-5000': 'RTX 5000',
  'rtx-4000': 'RTX 4000',
  'rtx-3000': 'RTX 3000',
  'rtx-2000': 'RTX 2000',
  'gtx-16': 'GTX 16',
  'gtx-10': 'GTX 10',
  gtx: 'GTX',
  'rx-9000': 'RX 9000',
  'rx-7000': 'RX 7000',
  'rx-6000': 'RX 6000',
  'rx-5000': 'RX 5000',
  arc: 'Arc'
};

function readArray(key) {
  const value = store.get(key, []);
  return Array.isArray(value) ? value : [];
}

export const activeFilters = {
  brands: readArray('filter_brands'),
  series: readArray('filter_series'),
  models: readArray('filter_models')
};

export function inferBrandSeries(gp) {
  const parts = String(gp || '').toLowerCase().split('-').filter(Boolean);
  const family = parts[0];
  const num = parts[1] || '';
  if (family === 'rtx') {
    return { brand: 'nvidia', series: num ? 'rtx-' + num[0] + '000' : 'rtx' };
  }
  if (family === 'gtx' || family === 'gt') {
    let series = 'gtx';
    if (num.startsWith('16')) series = 'gtx-16';
    else if (num.startsWith('10')) series = 'gtx-10';
    return { brand: 'nvidia', series };
  }
  if (family === 'rx') {
    return { brand: 'amd', series: num ? 'rx-' + num[0] + '000' : 'rx' };
  }
  if (family === 'arc') {
    return { brand: 'intel', series: 'arc' };
  }
  return null;
}

function seriesBrand(series) {
  const family = String(series || '').split('-')[0];
  if (family === 'rtx' || family === 'gtx') return 'nvidia';
  if (family === 'rx') return 'amd';
  if (family === 'arc') return 'intel';
  return null;
}

function sanitizeCascade() {
  if (!activeFilters.brands.length) {
    activeFilters.series = [];
  } else {
    activeFilters.series = activeFilters.series.filter((s) => activeFilters.brands.includes(seriesBrand(s)));
  }
  if (!activeFilters.series.length) {
    activeFilters.models = [];
  } else {
    activeFilters.models = activeFilters.models.filter((m) => {
      const info = inferBrandSeries(m);
      return info && activeFilters.series.includes(info.series);
    });
  }
}

sanitizeCascade();
store.set('filter_brands', activeFilters.brands);
store.set('filter_series', activeFilters.series);
store.set('filter_models', activeFilters.models);

export function isFilterActive() {
  return activeFilters.brands.length > 0 || activeFilters.series.length > 0 || activeFilters.models.length > 0;
}

export function itemMatchesFilters(item) {
  if (!isFilterActive()) return true;
  const info = inferBrandSeries(item && item.gp);
  if (!info) return false;
  if (activeFilters.brands.length && !activeFilters.brands.includes(info.brand)) return false;
  if (activeFilters.series.length && !activeFilters.series.includes(info.series)) return false;
  if (activeFilters.models.length && !activeFilters.models.includes(item.gp)) return false;
  return true;
}

export function filterItems(items) {
  if (!isFilterActive()) return items;
  return items.filter(itemMatchesFilters);
}

export function toggleBrand(brand) {
  const idx = activeFilters.brands.indexOf(brand);
  if (idx >= 0) activeFilters.brands.splice(idx, 1);
  else activeFilters.brands.push(brand);
  sanitizeCascade();
  store.set('filter_brands', activeFilters.brands);
  store.set('filter_series', activeFilters.series);
  store.set('filter_models', activeFilters.models);
}

export function toggleSeries(series) {
  const idx = activeFilters.series.indexOf(series);
  if (idx >= 0) activeFilters.series.splice(idx, 1);
  else activeFilters.series.push(series);
  sanitizeCascade();
  store.set('filter_series', activeFilters.series);
  store.set('filter_models', activeFilters.models);
}

export function toggleModel(model) {
  const idx = activeFilters.models.indexOf(model);
  if (idx >= 0) activeFilters.models.splice(idx, 1);
  else activeFilters.models.push(model);
  store.set('filter_models', activeFilters.models);
}

export function activeFilterCount() {
  return activeFilters.brands.length + activeFilters.series.length + activeFilters.models.length;
}

function chipHtml(active, attr, value, label, count) {
  return (
    '<button class="chip' + (active ? ' on' : '') + (count ? '' : ' zero') + '" ' + attr + '="' + esc(value) + '">' +
    esc(label) + ' <span class="n">' + count + '</span></button>'
  );
}

export function renderFilterChips() {
  const brandEl = $('chips-brand');
  const seriesEl = $('chips-series');
  const modelEl = $('chips-model');
  const seriesGroup = $('series-group');
  const modelGroup = $('model-group');
  if (!brandEl || !seriesEl || !modelEl) return;

  const gpus = (state.meta && state.meta.gpus) || [];
  const brandCounts = {};
  const seriesCounts = {};
  const seriesBrands = {};
  for (const g of gpus) {
    const info = inferBrandSeries(g.k);
    if (!info) continue;
    const n = g.n || 0;
    brandCounts[info.brand] = (brandCounts[info.brand] || 0) + n;
    seriesCounts[info.series] = (seriesCounts[info.series] || 0) + n;
    seriesBrands[info.series] = info.brand;
  }

  const brandOrder = ['nvidia', 'amd', 'intel'];
  brandEl.innerHTML = brandOrder
    .filter((b) => brandCounts[b])
    .map((b) => chipHtml(activeFilters.brands.includes(b), 'data-filter-brand', b, BRAND_LABELS[b], brandCounts[b]))
    .join('');

  const selectedBrands = activeFilters.brands;
  const showSeries = selectedBrands.length > 0;
  if (seriesGroup) seriesGroup.classList.toggle('hidden', !showSeries);
  if (!showSeries) {
    seriesEl.innerHTML = '';
    if (modelGroup) modelGroup.classList.add('hidden');
    modelEl.innerHTML = '';
    return;
  }

  const belongsBrand = (s) => selectedBrands.includes(seriesBrands[s]);
  const known = SERIES_ORDER.filter((s) => seriesCounts[s] && belongsBrand(s));
  const extras = Object.keys(seriesCounts).filter((s) => !SERIES_ORDER.includes(s) && belongsBrand(s));
  seriesEl.innerHTML = known
    .concat(extras)
    .map((s) => chipHtml(activeFilters.series.includes(s), 'data-filter-series', s, SERIES_LABELS[s] || s.toUpperCase(), seriesCounts[s]))
    .join('');

  const selectedSeries = activeFilters.series;
  const showModels = selectedSeries.length > 0;
  if (modelGroup) modelGroup.classList.toggle('hidden', !showModels);
  if (!showModels) {
    modelEl.innerHTML = '';
    return;
  }

  modelEl.innerHTML = gpus
    .filter((g) => {
      const info = inferBrandSeries(g.k);
      return info && selectedSeries.includes(info.series);
    })
    .map((g) => chipHtml(activeFilters.models.includes(g.k), 'data-filter-model', g.k, g.l, g.n || 0))
    .join('');
}

const PANEL_MS = 300;

function setupFilterPanelAnimation() {
  const details = document.getElementById('filters');
  if (!details) return;
  const summary = details.querySelector('.filters-btn');
  const panel = details.querySelector('.filters-panel');
  if (!summary || !panel) return;

  let animating = false;
  let closing = false;
  let closeTimer = null;

  summary.addEventListener('click', (event) => {
    event.preventDefault();
    if (animating) return;
    animating = true;

    if (details.open) {
      // Closing: panel is rendered, so scrollHeight is available
      panel.style.gridTemplateRows = panel.scrollHeight + 'px';
      requestAnimationFrame(() => {
        panel.style.gridTemplateRows = '0fr';
      });
      setTimeout(() => {
        details.open = false;
        panel.style.gridTemplateRows = '';
        animating = false;
      }, PANEL_MS);
    } else {
      // Opening: make sure it's rendered at 0fr first
      details.open = true;
      panel.style.gridTemplateRows = '0fr';
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          panel.style.gridTemplateRows = '1fr';
          setTimeout(() => {
            animating = false;
          }, PANEL_MS + 50);
        });
      });
    }
  });
}

setupFilterPanelAnimation();

