import * as cheerio from 'cheerio';

function walk(node, out) {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const n of node) walk(n, out);
    return;
  }
  if (typeof node !== 'object') return;
  out.push(node);
  for (const value of Object.values(node)) walk(value, out);
}

function priceOf(node) {
  const offers = node.offers;
  if (!offers) return null;
  const list = Array.isArray(offers) ? offers : [offers];
  for (const offer of list) {
    const price = offer.price ?? offer.lowPrice ?? offer.highPrice;
    if (price !== undefined && price !== null) return Number(price);
  }
  return null;
}

export function extractJsonLd(html) {
  const $ = cheerio.load(html);
  const nodes = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).html();
    if (!raw) return;
    try {
      walk(JSON.parse(raw), nodes);
    } catch {
      // bloque malformado: se ignora
    }
  });
  return nodes;
}

export function extractJsonLdProducts(html) {
  const items = [];
  for (const node of extractJsonLd(html)) {
    const type = node['@type'];
    if (type === 'Product' && node.name && node.url) {
      items.push({
        name: node.name,
        url: node.url,
        price: priceOf(node),
        inStock: !node.offers || availabilityOk(node.offers),
        image: firstImage(node.image)
      });
    }
    if (type === 'ItemList' && Array.isArray(node.itemListElement)) {
      for (const entry of node.itemListElement) {
        const item = entry.item || entry;
        if (!item || !item.name || !item.url) continue;
        items.push({
          name: item.name,
          url: item.url,
          price: priceOf(item),
          inStock: !item.offers || availabilityOk(item.offers),
          image: firstImage(item.image) || firstImage(entry.image)
        });
      }
    }
  }
  return items;
}

function firstImage(image) {
  if (!image) return '';
  const value = Array.isArray(image) ? image[0] : image;
  if (typeof value === 'string') return value;
  if (value && typeof value.url === 'string') return value.url;
  return '';
}

function availabilityOk(offers) {
  const list = Array.isArray(offers) ? offers : [offers];
  return list.some((offer) => {
    const availability = typeof offer.availability === 'string' ? offer.availability : '';
    return !availability || /InStock|PreOrder|LimitedAvailability/i.test(availability);
  });
}
