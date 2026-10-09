import * as cheerio from 'cheerio';
import { getText, delay } from '../lib/http.js';
import { parsePrice } from '../lib/price.js';

const BASE = 'https://www.maximus.com.ar/Productos/Placas-De-Video/maximus.aspx';
const PAGE_URL = (page) => `${BASE}?/CAT=48/SCAT=-1/M=-1/OR=1/PAGE=${page}/`;

export default {
  key: 'maximus',
  async fetch({ maxPages = 3 } = {}) {
    const items = [];
    for (let page = 1; page <= maxPages; page++) {
      const html = await getText(PAGE_URL(page));
      const $ = cheerio.load(html);
      const found = [];
      $('a.mxCardProduct__link[href*="ITEM="]').each((_, el) => {
        const card = $(el);
        const href = card.attr('href') || '';
        const name = card.find('.mxCardProduct__title').first().text().replace(/\s+/g, ' ').trim();
        const price = parsePrice(card.find('.mxCardProduct__price').first().text());
        if (!name || !href || !price) return;
        const img = card.find('img.mxCardProduct__image').first().attr('src') || '';
        found.push({
          store: 'maximus',
          id: (href.match(/ITEM=(\d+)/) || [])[1] || href,
          name,
          price,
          url: href.startsWith('http') ? href : `https://www.maximus.com.ar${href}`,
          image: img ? (img.startsWith('http') ? img : `https://www.maximus.com.ar${img}`) : ''
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
