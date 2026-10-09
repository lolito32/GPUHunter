'use strict';
import { esc } from '../utils/format.js';
import { state } from '../state/state.js';

const VB_W = 340;
const VB_H = 150;
const M = { top: 14, right: 12, bottom: 26, left: 58 };
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const TIP_W = 104;
const TIP_H = 44;

let uid = 0;

const fmt = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

function money(value) {
  return '$' + fmt.format(Math.round(Number(value) || 0));
}

function compactPrice(value) {
  const n = Math.abs(Number(value) || 0);
  if (n >= 1000000) {
    const m = Number(value) / 1000000;
    return '$' + (Math.round(m * 10) / 10) + 'M';
  }
  if (n >= 1000) return '$' + Math.round(Number(value) / 1000) + 'k';
  return '$' + Math.round(Number(value));
}

function shortDate(day) {
  const parts = String(day || '').split('-');
  if (parts.length < 3) return String(day || '');
  const m = Number(parts[1]);
  return parts[2] + ' ' + (MESES[m - 1] || '');
}

function sanitize(history) {
  return (Array.isArray(history) ? history : [])
    .filter((pt) => pt && Number.isFinite(Number(pt.p)))
    .map((pt) => ({ d: String(pt.d || ''), p: Number(pt.p) }));
}

export function sparkline(history, options = {}) {
  const points = sanitize(history);
  if (points.length < 2) return '';

  const prices = points.map((pt) => pt.p);
  let min = Math.min(...prices);
  let max = Math.max(...prices);
  if (min === max) {
    min -= Math.max(1, min * 0.01);
    max += Math.max(1, max * 0.01);
  }

  const innerW = VB_W - M.left - M.right;
  const innerH = VB_H - M.top - M.bottom;
  const stepX = innerW / (points.length - 1);
  const scaleY = (p) => M.top + innerH - ((p - min) / (max - min)) * innerH;

  const coords = points.map((pt, i) => {
    const x = M.left + stepX * i;
    return [Math.round(x * 100) / 100, Math.round(scaleY(pt.p) * 100) / 100];
  });

  const line = coords.map((c) => c[0] + ',' + c[1]).join(' ');
  const first = coords[0];
  const last = coords[coords.length - 1];
  const area = line + ' ' + last[0] + ',' + (M.top + innerH) + ' ' + first[0] + ',' + (M.top + innerH);

  const drop = last[1] > first[1] ? false : true;
  const color = drop ? '#4ade80' : '#e0685a';
  const gradId = 'spark-grad-' + uid++;

  const ticks = [0, 1 / 3, 2 / 3, 1].map((t) => {
    const value = max - (max - min) * t;
    return { y: Math.round((M.top + innerH * t) * 100) / 100, text: compactPrice(value) };
  });
  const grid = ticks
    .map((t) => '<line x1="' + M.left + '" y1="' + t.y + '" x2="' + (M.left + innerW) + '" y2="' + t.y + '" class="spark-grid-line"/>')
    .join('');
  const yLabels = ticks
    .map((t) => '<text x="' + (M.left - 8) + '" y="' + (t.y + 3.5) + '" text-anchor="end" class="spark-ylab">' + esc(t.text) + '</text>')
    .join('');
  const xLabels =
    '<text x="' + first[0] + '" y="' + (VB_H - 8) + '" text-anchor="start" class="spark-xlab">' + esc(shortDate(points[0].d)) + '</text>' +
    '<text x="' + last[0] + '" y="' + (VB_H - 8) + '" text-anchor="end" class="spark-xlab">' + esc(shortDate(points[points.length - 1].d)) + '</text>';

  const grad =
    '<defs><linearGradient id="' + gradId + '" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="' + color + '" stop-opacity="0.30"/>' +
    '<stop offset="100%" stop-color="' + color + '" stop-opacity="0.02"/>' +
    '</linearGradient></defs>';

  return (
    '<svg class="sparkline" viewBox="0 0 ' + VB_W + ' ' + VB_H + '" preserveAspectRatio="xMidYMid meet" ' +
    'role="img" aria-label="Gráfico de evolución de precio" data-key="' + esc(options.key || '') + '" ' +
    'data-vw="' + VB_W + '" data-left="' + M.left + '" data-right="' + (M.left + innerW) + '" ' +
    'data-top="' + M.top + '" data-bottom="' + (M.top + innerH) + '" ' +
    'data-coords="' + coords.map((c) => c.join(',')).join(';') + '">' +
    grad +
    '<g class="spark-grid">' + grid + '</g>' +
    '<g class="spark-ylabels">' + yLabels + '</g>' +
    '<polygon points="' + area + '" fill="url(#' + gradId + ')"/>' +
    '<polyline points="' + line + '" fill="none" stroke="' + color + '" stroke-width="2" ' +
    'vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>' +
    '<circle cx="' + last[0] + '" cy="' + last[1] + '" r="3.5" fill="' + color + '" stroke="#0c0d0e" stroke-width="1.5"/>' +
    '<g class="spark-xlabels">' + xLabels + '</g>' +
    '<line class="spark-cursor" y1="' + M.top + '" y2="' + (M.top + innerH) + '" style="display:none"/>' +
    '<circle class="spark-dot" r="4" style="display:none"/>' +
    '<g class="spark-tip" style="display:none">' +
    '<rect x="0" y="0" width="' + TIP_W + '" height="' + TIP_H + '" rx="7" class="spark-tip-bg"/>' +
    '<text class="spark-tip-date" x="0" y="0">—</text>' +
    '<text class="spark-tip-price" x="0" y="0">—</text>' +
    '</g>' +
    '</svg>'
  );
}

