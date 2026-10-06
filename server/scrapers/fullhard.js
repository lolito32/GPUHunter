import * as cheerio from 'cheerio';
import { getText } from '../lib/http.js';
import { parsePrice } from '../lib/price.js';
import { delay } from '../lib/http.js';

const BASE = 'https://fullh4rd.com.ar/placas-de-video';

export default {
  key: 'fullhard',
  async fetch({ maxPages = 4 } = {}) {
    const items = [];
    for (let page = 1; page <= maxPages; page++) {
      const url = page === 1 ? BASE : `${BASE}?page=${page}`;
      const html = await getText(url);
      const $ = cheerio.load(html);
      const found = [];
      $('.results-card').each((_, el) => {
        const card = $(el);
        const link = card.find('.results-card__title-link').first();
        const name = link.text().trim();
        const href = link.attr('href') || '';
        const price = parsePrice(card.find('.results-card__price-current').first().text());
        if (!name || !href || !price) return;
        found.push({
          store: 'fullhard',
          id: (href.match(/\/prod\/(\d+)\//) || [])[1] || href,
          name,
          price,
          url: href.startsWith('http') ? href : `https://fullh4rd.com.ar${href}`
        });
      });
      items.push(...found);
      if (found.length === 0 || page === maxPages) break;
      await delay(800);
    }
    return dedupe(items);
  }
};

function dedupe(items) {
  const seen = new Set();
  return items.filter((it) => (seen.has(it.id) ? false : (seen.add(it.id), true)));
}
