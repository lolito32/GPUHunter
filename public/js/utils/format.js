'use strict';

export const fmt = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
export const money = (n) => '$' + fmt.format(n);
export const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
