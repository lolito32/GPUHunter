import * as cheerio from 'cheerio';
import { getText, delay } from '../lib/http.js';
import { parsePrice } from '../lib/price.js';

const BASE = 'https://710tech.com.ar';
const CATEGORY = '/placas-de-video/usado/';

export default {
  key: '710tech',
  async fetch({ maxPages = 3 } = {}) {
    const items = [];
    for (let page = 1; page <= maxPages; page++) {
      const url = page === 1 ? `${BASE}${CATEGORY}` : `${BASE}${CATEGORY}?page=${page}`;
      const html = await getText(url);
      const $ = cheerio.load(html);
      const found = [];
      // FIXME: reemplazar los selectores por la estructura HTML real de 710tech.
      $('.product-item, .product-card, [itemtype="https://schema.org/Product"]').each((_, el) => {
        const card = $(el);
        const link = card.find('.product-name a, [itemprop="name"] a, h2 a, h3 a').first();
        const name = (link.text() || card.find('.product-name, [itemprop="name"], h2, h3').first().text())
          .replace(/\s+/g, ' ')
          .trim();
        const href = link.attr('href') || card.find('a[href]').first().attr('href') || '';
        const price = parsePrice(
          card.find('[itemprop="price"]').attr('content') || card.find('.price, .product-price, .precio').first().text()
        );
        if (!name || !href || !price) return;
        const img = card.find('img').first().attr('src') || card.find('img').first().attr('data-src') || '';
        const absHref = href.startsWith('http') ? href : `${BASE}${href}`;
        found.push({
          store: '710tech',
          id: (absHref.match(/([^/]+)\/?$/) || [])[1] || absHref,
          name,
          price,
          url: absHref,
          image: img ? (img.startsWith('http') ? img : `${BASE}${img}`) : '',
          us: 1
        });
      });
      items.push(...found);
      if (found.length === 0 || page === maxPages) break;
      await delay(700);
    }
    return dedupe(items);
  }
};

function dedupe(items) {
  const seen = new Set();
  return items.filter((it) => (seen.has(it.id) ? false : (seen.add(it.id), true)));
}
