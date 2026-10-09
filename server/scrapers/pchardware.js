import * as cheerio from 'cheerio';
import { getText, delay } from '../lib/http.js';

const ORIGIN = 'https://www.pchardwareonline.com.ar';
const BASE = `${ORIGIN}/componentes-de-pcs/placas-de-video/`;

export default {
  key: 'pchardware',
  async fetch({ maxPages = 4 } = {}) {
    const items = [];
    for (let page = 1; page <= maxPages; page++) {
      const url = page === 1 ? BASE : `${BASE}?page=${page}`;
      const html = await getText(url);
      const $ = cheerio.load(html);
      const found = [];
      $('.js-item-product').each((_, el) => {
        const card = $(el);
        const link = card.find('a[href*="/productos/"]').first();
        const href = link.attr('href') || '';
        const name = card.find('.js-item-name, .item-name').first().text().replace(/\s+/g, ' ').trim();
        const variant = parseVariants(card.find('[data-variants]').first().attr('data-variants'));
        const price = priceOf(variant);
        if (!name || !href || !price) return;
        found.push({
          store: 'pchardware',
          id: variant.product_id ? String(variant.product_id) : href,
          name,
          price,
          url: href.startsWith('http') ? href : ORIGIN + href,
          image: pickImage($, card)
        });
      });
      items.push(...found);
      if (found.length === 0 || page === maxPages) break;
      await delay(700);
    }
    return dedupe(items);
  }
};

function parseVariants(raw) {
  if (!raw) return {};
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list[0] || {} : list || {};
  } catch {
    return {};
  }
}

function priceOf(variant) {
  const raw = Number(variant.price_number_raw);
  if (Number.isFinite(raw) && raw > 0) return Math.round(raw / 100);
  const num = Number(variant.price_number);
  if (Number.isFinite(num) && num > 0) return Math.round(num);
  return null;
}

function pickImage($, card) {
  const img = card.find('img').first();
  if (!img.length) return '';
  let src = img.attr('data-src') || img.attr('data-original') || '';
  if (!src) {
    const set = img.attr('data-srcset') || img.attr('srcset') || '';
    if (set) src = set.split(',')[0].trim().split(/\s+/)[0];
  }
  if (!src) {
    const direct = img.attr('src') || '';
    if (direct && !direct.startsWith('data:')) src = direct;
  }
  if (!src) return '';
  if (src.startsWith('//')) return `https:${src}`;
  if (src.startsWith('http')) return src;
  return ORIGIN + (src.startsWith('/') ? src : `/${src}`);
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((it) => (seen.has(it.id) ? false : (seen.add(it.id), true)));
}
