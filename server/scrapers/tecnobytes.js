import * as cheerio from 'cheerio';
import { getText } from '../lib/http.js';
import { parsePrice } from '../lib/price.js';

const ORIGIN = 'https://www.tecnobytestore.com.ar';
const BASE = `${ORIGIN}/ARTICULOS/PLACAS-DE-VIDEO/CAT_ID=68/SCAT_ID=4017/m=0/BUS=;/tecnobytestore.aspx`;

export default {
  key: 'tecnobytes',
  async fetch() {
    const html = await getText(BASE, { timeout: 30000 });
    const $ = cheerio.load(html);
    const items = [];

    $('.product').each((_, el) => {
      const card = $(el);
      const link = card.find('.description h4 a.titprod').first().length
        ? card.find('.description h4 a.titprod').first()
        : card.find('a[href*="DETALLE"]').first();
      const href = link.attr('href') || '';
      const name = link.text().replace(/\s+/g, ' ').trim() || card.find('img').first().attr('alt') || '';
      const price = parsePrice(card.find('.price').first().text());
      if (!name || !href || !price) return;

      const stock = card.find('.muestraStock4').first();
      if (stock.length && !/display\s*:\s*none/i.test(stock.attr('style') || '')) return;

      const img = card.find('.image img').first().attr('src') || '';
      items.push({
        store: 'tecnobytes',
        id: (href.match(/ITEM_ID=(\d+)/) || [])[1] || href,
        name,
        price,
        url: href.startsWith('http') ? href : ORIGIN + href,
        image: img.startsWith('http') ? img : img ? ORIGIN + (img.startsWith('/') ? img : `/${img}`) : ''
      });
    });

    return dedupe(items);
  }
};

function dedupe(items) {
  const seen = new Set();
  return items.filter((it) => (seen.has(it.id) ? false : (seen.add(it.id), true)));
}
