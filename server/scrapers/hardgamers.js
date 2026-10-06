import * as cheerio from 'cheerio';
import { getText } from '../lib/http.js';
import { parsePrice } from '../lib/price.js';
import { delay } from '../lib/http.js';

const BASE = 'https://www.hardgamers.com.ar/search?category=placas-de-video';

const HG_TO_STORE = {
  'compragamer': 'compragamer',
  'compra gamer': 'compragamer',
  'mexx': 'mexx',
  'venex': 'venex',
  'gezatek': 'gezatek',
  'full h4rd': 'fullhard',
  'fullhard': 'fullhard',
  'full h4rd.': 'fullhard',
  'malditohard': 'malditohard',
  'maldito hard': 'malditohard'
};

export default {
  key: 'hardgamers',
  async fetch({ maxPages = 4, covered = [] } = {}) {
    const items = [];
    for (let page = 1; page <= maxPages; page++) {
      const url = page === 1 ? BASE : `${BASE}&page=${page}`;
      const html = await getText(url, { headers: { referer: 'https://www.hardgamers.com.ar/' } });
      const $ = cheerio.load(html);
      const found = [];
      $('article.One-Bit-Product').each((_, el) => {
        const card = $(el);
        const name = card.find('.product-name').first().text().trim();
        const storeName = card.find('.store').first().text().trim();
        const price = parsePrice(card.find('[itemprop="price"]').first().attr('content') || card.find('[itemprop="price"]').first().text());
        const href = card.find('a[href*="/product/"]').first().attr('href') || '';
        const availability = card.find('link[itemprop="availability"]').attr('href') || '';
        if (!name || !href || !price) return;
        if (availability && !/InStock|PreOrder|LimitedAvailability/i.test(availability)) return;

        const coveredKey = HG_TO_STORE[normalize(storeName)];
        if (coveredKey && covered.includes(coveredKey)) return;

        const img = card.find('img[itemprop="image"]').first().attr('src') || '';
        found.push({
          store: 'hardgamers',
          id: href.replace('https://www.hardgamers.com.ar', '').replace('/product/', ''),
          name,
          price,
          url: href.startsWith('http') ? href : `https://www.hardgamers.com.ar${href}`,
          source: storeName,
          image: img ? (img.startsWith('http') ? img : `https://www.hardgamers.com.ar${img}`) : ''
        });
      });
      items.push(...found);
      if (found.length === 0 || page === maxPages) break;
      await delay(900);
    }
    return dedupe(items);
  }
};

const normalize = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

function dedupe(items) {
  const seen = new Set();
  return items.filter((it) => (seen.has(it.id) ? false : (seen.add(it.id), true)));
}
