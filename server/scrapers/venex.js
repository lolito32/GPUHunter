import * as cheerio from 'cheerio';
import { getText, delay } from '../lib/http.js';
import { parsePrice } from '../lib/price.js';

const BASE = 'https://www.venex.com.ar/componentes-de-pc/placas-de-video';

export default {
  key: 'venex',
  async fetch({ maxPages = 6 } = {}) {
    const items = [];
    for (let page = 1; page <= maxPages; page++) {
      const url = page === 1 ? BASE : `${BASE}?page=${page}`;
      const html = await getText(url);
      const $ = cheerio.load(html);
      const found = [];
      $('.product-box').each((_, el) => {
        const box = $(el);
        const link = box.find('.product-box-title a').first();
        const href = link.attr('href') || '';
        const meta = parseMeta(link.attr('onclick'));
        const name = (meta.name || link.text() || '').replace(/\s+/g, ' ').trim();
        const price = meta.price || parsePrice(box.find('.product-box-price .current-price').first().text());
        if (!name || !href || !price) return;
        const img = box.find('img.img-contained').first().attr('src') || '';
        found.push({
          store: 'venex',
          id: meta.id || href.replace('https://www.venex.com.ar', '').replace(/\.html$/, ''),
          name,
          price,
          url: href,
          image: img ? absVenex(img) : ''
        });
      });
      items.push(...found);
      if (found.length === 0 || page === maxPages) break;
      await delay(700);
    }
    return dedupe(items);
  }
};

const absVenex = (src) =>
  src.startsWith('http') ? src : `https://www.venex.com.ar/${src.replace(/^\/+/, '')}`;

function parseMeta(onclick) {
  if (!onclick) return {};
  const start = onclick.indexOf('(');
  const end = onclick.lastIndexOf(')');
  if (start < 0 || end <= start) return {};
  try {
    const data = JSON.parse(onclick.slice(start + 1, end));
    return {
      id: data.id ? String(data.id) : '',
      name: typeof data.name === 'string' ? data.name : '',
      price: parsePrice(data.price)
    };
  } catch {
    return {};
  }
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((it) => (seen.has(it.id) ? false : (seen.add(it.id), true)));
}
