import * as cheerio from 'cheerio';
import { getText } from '../lib/http.js';
import { parsePrice } from '../lib/price.js';

const BASE = 'https://710tech.com.ar';
const CATEGORY = '/placas-de-video/usado/';

export default {
  key: '710tech',
  async fetch() {
    const html = await getText(`${BASE}${CATEGORY}`);
    const $ = cheerio.load(html);
    const items = [];

    $('.card-ecommerce').each((_, el) => {
      const card = $(el);
      const link = card.find('.card-title a').first();
      const name = link.text().replace(/\s+/g, ' ').trim();
      const href = link.attr('href') || '';
      const priceEl = card.find('.price .pecio_final').first();
      const price = parsePrice(priceEl.attr('data-precio') || priceEl.text());
      if (!name || !href || !price) return;

      const img = card.find('img.img-fluid').first().attr('src') || card.find('img').first().attr('src') || '';
      items.push({
        store: '710tech',
        id: (href.match(/-(\d+)\.html$/) || [])[1] || href,
        name,
        price,
        url: href.startsWith('http') ? href : `${BASE}${href}`,
        image: img ? (img.startsWith('http') ? img : `${BASE}${img}`) : '',
        us: 1
      });
    });

    return dedupe(items);
  }
};

function dedupe(items) {
  const seen = new Set();
  return items.filter((it) => (seen.has(it.id) ? false : (seen.add(it.id), true)));
}
