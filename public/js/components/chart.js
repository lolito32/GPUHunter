'use strict';
import { esc } from '../utils/format.js';

const W = 260;
const H = 48;
const PAD = 4;

export function sparkline(history, options = {}) {
  const points = Array.isArray(history)
    ? history
        .filter((pt) => pt && Number.isFinite(Number(pt.p)))
        .map((pt) => ({ d: pt.d, p: Number(pt.p) }))
    : [];
  if (!points.length) return '';

  const width = options.width || W;
  const height = options.height || H;
  const pad = options.padding != null ? options.padding : PAD;

  const prices = points.map((pt) => pt.p);
  let min = Math.min(...prices);
  let max = Math.max(...prices);
  if (min === max) {
    min -= 1;
    max += 1;
  }

  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const stepX = points.length > 1 ? innerW / (points.length - 1) : 0;
  const coords = points.map((pt, i) => {
    const x = pad + stepX * i;
    const y = pad + innerH - ((pt.p - min) / (max - min)) * innerH;
    return [Number(x.toFixed(2)), Number(y.toFixed(2))];
  });

  const line = coords.map((c) => c[0] + ',' + c[1]).join(' ');
  const first = coords[0];
  const last = coords[coords.length - 1];
  const area =
    line + ' ' + last[0] + ',' + (pad + innerH) + ' ' + first[0] + ',' + (pad + innerH);

  const down = points[points.length - 1].p <= points[0].p;
  const stroke = down ? '#4ade80' : '#d97767';
  const label = down ? 'tendencia a la baja' : 'tendencia al alza';

  return (
    '<svg class="sparkline" viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none" role="img" aria-label="Historial de precios: ' + esc(label) + '">' +
    '<polygon points="' + area + '" fill="' + stroke + '" fill-opacity="0.12" stroke="none"/>' +
    '<polyline points="' + line + '" fill="none" stroke="' + stroke + '" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>' +
    '<circle cx="' + last[0] + '" cy="' + last[1] + '" r="2" fill="' + stroke + '"/>' +
    '</svg>'
  );
}
