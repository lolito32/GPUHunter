const ACCENTS = /[\u0300-\u036f]/g;

const POSITIVE =
  /\b(PLACAS?\s*DE\s*VIDEO|VGA|GPU|TARJETAS?\s*DE\s*VIDEO|GRAPHIC\s*CARD|VIDEO\s*CARD|PLACA\s*DE\s*FOTOS)\b/;

const NEGATIVE =
  /\b(NOTEBOOK|LAPTOP|MONITOR|AURICULAR|HEADSET|TECLADO|KEYBOARD|MOUSE|RATON|GABINETE|CASE|FUENTE|IMPRESORA|TABLET|CELULAR|SMARTPHONE|CONSOLA|SILLAS?|PARLANTE|WEBCAM|STICK|JOYSTICK|MEMORIA|DISCO|SSD|HDD|MOTHERBOARDS?|PROCESADOR|CPU|WATERCOOL|CAPTURADORA|ROUTER|SERVIDOR|PROYECTOR|CABLE|ADAPTADOR|BRACKET|SOPORTE|FALLA|OUTLET|USADO|REACOND|COMBO|BUNDLE|ARMADA|NOTEBOOKS|AUDIFONO|WEB\s*CAM|ALARMA|CELULARES|TABS?|SMARTWATCH|DRONE|CONSOLAS|JUEGOS|VIDEOJUEGOS)\b/;

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

export function detectGpu(rawName) {
  const name = normalizeName(rawName);
  if (!name) return null;
  if (NEGATIVE.test(name)) return null;

  const intel = name.match(INTEL);
  if (intel) {
    const key = `arc-${intel[1].toLowerCase()}${intel[2]}`;
    return { key, label: `ARC ${intel[1]}${intel[2]}` };
  }

  const nvidia = name.match(NVIDIA);
  if (nvidia) {
    const brand = nvidia[1];
    const suffix = nvidia[3] ? ` ${nvidia[3]}` : '';
    const key = `${brand.toLowerCase()}-${nvidia[2]}${nvidia[3] ? '-' + nvidia[3].toLowerCase() : ''}`;
    return { key, label: `${brand} ${nvidia[2]}${suffix}` };
  }

  const amd = name.match(AMD);
  if (amd) {
    const suffix = amd[2] && amd[2] !== 'X' ? ` ${amd[2]}` : '';
    const key = `rx-${amd[1]}${amd[2] && amd[2] !== 'X' ? '-' + amd[2].toLowerCase() : ''}`;
    return { key, label: `RX ${amd[1]}${suffix}` };
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

export function labelForKey(key) {
  const [, brand, model, suffix] = String(key).split('-');
  if (!brand || !model) return key.toUpperCase();
  const base = brand.toUpperCase() + ' ' + model;
  return suffix ? `${base} ${suffix.toUpperCase()}` : base;
}
