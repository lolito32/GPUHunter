import { getJSON } from '../lib/http.js';
import { GPU_SUBCATEGORIES } from '../config.js';

const CATALOG = 'https://static.compragamer.com/productos';

export default {
  key: 'compragamer',
  async fetch() {
    const products = await getJSON(CATALOG, { timeout: 45000, retries: 1 });
    const items = [];
    for (const p of products) {
      if (!GPU_SUBCATEGORIES.has(p.id_subcategoria)) continue;
      if (p.vendible !== 1 || p.es_outlet || p.id_nivel_falla) continue;
      const price = p.precioEspecial || p.precioLista;
      if (!price || price <= 0) continue;
      if (p.stock !== undefined && p.stock !== null && Number(p.stock) <= 0) continue;
      items.push({
        store: 'compragamer',
        id: String(p.id_producto),
        name: p.nombre,
        price: Number(price),
        url: `https://www.compragamer.com/producto/${slug(p.nombre)}_${p.id_producto}`
      });
    }
    return items;
  }
};

function slug(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
