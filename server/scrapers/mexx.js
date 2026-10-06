import * as cheerio from 'cheerio';
import { getText } from '../lib/http.js';
import { parsePrice } from '../lib/price.js';
import { delay } from '../lib/http.js';

const BASE = 'https://www.mexx.com.ar/productos-rubro/placas-de-video/';

export default {
  key: 'mexx',
  async fetch({ maxPages = 3 } = {}) {
    const items = [];
    for (let page = 1; page <= maxPages; page++) {
      const url = page === 1 ? BASE : `${BASE}?pagina=${page}`;
      const html = await getText(url);
      const $ = cheerio.load(html);
      const found = [];
      $('.productos').each((_, el) => {
        const card = $(el);
        const link = card.find('.card-title a').first();
        const name = link.text().trim();
        const href = link.attr('href') || '';
        const price = parsePrice(card.find('.price b').first().text());
        if (!name || !href || !price) return;
        const img = card.find('img').first().attr('src') || '';
        found.push({
          store: 'mexx',
          id: (href.match(/\/(\d+)-[^/]*\.html/) || [])[1] || href,
          name,
          price,
          url: absolute(href),
          image: img ? absolute(img) : ''
        });
      });
      items.push(...found);
      if (found.length === 0 || page === maxPages) break;
      await delay(700);
    }
    return dedupe(items);
  }
};

const absolute = (href) => (href.startsWith('http') ? href : `https://www.mexx.com.ar${href}`);

function dedupe(items) {
  const seen = new Set();
  return items.filter((it) => (seen.has(it.id) ? false : (seen.add(it.id), true)));
}
