export function parsePrice(input) {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') return Number.isFinite(input) && input > 0 ? Math.round(input) : null;
  let s = String(input).replace(/[^0-9.,]/g, '');
  if (!s) return null;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    const parts = s.split(',');
    const dec = parts[parts.length - 1];
    if (parts.length === 2 && dec.length > 0 && dec.length < 3) s = s.replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastDot >= 0) {
    const parts = s.split('.');
    const dec = parts[parts.length - 1];
    if (parts.length > 2 || (parts.length === 2 && dec.length === 3)) s = s.replace(/\./g, '');
  }
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

export function formatARS(value) {
  if (!Number.isFinite(value)) return '-';
  return '$' + new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(value);
}
