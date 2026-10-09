import * as cheerio from 'cheerio';
import { getText } from '../lib/http.js';
import { parsePrice } from '../lib/price.js';
import { delay } from '../lib/http.js';

const BASE = 'https://fullh4rd.com.ar/placas-de-video';

const BROWSER_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'accept-language': 'es-AR,es;q=0.9,en-US;q=0.8,en;q=0.7',
  'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'upgrade-insecure-requests': '1',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'sec-fetch-user': '?1'
};

export default {
  key: 'fullhard',
  async fetch({ maxPages = 4 } = {}) {
    const items = [];
    for (let page = 1; page <= maxPages; page++) {
      const url = page === 1 ? BASE : `${BASE}?page=${page}`;
      const html = await getText(url, { headers: BROWSER_HEADERS });
      const $ = cheerio.load(html);
      const found = [];
      $('.results-card').each((_, el) => {
        const card = $(el);
        const link = card.find('.results-card__title-link').first();
        const name = link.text().trim();
        const href = link.attr('href') || '';
        const price = parsePrice(card.find('.results-card__price-current').first().text());
        if (!name || !href || !price) return;
        const img = card.find('img.results-card__image').first().attr('src') || '';
        const rawUrl = href.startsWith('http') ? href : `https://fullh4rd.com.ar${href}`;
        found.push({
          store: 'fullhard',
          id: (href.match(/\/prod\/(\d+)\//) || [])[1] || href,
          name,
          price,
          url: rawUrl.split('?')[0],
          image: img ? (img.startsWith('http') ? img : `https://fullh4rd.com.ar${img}`) : ''
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
