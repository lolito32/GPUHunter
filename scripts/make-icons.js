import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'icons');
mkdirSync(OUT, { recursive: true });

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })());
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    pixels.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function icon(size, maskable) {
  const px = Buffer.alloc(size * size * 4);
  const pad = maskable ? size * 0.12 : 0;
  const r = Math.round(size * (maskable ? 0.12 : 0.22));
  const x0 = Math.round(pad);
  const y0 = Math.round(pad);
  const x1 = Math.round(size - pad);
  const y1 = Math.round(size - pad);
  const rr = maskable ? Math.round(r * 0.6) : r;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const cx = Math.max(x0 + rr, Math.min(x1 - rr, x));
      const cy = Math.max(y0 + rr, Math.min(y1 - rr, y));
      const inside = x >= x0 && x < x1 && y >= y0 && y < y1;
      const rounded = inside && (x - cx) ** 2 + (y - cy) ** 2 <= rr * rr;
      if (!rounded) {
        px[i] = 12;
        px[i + 1] = 13;
        px[i + 2] = 14;
        px[i + 3] = maskable ? 255 : 0;
        continue;
      }
      const relX = (x - x0) / Math.max(1, x1 - x0 - 1);
      const relY = (y - y0) / Math.max(1, y1 - y0 - 1);

      const cardX0 = x0 + (x1 - x0) * 0.14;
      const cardX1 = x1 - (x1 - x0) * 0.14;
      const cardY0 = y0 + (y1 - y0) * 0.3;
      const cardY1 = y1 - (y1 - y0) * 0.3;
      const border = Math.max(1, size * 0.035);
      const inCard = x >= cardX0 && x <= cardX1 && y >= cardY0 && y <= cardY1;

      const fanCx = cardX0 + (cardX1 - cardX0) * 0.3;
      const fanCy = (cardY0 + cardY1) / 2;
      const fanR = (cardY1 - cardY0) * 0.3;
      const inFan = (x - fanCx) ** 2 + (y - fanCy) ** 2 <= fanR * fanR;

      const pinY0 = cardY1 - (cardY1 - cardY0) * 0.06;
      const pinY1 = cardY1;
      const inPin = y >= pinY0 && y <= pinY1 && x >= cardX1 - (cardX1 - cardX0) * 0.18 && x <= cardX1 - (cardX1 - cardX0) * 0.06;
      const inSlot = x >= cardX1 - (cardX1 - cardX0) * 0.5 && x <= cardX1 - (cardX1 - cardX0) * 0.36 && y >= fanCy - fanR * 0.55 && y <= fanCy + fanR * 0.55;

      let color = [24, 25, 28];
      if (inCard) color = [24, 25, 28];
      if (inCard && (x - cardX0 <= border || cardX1 - x <= border || y - cardY0 <= border || cardY1 - y <= border))
        color = [237, 237, 237];
      if (inFan) color = [113, 113, 122];
      if (inSlot || inPin) color = [237, 237, 237];

      px[i] = color[0];
      px[i + 1] = color[1];
      px[i + 2] = color[2];
      px[i + 3] = 255;
      void relX;
      void relY;
    }
  }
  return encodePNG(size, size, px);
}

writeFileSync(join(OUT, 'icon-192.png'), icon(192, false));
writeFileSync(join(OUT, 'icon-512.png'), icon(512, false));
writeFileSync(join(OUT, 'icon-512-maskable.png'), icon(512, true));
console.log('iconos generados en', OUT);
