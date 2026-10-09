'use strict';
export const fmt = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
export const money = (n) => '$' + fmt.format(n);
export const esc = (s) => {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => map[c]);
};
