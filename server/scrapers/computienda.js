import { getText, getJSON, delay } from '../lib/http.js';

const SITE = 'https://www.computienda.com.ar';
const ERP = 'https://computienda-one.vercel.app';
const SEARCHES = ['placa de video', 'geforce', 'radeon', 'nvidia', 'rtx', 'gtx'];

export default {
  key: 'computienda',
  async fetch({ maxPages = 1 } = {}) {
    const dollar = await fetchDollar();
    if (!dollar) return [];

    const map = new Map();
    for (const search of SEARCHES) {
      const query = new URLSearchParams({ limit: '200', offset: '0', search, conStock: '1' });
      let data;
      try {
        data = await getJSON(`${ERP}/api/ecommerce/productos?${query.toString()}`);
      } catch {
        continue;
      }
      const products = Array.isArray(data?.products) ? data.products : [];
      for (const p of products) {
        if (!p || !p.nombre || Number(p.stock) <= 0) continue;
        const id = String(p.id);
        if (map.has(id)) continue;
        const price = priceOf(p, dollar);
        if (!price) continue;
        map.set(id, {
          store: 'computienda',
          id,
          name: String(p.nombre).trim(),
          price,
          url: productUrl(p),
          image: firstImage(p.imagenes)
        });
      }
      await delay(400);
    }
    void maxPages;
    return [...map.values()];
  }
};

async function fetchDollar() {
  for (const url of [`${SITE}/api/dolar`, 'https://api.bluelytics.com.ar/v2/latest']) {
    try {
      const data = await getJSON(url);
      const venta = Number(data?.venta ?? data?.oficial?.value_sell ?? data?.blue?.value_sell);
      if (Number.isFinite(venta) && venta > 0) return venta;
    } catch {
      // intenta con el siguiente origen
    }
  }
  return null;
}

function priceOf(p, dollar) {
  const precio = Number(p.precio);
  if (Number.isFinite(precio) && precio > 0) return Math.round(precio);

  const costo = Number(p.costo);
  const iva = Number(p.iva);
  const utilidad = Number(p.utilidad);
  if (![costo, iva, utilidad, dollar].every(Number.isFinite) || costo <= 0 || dollar <= 0) return null;

  const interno = p.impInterno || p.imp_interno ? 0.105 * costo : 0;
  const total = (costo + costo * (iva - 1) + interno) * utilidad * dollar;
  return Number.isFinite(total) && total > 0 ? Math.round(total) : null;
}

function productUrl(p) {
  const code = String(p.codigoInterno || '').replace(/\//g, '_');
  const base = slugify(p.nombre);
  return `${SITE}/producto/${base ? `${base}-${code}` : code}`;
}

function slugify(value) {
  let s = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (s.length > 70) {
    const cutoff = s.slice(0, 70);
    const dash = cutoff.lastIndexOf('-');
    s = dash > 0 ? cutoff.slice(0, dash) : cutoff;
  }
  return s;
}

function firstImage(imagenes) {
  if (!imagenes) return '';
  if (Array.isArray(imagenes)) return String(imagenes[0] || '');
  const value = String(imagenes).trim();
  if (value.startsWith('[')) {
    try {
      const list = JSON.parse(value);
      return Array.isArray(list) && list.length ? String(list[0]) : '';
    } catch {
      return '';
    }
  }
  return value.split(',')[0].trim();
}
