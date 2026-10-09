'use strict';
export const fmt = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
export const money = (n) => '$' + fmt.format(n);
export const esc = (s) => {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => map[c]);
};

export function timeAgo(ts) {
  if (!ts) return 'nunca';
  const diff = Math.max(0, Date.now() - ts);
  const min = Math.round(diff / 60000);
  if (min < 1) return 'hace instantes';
  if (min < 60) return 'hace ' + min + ' min';
  const h = Math.floor(min / 60);
  if (h < 24) return 'hace ' + h + ' h';
  return 'hace ' + Math.floor(h / 24) + ' d';
}
