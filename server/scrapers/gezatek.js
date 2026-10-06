import { getText } from '../lib/http.js';
import { extractJsonLdProducts } from '../lib/jsonld.js';
import { delay } from '../lib/http.js';

const PAGES = [
  'https://gezatek.com.ar/placas-de-video/',
  'https://gezatek.com.ar/placas-de-video/placas-de-video-nvidia/',
  'https://gezatek.com.ar/placas-de-video/placas-de-video-amd/'
];

export default {
  key: 'gezatek',
  async fetch({ maxPages = 3 } = {}) {
    const items = [];
    const pages = PAGES.slice(0, Math.max(1, maxPages));
    for (let i = 0; i < pages.length; i++) {
      const url = pages[i];
      const html = await getText(url);
      for (const p of extractJsonLdProducts(html)) {
        if (!p.price || !p.inStock) continue;
        const id = (p.url.match(/-(\d+)\.html$/) || [])[1] || p.url;
        items.push({
          store: 'gezatek',
          id,
          name: p.name,
          price: Math.round(p.price),
          url: p.url,
          image: p.image || ''
        });
      }
      if (i < pages.length - 1) await delay(700);
    }
    return dedupe(items);
  }
};

function dedupe(items) {
  const seen = new Set();
  return items.filter((it) => (seen.has(it.id) ? false : (seen.add(it.id), true)));
}