export function mountCharts(root = document) {
  const charts = root.querySelectorAll ? root.querySelectorAll('svg.sparkline[data-coords]') : [];
  for (const svg of charts) {
    if (svg.dataset.bound === '1') continue;
    svg.dataset.bound = '1';
    bindChart(svg);
  }
}

function bindChart(svg) {
  const coords = String(svg.dataset.coords || '')
    .split(';')
    .filter(Boolean)
    .map((pair) => pair.split(',').map(Number))
    .filter((pair) => pair.length === 2 && pair.every(Number.isFinite));
  if (!coords.length) return;

  const key = svg.dataset.key || '';
  const right = Number(svg.dataset.right);
  const top = Number(svg.dataset.top);
  const bottom = Number(svg.dataset.bottom);
  const vw = Number(svg.dataset.vw) || VB_W;

  const cursor = svg.querySelector('.spark-cursor');
  const dot = svg.querySelector('.spark-dot');
  const tip = svg.querySelector('.spark-tip');
  const tipBg = svg.querySelector('.spark-tip-bg');
  const tipDate = svg.querySelector('.spark-tip-date');
  const tipPrice = svg.querySelector('.spark-tip-price');

  let hideTimer = null;

  const points = () => {
    const hist = state.history && state.history[key];
    const arr = sanitize(hist);
    return arr.length >= coords.length ? arr : null;
  };

  const locate = (clientX) => {
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return 0;
    const vbX = ((clientX - rect.left) / rect.width) * vw;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < coords.length; i++) {
      const dist = Math.abs(coords[i][0] - vbX);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    return best;
  };

  const show = (index) => {
    clearTimeout(hideTimer);
    const point = coords[index];
    const data = points();
    const x = point[0];
    const y = point[1];

    cursor.setAttribute('x1', x);
    cursor.setAttribute('x2', x);
    cursor.style.display = '';
    dot.setAttribute('cx', x);
    dot.setAttribute('cy', y);
    dot.style.display = '';

    const tipX = x + 10 + TIP_W > right ? x - 10 - TIP_W : x + 10;
    const tipY = Math.max(top, Math.min(bottom - TIP_H, y - TIP_H / 2));
    tip.setAttribute('transform', 'translate(' + Math.round(tipX) + ',' + Math.round(tipY) + ')');
    tipBg.setAttribute('width', TIP_W);
    tipBg.setAttribute('height', TIP_H);
    if (data) {
      const pt = data[index];
      tipDate.textContent = shortDate(pt.d);
      tipPrice.textContent = money(pt.p);
    }
    tipDate.setAttribute('x', 10);
    tipDate.setAttribute('y', 17);
    tipPrice.setAttribute('x', 10);
    tipPrice.setAttribute('y', 35);
    tip.style.display = '';
  };

  const hide = () => {
    clearTimeout(hideTimer);
    cursor.style.display = 'none';
    dot.style.display = 'none';
    tip.style.display = 'none';
  };

  const onMove = (e) => show(locate(e.clientX));

  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    onMove(e);
  });
  svg.addEventListener('pointerleave', hide);
  svg.addEventListener('pointerup', () => {
    hideTimer = setTimeout(hide, 1800);
  });
}
