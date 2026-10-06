import * as cheerio from 'cheerio';
import { getText } from '../lib/http.js';
import { parsePrice } from '../lib/price.js';
import { extractJsonLdProducts } from '../lib/jsonld.js';

const CANDIDATES = [
  'https://www.malditohard.com.ar/placas-de-video',
  'https://www.malditohard.com.ar/categoria/placas-de-video',
  'https://www.malditohard.com.ar/componentes/placas-de-video'
];

export default {
  key: 'malditohard',
  async fetch() {
    const items = [];
    for (const url of CANDIDATES) {
      let html;
      try {
        html = await getText(url, { timeout: 20000, retries: 0 });
      } catch {
        continue;
      }
      for (const p of extractJsonLdProducts(html)) {
        if (!p.price || !p.inStock) continue;
        items.push({
          store: 'malditohard',
          id: (p.url.match(/-(\d+)(?:\.html)?$/) || [])[1] || p.url,
          name: p.name,
          price: Math.round(p.price),
          url: p.url
        });
      }
      if (items.length === 0) items.push(...fallback(html, url));
      if (items.length > 0) break;
    }
    return dedupe(items);
  }
};

function fallback(html, baseUrl) {
  const $ = cheerio.load(html);
  const items = [];
  $('[itemtype="https://schema.org/Product"], .product-item, .product-card, .item-product').each((_, el) => {
    const root = $(el);
    const name = root.find('[itemprop="name"], .product-name, .product-title, h2, h3').first().text().trim();
    const price = parsePrice(root.find('[itemprop="price"], .price, .product-price').first().attr('content') || root.find('[itemprop="price"], .price, .product-price').first().text());
    const href = root.find('a[href]').first().attr('href') || '';
    if (!name || !price) return;
    const url = href.startsWith('http') ? href : new URL(href, baseUrl).toString();
    items.push({
      store: 'malditohard',
      id: (url.match(/-(\d+)(?:\.html)?$/) || [])[1] || url,
      name,
      price,
      url
    });
  });
  return items;
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((it) => (seen.has(it.id) ? false : (seen.add(it.id), true)));
}
