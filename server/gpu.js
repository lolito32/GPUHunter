const ACCENTS = /[\u0300-\u036f]/g;

const POSITIVE =
  /\b(PLACAS?\s*DE\s*VIDEO|VGA|GPU|TARJETAS?\s*DE\s*VIDEO|GRAPHIC\s*CARD|VIDEO\s*CARD|PLACA\s*DE\s*FOTOS)\b/;

const NEGATIVE =
  /\b(NOTEBOOK|LAPTOP|MONITOR|AURICULAR|HEADSET|TECLADO|KEYBOARD|MOUSE|RATON|GABINETE|CASE|FUENTE|IMPRESORA|TABLET|CELULAR|SMARTPHONE|CONSOLA|SILLAS?|PARLANTE|WEBCAM|STICK|JOYSTICK|MEMORIA|DISCO|SSD|HDD|MOTHERBOARDS?|PROCESADOR|CPU|WATERCOOL|CAPTURADORA|ROUTER|SERVIDOR|PROYECTOR|CABLE|ADAPTADOR|CONEXION|CONVERSOR|EXTENSOR|BRACKET|SOPORTE|FALLA|OUTLET|USADO|REACOND|COMBO|BUNDLE|ARMADA|NOTEBOOKS|AUDIFONO|WEB\s*CAM|ALARMA|CELULARES|TABS?|SMARTWATCH|DRONE|CONSOLAS|JUEGOS|VIDEOJUEGOS)\b/;

const NVIDIA = /\b(?:GEFORCE\s*)?(RTX|GTX|GT)\s*(\d{3,4})\s*(TI|SUPER)?\b/;
const AMD = /\b(?:RADEON\s*|AMD\s*)?RX\s*(\d{3,4})\s*(XTX|XT|XTXW)?\b/;
const INTEL = /\bARC\s*(A|B)\s*(\d{3})\b/;

export function normalizeName(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(ACCENTS, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const GTX_LEGACY = new Set(['750', '760', '770', '780', '950', '960', '970', '980']);

export function isSupportedGpu(key) {
  const parts = String(key || '').toLowerCase().split('-').filter(Boolean);
  const family = parts[0];
  const num = parts[1] || '';
  if (family === 'rtx') return true;
  if (family === 'gtx') {
    if (GTX_LEGACY.has(num)) return false;
    return num.length >= 4;
  }
  if (family === 'gt') return false;
  if (family === 'rx') {
    if (num.length >= 4) return true;
    const n = Number(num);
    return Number.isFinite(n) && n >= 570;
  }
  if (family === 'arc') return true;
  return false;
}

export function detectGpu(rawName) {
  const name = normalizeName(rawName);
  if (!name) return null;
  if (NEGATIVE.test(name)) return null;

  const intel = name.match(INTEL);
  if (intel) {
    const key = `arc-${intel[1].toLowerCase()}${intel[2]}`;
    return isSupportedGpu(key) ? { key, label: `ARC ${intel[1]}${intel[2]}` } : null;
  }

  const nvidia = name.match(NVIDIA);
  if (nvidia) {
    const brand = nvidia[1];
    const suffix = nvidia[3] ? ` ${nvidia[3]}` : '';
    const key = `${brand.toLowerCase()}-${nvidia[2]}${nvidia[3] ? '-' + nvidia[3].toLowerCase() : ''}`;
    return isSupportedGpu(key) ? { key, label: `${brand} ${nvidia[2]}${suffix}` } : null;
  }

  const amd = name.match(AMD);
  if (amd) {
    const suffix = amd[2] && amd[2] !== 'X' ? ` ${amd[2]}` : '';
    const key = `rx-${amd[1]}${amd[2] && amd[2] !== 'X' ? '-' + amd[2].toLowerCase() : ''}`;
    return isSupportedGpu(key) ? { key, label: `RX ${amd[1]}${suffix}` } : null;
  }

  if (POSITIVE.test(name)) return null;
  return null;
}

export function looksLikeVideoCard(rawName) {
  const name = normalizeName(rawName);
  if (NEGATIVE.test(name)) return false;
  if (POSITIVE.test(name)) return true;
  return Boolean(name.match(NVIDIA) || name.match(AMD) || name.match(INTEL));
}

const LABEL_PREFIXES = ['RTX', 'GTX', 'GT', 'RX', 'ARC'];

export function labelForKey(key) {
  const parts = String(key || '').split('-').filter(Boolean);
  if (!parts.length) return '';
  const idx = parts.findIndex((p) => LABEL_PREFIXES.includes(p.toUpperCase()));
  if (idx < 0) return String(key).toUpperCase();
  return parts.slice(idx).map((p) => p.toUpperCase()).join(' ');
}
