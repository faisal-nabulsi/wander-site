/* ==========================================================================
   Coordinate Converter - core logic
   https://wanderspoofer.com/tools/coordinate-converter/

   Pure functions only. No DOM, no network, no dependencies. The same file runs
   in the browser (loaded by index.html) and in Node (loaded by the tests).

   Conventions
   - A location is { lat, lon } in decimal degrees (WGS84).
   - Open Location Code (Plus Code) follows the open specification at
     https://github.com/google/open-location-code/blob/main/Documentation/Specification/specification.md
     and is checked against the project's official test data.
   - Geohash follows the public-domain algorithm published by Gustavo Niemeyer
     in 2008 (base 32 alphabet 0123456789bcdefghjkmnpqrstuvwxyz).
   ========================================================================== */

export const METRES_PER_DEGREE = 111321; // the figure the Plus Code spec uses for its size table

/* --------------------------------------------------------------------------
   Small helpers
   -------------------------------------------------------------------------- */

/** Round half away from zero to `decimals` places and never return -0. */
export function roundTo(x, decimals) {
  const f = 10 ** decimals;
  const r = (Math.sign(x) * Math.round(Math.abs(x) * f)) / f;
  return r === 0 ? 0 : r;
}

/** Fixed-decimal string with no "-0.000000". */
export function fixed(x, decimals) {
  return roundTo(x, decimals).toFixed(decimals);
}

/**
 * floor(x * scale) computed exactly from the decimal form of x.
 * Plain floating point gives answers one too low for inputs such as 80.00999996
 * (the double is a hair under the decimal you typed). Working from the shortest
 * decimal string of the number gives the answer for the value as written.
 * `scale` must be a positive integer.
 */
export function exactFloorScaled(x, scale) {
  if (!Number.isFinite(x)) throw new Error('Not a finite number');
  const s = String(x).toLowerCase();
  const m = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/.exec(s);
  if (!m) return Math.floor(x * scale); // not reachable for finite numbers, kept as a guard
  const neg = m[1] === '-';
  const frac = m[3] || '';
  let digits = BigInt(m[2] + frac);
  let exp10 = -frac.length + (m[4] ? Number(m[4]) : 0);
  let num = digits * BigInt(scale);
  let den = 1n;
  if (exp10 >= 0) num *= 10n ** BigInt(exp10);
  else den = 10n ** BigInt(-exp10);
  let q = num / den; // truncates toward zero; num is non-negative here
  const exact = q * den === num;
  if (neg) {
    q = -q;
    if (!exact) q -= 1n; // floor for negatives
  }
  return Number(q);
}

/* --------------------------------------------------------------------------
   Open Location Code (Plus Codes)
   -------------------------------------------------------------------------- */

export const OLC_ALPHABET = '23456789CFGHJMPQRVWX';
const OLC_SEPARATOR = '+';
const OLC_SEPARATOR_POSITION = 8;
const OLC_PADDING = '0';
const OLC_BASE = 20;
const OLC_PAIR_LENGTH = 10;
const OLC_MAX_DIGITS = 15;
const OLC_MIN_DIGITS = 2;
const OLC_GRID_ROWS = 5;
const OLC_GRID_COLS = 4;
const OLC_GRID_LENGTH = OLC_MAX_DIGITS - OLC_PAIR_LENGTH; // 5
const OLC_PAIR_PRECISION = OLC_BASE ** 3; // 8000
const OLC_LAT_PRECISION = OLC_PAIR_PRECISION * OLC_GRID_ROWS ** OLC_GRID_LENGTH; // 25,000,000
const OLC_LNG_PRECISION = OLC_PAIR_PRECISION * OLC_GRID_COLS ** OLC_GRID_LENGTH; // 8,192,000
const OLC_PAIR_RESOLUTIONS = [20.0, 1.0, 0.05, 0.0025, 0.000125];
const OLC_MIN_TRIMMABLE = 6;

export const OLC_LENGTHS = Object.freeze([2, 4, 6, 8, 10, 11, 12, 13, 14, 15]);

/** True if `code` is a valid full or short Plus Code (case-insensitive). */
export function olcIsValid(code) {
  if (typeof code !== 'string' || code.length < 2) return false;
  const sep = code.indexOf(OLC_SEPARATOR);
  if (sep === -1 || sep !== code.lastIndexOf(OLC_SEPARATOR)) return false;
  if (sep > OLC_SEPARATOR_POSITION || sep % 2 === 1) return false;
  const pad = code.indexOf(OLC_PADDING);
  if (pad > -1) {
    if (sep < OLC_SEPARATOR_POSITION) return false; // short codes cannot be padded
    if (pad === 0) return false;
    const groups = code.match(/0+/g);
    if (groups.length > 1 || groups[0].length % 2 === 1 || groups[0].length > OLC_SEPARATOR_POSITION - 2) return false;
    if (code[code.length - 1] !== OLC_SEPARATOR) return false;
  }
  if (code.length - sep - 1 === 1) return false; // a single digit after "+" is not allowed
  const rest = code.replace(OLC_SEPARATOR, '').replace(/0+/, '');
  for (const ch of rest.toUpperCase()) {
    if (OLC_ALPHABET.indexOf(ch) === -1) return false;
  }
  return true;
}

/** True if `code` is a valid short code (fewer than 8 digits before "+"). */
export function olcIsShort(code) {
  return olcIsValid(code) && code.indexOf(OLC_SEPARATOR) < OLC_SEPARATOR_POSITION;
}

/** True if `code` is a valid full code. */
export function olcIsFull(code) {
  if (!olcIsValid(code) || olcIsShort(code)) return false;
  const up = code.toUpperCase();
  if (OLC_ALPHABET.indexOf(up[0]) * OLC_BASE >= 180) return false;
  if (OLC_ALPHABET.indexOf(up[1]) * OLC_BASE >= 360) return false;
  return true;
}

/** Latitude and longitude as the integers the encoder works with. Exposed for tests. */
export function olcLocationToIntegers(lat, lon) {
  let latVal = exactFloorScaled(lat, OLC_LAT_PRECISION) + 90 * OLC_LAT_PRECISION;
  const latMax = 180 * OLC_LAT_PRECISION;
  if (latVal < 0) latVal = 0;
  else if (latVal >= latMax) latVal = latMax - 1;
  let lngVal = exactFloorScaled(lon, OLC_LNG_PRECISION) + 180 * OLC_LNG_PRECISION;
  const lngMax = 360 * OLC_LNG_PRECISION;
  lngVal = ((lngVal % lngMax) + lngMax) % lngMax;
  return [latVal, lngVal];
}

/** Encode the integer form of a location. Exposed for tests. */
export function olcEncodeIntegers(latInt, lngInt, length = 10) {
  length = Math.min(OLC_MAX_DIGITS, Math.floor(Number(length)));
  if (!Number.isFinite(length) || length < OLC_MIN_DIGITS || (length < OLC_PAIR_LENGTH && length % 2 === 1)) {
    throw new Error('Invalid Plus Code length');
  }
  const code = new Array(OLC_MAX_DIGITS);
  // grid digits, least significant first
  for (let i = OLC_GRID_LENGTH - 1; i >= 0; i--) {
    const row = latInt % OLC_GRID_ROWS;
    const col = lngInt % OLC_GRID_COLS;
    code[OLC_PAIR_LENGTH + i] = OLC_ALPHABET[row * OLC_GRID_COLS + col];
    latInt = Math.floor(latInt / OLC_GRID_ROWS);
    lngInt = Math.floor(lngInt / OLC_GRID_COLS);
  }
  // pair digits, least significant pair first
  for (let i = OLC_PAIR_LENGTH / 2 - 1; i >= 0; i--) {
    code[i * 2] = OLC_ALPHABET[latInt % OLC_BASE];
    code[i * 2 + 1] = OLC_ALPHABET[lngInt % OLC_BASE];
    latInt = Math.floor(latInt / OLC_BASE);
    lngInt = Math.floor(lngInt / OLC_BASE);
  }
  const digits = code.slice(0, length).join('');
  if (length >= OLC_SEPARATOR_POSITION) {
    return digits.slice(0, OLC_SEPARATOR_POSITION) + OLC_SEPARATOR + digits.slice(OLC_SEPARATOR_POSITION);
  }
  return digits + OLC_PADDING.repeat(OLC_SEPARATOR_POSITION - length) + OLC_SEPARATOR;
}

/** Encode a location as a full Plus Code. Latitude is clipped, longitude wrapped. */
export function olcEncode(lat, lon, length = 10) {
  lat = Number(lat);
  lon = Number(lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('Latitude and longitude must be numbers');
  const [a, b] = olcLocationToIntegers(lat, lon);
  return olcEncodeIntegers(a, b, length);
}

/**
 * Decode a full Plus Code into the cell it names:
 * { latLo, lonLo, latHi, lonHi, lat, lon, length } where lat/lon is the centre.
 * Digits after the 15th are ignored, as the specification says.
 */
export function olcDecode(code) {
  if (!olcIsFull(code)) throw new Error('Not a valid full Plus Code');
  const clean = code.replace(OLC_SEPARATOR, '').replace(/0+/g, '').toUpperCase();
  const len = Math.min(clean.length, OLC_MAX_DIGITS);
  // Work in the finest integer units, then convert once at the end.
  let latInt = 0;
  let lngInt = 0;
  let latUnit = OLC_LAT_PRECISION * 20; // the first pair counts in steps of 20 degrees
  let lngUnit = OLC_LNG_PRECISION * 20;
  for (let i = 0; i < Math.min(len, OLC_PAIR_LENGTH); i += 2) {
    latInt += OLC_ALPHABET.indexOf(clean[i]) * latUnit;
    lngInt += OLC_ALPHABET.indexOf(clean[i + 1]) * lngUnit;
    if (i + 2 < Math.min(len, OLC_PAIR_LENGTH)) {
      latUnit /= OLC_BASE;
      lngUnit /= OLC_BASE;
    }
  }
  for (let i = OLC_PAIR_LENGTH; i < len; i++) {
    latUnit /= OLC_GRID_ROWS;
    lngUnit /= OLC_GRID_COLS;
    const v = OLC_ALPHABET.indexOf(clean[i]);
    latInt += Math.floor(v / OLC_GRID_COLS) * latUnit;
    lngInt += (v % OLC_GRID_COLS) * lngUnit;
  }
  const latLo = latInt / OLC_LAT_PRECISION - 90;
  const lonLo = lngInt / OLC_LNG_PRECISION - 180;
  const latHi = (latInt + latUnit) / OLC_LAT_PRECISION - 90;
  const lonHi = (lngInt + lngUnit) / OLC_LNG_PRECISION - 180;
  return {
    latLo, lonLo, latHi, lonHi,
    lat: Math.min(latLo + (latHi - latLo) / 2, 90),
    lon: Math.min(lonLo + (lonHi - lonLo) / 2, 180),
    length: len,
  };
}

function clipLatitude(lat) { return Math.min(90, Math.max(-90, lat)); }
function normalizeLongitude(lon) {
  while (lon < -180) lon += 360;
  while (lon >= 180) lon -= 360;
  return lon;
}

/** Size of the area a short code has dropped, in degrees (1, 0.05 or 0.0025 for typical codes). */
export function olcShortCodeResolution(shortCode) {
  const padding = OLC_SEPARATOR_POSITION - shortCode.indexOf(OLC_SEPARATOR);
  return 20 ** (2 - padding / 2);
}

/**
 * Recover the nearest full code from a short code and a reference location.
 * A full code is returned as it is (upper case).
 */
export function olcRecoverNearest(shortCode, refLat, refLon) {
  if (!olcIsShort(shortCode)) {
    if (olcIsFull(shortCode)) return shortCode.toUpperCase();
    throw new Error('Not a valid short Plus Code');
  }
  refLat = clipLatitude(Number(refLat));
  refLon = normalizeLongitude(Number(refLon));
  if (!Number.isFinite(refLat) || !Number.isFinite(refLon)) throw new Error('Reference location must be numbers');
  const up = shortCode.toUpperCase();
  const padding = OLC_SEPARATOR_POSITION - up.indexOf(OLC_SEPARATOR);
  const resolution = 20 ** (2 - padding / 2);
  const half = resolution / 2;
  const area = olcDecode(olcEncode(refLat, refLon).slice(0, padding) + up);
  let lat = area.lat;
  let lon = area.lon;
  if (refLat + half < lat && lat - resolution >= -90) lat -= resolution;
  else if (refLat - half > lat && lat + resolution <= 90) lat += resolution;
  if (refLon + half < lon) lon -= resolution;
  else if (refLon - half > lon) lon += resolution;
  return olcEncode(lat, lon, area.length);
}

/** Shorten a full code relative to a reference location (as far as it safely can). */
export function olcShorten(code, refLat, refLon) {
  if (!olcIsFull(code)) throw new Error('Not a valid full Plus Code');
  if (code.indexOf(OLC_PADDING) !== -1) throw new Error('Padded codes cannot be shortened');
  const up = code.toUpperCase();
  const area = olcDecode(up);
  if (area.length < OLC_MIN_TRIMMABLE) throw new Error('Code is too short to shorten');
  refLat = clipLatitude(Number(refLat));
  refLon = normalizeLongitude(Number(refLon));
  const range = Math.max(Math.abs(area.lat - refLat), Math.abs(area.lon - refLon));
  for (let i = OLC_PAIR_RESOLUTIONS.length - 2; i >= 1; i--) {
    if (range < OLC_PAIR_RESOLUTIONS[i] * 0.3) return up.slice((i + 1) * 2);
  }
  return up;
}

/** Cell size in degrees for a full code of `length` digits: { dLat, dLon }. */
export function olcCellDegrees(length) {
  if (length <= OLC_PAIR_LENGTH) {
    const d = 20 / OLC_BASE ** (length / 2 - 1);
    return { dLat: d, dLon: d };
  }
  const n = length - OLC_PAIR_LENGTH;
  return { dLat: 0.000125 / OLC_GRID_ROWS ** n, dLon: 0.000125 / OLC_GRID_COLS ** n };
}

/* --------------------------------------------------------------------------
   Geohash
   -------------------------------------------------------------------------- */

export const GEOHASH_ALPHABET = '0123456789bcdefghjkmnpqrstuvwxyz';
export const GEOHASH_MAX = 12;

/** Encode a location as a geohash of `precision` characters (1 to 12). */
export function geohashEncode(lat, lon, precision = 9) {
  lat = Number(lat);
  lon = Number(lon);
  precision = Math.floor(Number(precision));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('Latitude and longitude must be numbers');
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) throw new Error('Location out of range');
  if (!(precision >= 1 && precision <= GEOHASH_MAX)) throw new Error('Precision must be 1 to 12');
  let latLo = -90, latHi = 90, lonLo = -180, lonHi = 180;
  let even = true; // even bits are longitude
  let bit = 0, ch = 0, out = '';
  while (out.length < precision) {
    if (even) {
      const mid = (lonLo + lonHi) / 2;
      if (lon >= mid) { ch = ch * 2 + 1; lonLo = mid; } else { ch *= 2; lonHi = mid; }
    } else {
      const mid = (latLo + latHi) / 2;
      if (lat >= mid) { ch = ch * 2 + 1; latLo = mid; } else { ch *= 2; latHi = mid; }
    }
    even = !even;
    if (++bit === 5) {
      out += GEOHASH_ALPHABET[ch];
      bit = 0;
      ch = 0;
    }
  }
  return out;
}

/** True if `hash` is a geohash of 1 to 12 valid characters (case-insensitive). */
export function geohashIsValid(hash) {
  return typeof hash === 'string' && /^[0-9b-hjkmnp-z]{1,12}$/i.test(hash);
}

/** Decode a geohash into its cell: { latLo, latHi, lonLo, lonHi, lat, lon, length }. */
export function geohashDecode(hash) {
  if (!geohashIsValid(hash)) throw new Error('Not a valid geohash');
  let latLo = -90, latHi = 90, lonLo = -180, lonHi = 180;
  let even = true;
  for (const c of hash.toLowerCase()) {
    const v = GEOHASH_ALPHABET.indexOf(c);
    for (let b = 4; b >= 0; b--) {
      const on = (v >> b) & 1;
      if (even) {
        const mid = (lonLo + lonHi) / 2;
        if (on) lonLo = mid; else lonHi = mid;
      } else {
        const mid = (latLo + latHi) / 2;
        if (on) latLo = mid; else latHi = mid;
      }
      even = !even;
    }
  }
  return { latLo, latHi, lonLo, lonHi, lat: (latLo + latHi) / 2, lon: (lonLo + lonHi) / 2, length: hash.length };
}

/** Cell size in degrees for a geohash of `precision` characters: { dLat, dLon }. */
export function geohashCellDegrees(precision) {
  const bits = precision * 5;
  const lonBits = Math.ceil(bits / 2);
  const latBits = Math.floor(bits / 2);
  return { dLat: 180 / 2 ** latBits, dLon: 360 / 2 ** lonBits };
}

/* --------------------------------------------------------------------------
   Sizes and formatting
   -------------------------------------------------------------------------- */

/** Approximate size in metres of a cell { dLat, dLon } at latitude `lat`. */
export function cellSizeMetres(cell, lat) {
  return {
    h: cell.dLat * METRES_PER_DEGREE,
    w: cell.dLon * METRES_PER_DEGREE * Math.cos((lat * Math.PI) / 180),
  };
}

/** "14 m", "2.8 m", "4.9 km", "37 mm". */
export function formatLength(m) {
  // Each threshold sits where the smaller unit would round up into the next one,
  // so 999.6 m reads "1.0 km", not "1000 m".
  if (m >= 9999.5) return Math.round(m / 1000).toLocaleString('en-US') + ' km';
  if (m >= 999.5) return (m / 1000).toFixed(1) + ' km';
  if (m >= 9.95) return Math.round(m) + ' m';
  if (m >= 0.995) return m.toFixed(1) + ' m';
  if (m >= 0.00995) return Math.round(m * 100) + ' cm';
  return Math.max(1, Math.round(m * 1000)) + ' mm';
}

export function formatCellSize(cell, lat) {
  const s = cellSizeMetres(cell, lat);
  // Near a pole the east-west width shrinks towards zero, so a size would mislead.
  if (Math.abs(lat) >= 89.9) return `about ${formatLength(s.h)} north to south, and very narrow east to west this close to the pole`;
  return `about ${formatLength(s.h)} north to south by ${formatLength(Math.max(s.w, 0))} east to west here`;
}

/** "40.446111, -79.982222" (6 decimal places, about 0.1 m). */
export function formatDecimal(lat, lon, decimals = 6) {
  return `${fixed(lat, decimals)}, ${fixed(lon, decimals)}`;
}

/** Split |value| into whole degrees, minutes and seconds, rounded to `decimals` of a second. */
function splitDMS(value, decimals) {
  const f = 10 ** decimals;
  const total = Math.round(Math.abs(value) * 3600 * f); // integer count of 1/f seconds
  const perDeg = 3600 * f;
  const perMin = 60 * f;
  const d = Math.floor(total / perDeg);
  const m = Math.floor((total % perDeg) / perMin);
  const s = (total % perMin) / f;
  return { d, m, s, zero: total === 0 };
}

function splitDDM(value, decimals) {
  const f = 10 ** decimals;
  const total = Math.round(Math.abs(value) * 60 * f); // integer count of 1/f minutes
  const d = Math.floor(total / (60 * f));
  const m = (total % (60 * f)) / f;
  return { d, m, zero: total === 0 };
}

function hemi(value, zero, pos, neg) {
  return value < 0 && !zero ? neg : pos;
}

/** 40°26'46.00"N 79°58'56.00"W */
export function formatDMS(lat, lon, decimals = 2) {
  const one = (v, pos, neg, degWidth) => {
    const p = splitDMS(v, decimals);
    return `${String(p.d).padStart(degWidth, '0')}\u00B0${String(p.m).padStart(2, '0')}'${p.s.toFixed(decimals).padStart(decimals ? decimals + 3 : 2, '0')}"${hemi(v, p.zero, pos, neg)}`;
  };
  return `${one(lat, 'N', 'S', 1)} ${one(lon, 'E', 'W', 1)}`;
}

/** 40°26.7667'N 79°58.9333'W */
export function formatDDM(lat, lon, decimals = 4) {
  const one = (v, pos, neg) => {
    const p = splitDDM(v, decimals);
    return `${p.d}\u00B0${p.m.toFixed(decimals).padStart(decimals + 3, '0')}'${hemi(v, p.zero, pos, neg)}`;
  };
  return `${one(lat, 'N', 'S')} ${one(lon, 'E', 'W')}`;
}

/** Links that open the location in a map app. Built from numbers only. */
export function mapLinks(lat, lon) {
  const la = fixed(lat, 6);
  const lo = fixed(lon, 6);
  return {
    apple: `https://maps.apple.com/?ll=${la},${lo}&q=${la},${lo}`,
    google: `https://www.google.com/maps/search/?api=1&query=${la}%2C${lo}`,
    osm: `https://www.openstreetmap.org/?mlat=${la}&mlon=${lo}#map=17/${la}/${lo}`,
  };
}

/* --------------------------------------------------------------------------
   Coordinate parser (decimal, DMS, DDM, with many common variants)
   -------------------------------------------------------------------------- */

const TOKEN_RE = /\s+|([-+]?(?:\d+(?:\.\d*)?|\.\d+))|(\u00B0|DEGREES|DEGREE|DEGS|DEG|D(?![A-Z]))|('|MINUTES|MINUTE|MINS|MIN|M(?![A-Z]))|("|SECONDS|SECOND|SECS|SEC)|(NORTH|SOUTH|EAST|WEST|N|S|E|W)|([,;/])/y;

/** Replace look-alike characters with the plain ones the tokenizer reads. */
export function normalizeText(text) {
  let s = String(text);
  s = s.replace(/[\u00B0\u00BA\u02DA\u1D52\u2218]/g, '\u00B0');
  s = s.replace(/[\u2033\u201D\u201C\u02BA\u3003\u02EE]/g, '"');
  s = s.replace(/[\u2032\u2019\u2018\u00B4`\u02B9\u02BC]/g, "'");
  s = s.replace(/''/g, '"');
  s = s.replace(/[\u2212\u2012\u2013\u2014\u2010\u2011\uFE63\uFF0D]/g, '-');
  s = s.replace(/\uFF0C/g, ',').replace(/\uFF1B/g, ';');
  s = s.replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000\t\r\n]/g, ' ');
  return s;
}

function err(message, extra) { return Object.assign({ ok: false, error: message }, extra || {}); }

/** Tokenize an upper-case, normalised string. Returns { tokens } or { error }. */
function tokenize(s, sAsSeconds = true) {
  const tokens = [];
  TOKEN_RE.lastIndex = 0;
  let pos = 0;
  while (pos < s.length) {
    TOKEN_RE.lastIndex = pos;
    const m = TOKEN_RE.exec(s);
    if (!m || m.index !== pos) {
      const bad = s.slice(pos).match(/^\S+/)[0].slice(0, 12);
      return { error: `Could not read "${bad}". Use numbers, the marks \u00B0 ' ", the letters N, S, E or W, and commas or spaces.` };
    }
    const start = pos;
    pos = TOKEN_RE.lastIndex;
    if (m[1] !== undefined) tokens.push({ t: 'num', raw: m[1], start, end: pos });
    else if (m[2] !== undefined) tokens.push({ t: 'unit', u: 0, raw: m[2], start, end: pos });
    else if (m[3] !== undefined) tokens.push({ t: 'unit', u: 1, raw: m[3], start, end: pos });
    else if (m[4] !== undefined) tokens.push({ t: 'unit', u: 2, raw: m[4], start, end: pos });
    else if (m[5] !== undefined) tokens.push({ t: 'hemi', h: m[5][0], raw: m[5], start, end: pos });
    else if (m[6] !== undefined) tokens.push({ t: 'sep', raw: m[6], start, end: pos });
  }
  // "40d26m46s": an S straight after a number, in letter style (an "M" minute mark
  // earlier in the same run), is a seconds mark, not "south".
  for (let i = 1; sAsSeconds && i < tokens.length; i++) {
    const tk = tokens[i];
    if (tk.t === 'hemi' && tk.raw === 'S' && tokens[i - 1].t === 'num' && tokens[i - 1].end === tk.start) {
      for (let j = i - 2; j >= 0 && tokens[j].t !== 'sep' && tokens[j].t !== 'hemi'; j--) {
        if (tokens[j].t === 'unit' && tokens[j].u === 1 && /^M/.test(tokens[j].raw)) {
          tokens[i] = { t: 'unit', u: 2, raw: 'S', start: tk.start, end: tk.end };
          break;
        }
      }
    }
  }
  return { tokens };
}

/** Turn tokens into items: numbers carry their unit; hemispheres and separators stay. */
function toItems(tokens) {
  const items = [];
  for (const tk of tokens) {
    if (tk.t === 'num') items.push({ t: 'num', raw: tk.raw, unit: null });
    else if (tk.t === 'unit') {
      const last = items[items.length - 1];
      if (!last || last.t !== 'num' || last.unit !== null) {
        return { error: `The mark "${tk.raw}" must come straight after a number.` };
      }
      last.unit = tk.u;
    } else items.push(tk);
  }
  return { items };
}

/** Split items into the two coordinates. */
function splitGroups(items) {
  if (items.some((x) => x.t === 'sep')) {
    const groups = [[]];
    for (const x of items) {
      if (x.t === 'sep') groups.push([]);
      else groups[groups.length - 1].push(x);
    }
    return groups.filter((g) => g.length);
  }
  const hemis = items.filter((x) => x.t === 'hemi');
  if (hemis.length) {
    const groups = [];
    if (items[0].t === 'hemi') {
      // prefix style: N 40 26 46 W 79 58 56
      for (const x of items) {
        if (x.t === 'hemi' || !groups.length) groups.push([]);
        groups[groups.length - 1].push(x);
      }
    } else {
      // suffix style: 40 26 46 N 79 58 56 W (and anything left over forms the last group)
      let cur = [];
      for (const x of items) {
        cur.push(x);
        if (x.t === 'hemi') { groups.push(cur); cur = []; }
      }
      if (cur.length) groups.push(cur);
    }
    return groups;
  }
  // numbers only
  const nums = items;
  if (nums.every((x) => x.unit === null)) {
    if (nums.length === 2 || nums.length === 4 || nums.length === 6) {
      const k = nums.length / 2;
      return [nums.slice(0, k), nums.slice(k)];
    }
    if (nums.length === 1) return [nums];
    return null; // ambiguous
  }
  const groups = [];
  let cur = [];
  let lastUnit = -1;
  let lastHadFraction = false;
  for (const x of nums) {
    const signed = /^[-+]/.test(x.raw);
    let startNew = false;
    if (cur.length) {
      if (x.unit !== null) startNew = x.unit <= lastUnit;
      else startNew = signed || lastHadFraction || lastUnit >= 2;
      if (x.unit === 0) startNew = true;
    }
    if (startNew) { groups.push(cur); cur = []; lastUnit = -1; }
    cur.push(x);
    lastUnit = x.unit !== null ? x.unit : lastUnit + 1;
    lastHadFraction = x.raw.indexOf('.') !== -1;
  }
  if (cur.length) groups.push(cur);
  return groups;
}

const PART_NAMES = ['degrees', 'minutes', 'seconds'];

/** Read one coordinate from a group of items. */
function readCoordinate(group) {
  const hemis = group.filter((x) => x.t === 'hemi');
  if (hemis.length > 1) return { error: 'Each coordinate can have only one of the letters N, S, E or W.' };
  const nums = group.filter((x) => x.t === 'num');
  if (!nums.length) return { error: `The letter ${hemis[0].h} needs a number next to it.` };
  if (nums.length > 3) return { error: 'A coordinate can have at most three numbers: degrees, minutes and seconds.' };
  const parts = [null, null, null];
  let next = 0;
  for (const n of nums) {
    const idx = n.unit !== null ? n.unit : next;
    if (idx > 2) return { error: 'A coordinate can have at most three numbers: degrees, minutes and seconds.' };
    if (idx < next || parts[idx] !== null) return { error: 'The parts of a coordinate must go in the order degrees, minutes, seconds.' };
    parts[idx] = n;
    next = idx + 1;
  }
  if (parts[0] === null) return { error: 'Each coordinate needs a degrees value.' };
  const used = parts.map((p, i) => (p ? i : -1)).filter((i) => i >= 0);
  for (let i = 0; i < used.length; i++) {
    if (i > 0 && used[i] !== used[i - 1] + 1) return { error: 'Minutes are missing between degrees and seconds.' };
  }
  let sign = 1;
  const values = [0, 0, 0];
  for (const i of used) {
    const raw = parts[i].raw;
    if (/^[-+]/.test(raw) && i > 0) return { error: `A minus or plus sign can only go on the degrees, not on the ${PART_NAMES[i]}.` };
    if (raw[0] === '-') sign = -1;
    const v = Math.abs(Number(raw));
    if (!Number.isFinite(v)) return { error: `"${raw}" is not a number.` };
    if (raw.indexOf('.') !== -1 && i !== used[used.length - 1]) {
      return { error: `Only the last part of a coordinate can have decimals. "${raw}" has decimals but is followed by ${PART_NAMES[i + 1]}.` };
    }
    if (i > 0 && v >= 60) return { error: `${PART_NAMES[i][0].toUpperCase() + PART_NAMES[i].slice(1)} must be less than 60. "${raw}" is too big.` };
    values[i] = v;
  }
  let hemi = hemis.length ? hemis[0].h : null;
  if (hemi && sign < 0) return { error: 'Use a minus sign or a hemisphere letter (S or W), not both.' };
  if (hemi === 'S' || hemi === 'W') sign = -1;
  const value = sign * (values[0] + values[1] / 60 + values[2] / 3600);
  return { value: value === 0 ? 0 : value, hemi, parts: used.length };
}

const FORMAT_NAMES = { 1: 'decimal degrees', 2: 'degrees and decimal minutes', 3: 'degrees, minutes and seconds' };

/**
 * Parse two coordinates. Latitude comes first unless N/S/E/W letters say
 * otherwise, or `order` is 'lonlat'.
 * Returns { ok: true, lat, lon, format } or { ok: false, error, swap? }.
 */
export function parseCoordinates(text, { order = 'latlon' } = {}) {
  const first = parseCoordinatesOnce(text, order, true);
  if (first.ok) return first;
  // "33d52m10S 151d12m30E": the S may be "south" rather than a seconds mark.
  // Try that reading before giving up.
  const second = parseCoordinatesOnce(text, order, false);
  return second.ok ? second : first;
}

function parseCoordinatesOnce(text, order, sAsSeconds) {
  let s = normalizeText(text).toUpperCase().trim();
  if (!s) return err('Enter a location.');
  // labels such as "lat: 40.7, lng: -74"
  s = s.replace(/\b(LATITUDE|LONGITUDE|LAT|LNG|LON|LONG)\b\s*[:=]?/g, ' ');
  s = s.replace(/[()[\]{}:=]/g, ' ').trim();
  // decimal commas: "48,8584; 2,2945" or "48,8584 2,2945"
  if (s.indexOf(';') !== -1 || /^[-+]?\d+,\d+\s+[-+]?\d+,\d+$/.test(s)) s = s.replace(/(\d),(\d)/g, '$1.$2');
  const tk = tokenize(s, sAsSeconds);
  if (tk.error) return err(tk.error);
  if (!tk.tokens.length) return err('Enter a location.');
  const it = toItems(tk.tokens);
  if (it.error) return err(it.error);
  const groups = splitGroups(it.items);
  if (!groups) return err('Could not tell where latitude ends and longitude begins. Put a comma between them.');
  if (groups.length < 2) return err('Only one value was found. Enter both latitude and longitude, for example 40.7128, -74.0060.');
  if (groups.length > 2) return err(`Found ${groups.length} values where 2 were expected. Enter one latitude and one longitude.`);
  const a = readCoordinate(groups[0]);
  if (a.error) return err(a.error);
  const b = readCoordinate(groups[1]);
  if (b.error) return err(b.error);
  const axis = (h) => (h === 'N' || h === 'S' ? 'lat' : h === 'E' || h === 'W' ? 'lon' : null);
  const ax = axis(a.hemi);
  const bx = axis(b.hemi);
  let lat, lon;
  if (ax && bx && ax === bx) {
    return err(ax === 'lat' ? 'Both values are marked N or S. One must be a longitude, marked E or W.' : 'Both values are marked E or W. One must be a latitude, marked N or S.');
  }
  if (ax === 'lon' || bx === 'lat') { lat = b.value; lon = a.value; }
  else if (ax === 'lat' || bx === 'lon') { lat = a.value; lon = b.value; }
  else if (order === 'lonlat') { lat = b.value; lon = a.value; }
  else { lat = a.value; lon = b.value; }
  const lettersUsed = Boolean(ax || bx);
  const fmt = Math.max(a.parts, b.parts);
  const format = a.parts === b.parts ? FORMAT_NAMES[fmt] : 'mixed degrees, minutes and seconds';
  if (Math.abs(lat) > 90) {
    const canSwap = !lettersUsed && Math.abs(lon) <= 90 && Math.abs(lat) <= 180;
    return err(`Latitude must be between -90 and 90. ${fixed(lat, 6).replace(/\.?0+$/, '')} is out of range.` +
      (canSwap ? ' The two numbers may be the wrong way round (GeoJSON and some tools put longitude first).' : ''),
      canSwap ? { swap: { lat: lon, lon: lat } } : undefined);
  }
  if (Math.abs(lon) > 180) return err(`Longitude must be between -180 and 180. ${fixed(lon, 6).replace(/\.?0+$/, '')} is out of range.`);
  return { ok: true, lat, lon, format };
}

/* --------------------------------------------------------------------------
   Map links and geo: URIs
   -------------------------------------------------------------------------- */

// A number with nothing number-like straight after it, so "1800" is never read as "180".
const NUM = '([-+]?\\d+(?:\\.\\d+)?)(?![\\d.])';
const PAIR_SEP = '\\s*(?:,|%2C)\\s*';
// After a pair in q=, query= and similar: the end of the value, or a "(label)".
const PAIR_END = '(?=(?:\\s|\\+|%20)*(?:$|[&#]|\\(|%28))';
const PAIR_ONLY = new RegExp('^(?:loc:)?' + NUM + PAIR_SEP + NUM + PAIR_END, 'i');

/** The `name=` value from a query string, decoded where possible. */
function queryValue(s, names) {
  const m = new RegExp('[?&](?:' + names + ')=([^&#]*)', 'i').exec(s);
  if (!m) return null;
  try { return decodeURIComponent(m[1].replace(/\+/g, ' ')); } catch (e) { return m[1]; }
}

/** Read a geo: URI. Its q= value, when present, says where the place is. */
function readGeoUri(s) {
  const q = queryValue(s, 'q');
  if (q !== null && q.trim()) {
    const m = PAIR_ONLY.exec(q.trim());
    if (m) return { lat: Number(m[1]), lon: Number(m[2]), source: 'geo: link' };
    return { error: 'This geo: link holds an address or place name, not coordinates. This page cannot look up addresses, because that would mean sending them to a map service.' };
  }
  const p = new RegExp('^geo:' + NUM + PAIR_SEP + NUM + '(?=$|[;?#,])', 'i').exec(s);
  if (p) return { lat: Number(p[1]), lon: Number(p[2]), source: 'geo: link' };
  return { error: 'This geo: link has no coordinates in it that could be read.' };
}

/**
 * Pull a location out of a map link or geo: URI, without fetching anything.
 * Returns { lat, lon, source } or null if the text is not a link,
 * or { error } for links that cannot be read offline (short links).
 */
export function extractFromLink(text) {
  const s = String(text).trim();
  if (/^geo:/i.test(s)) return readGeoUri(s);
  if (!/^(https?:\/\/|www\.|maps\.)/i.test(s)) return null;
  if (/^(https?:\/\/)?(maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs|maps\.apple\/p\/)/i.test(s)) {
    return { error: 'Short links cannot be read here, because reading one means asking the map service where it leads. Open the link, then copy the full address from the address bar, or copy the coordinates the map shows.' };
  }
  let m = /!3d([-+]?\d+(?:\.\d+)?)!4d([-+]?\d+(?:\.\d+)?)(?![\d.])/.exec(s);
  if (m) return { lat: Number(m[1]), lon: Number(m[2]), source: 'Google Maps link (place pin)' };
  m = new RegExp('[?&](?:q|query|ll|sll|center|destination|daddr|coordinate|address)=(?:loc:)?' + NUM + PAIR_SEP + NUM + PAIR_END, 'i').exec(s);
  if (m) return { lat: Number(m[1]), lon: Number(m[2]), source: 'map link' };
  const mlat = /[?&]mlat=([-+]?\d+(?:\.\d+)?)(?![\d.])/i.exec(s);
  const mlon = /[?&]mlon=([-+]?\d+(?:\.\d+)?)(?![\d.])/i.exec(s);
  if (mlat && mlon) return { lat: Number(mlat[1]), lon: Number(mlon[1]), source: 'OpenStreetMap link (marker)' };
  m = new RegExp('@' + NUM + ',' + NUM).exec(s);
  if (m) return { lat: Number(m[1]), lon: Number(m[2]), source: 'Google Maps link (centre of the map view)' };
  m = new RegExp('#map=\\d+(?:\\.\\d+)?/' + NUM + '/' + NUM).exec(s);
  if (m) return { lat: Number(m[1]), lon: Number(m[2]), source: 'OpenStreetMap link (centre of the map view)' };
  return { error: 'This link has no coordinates in it that could be read. Copy the coordinates the map shows instead.' };
}

/* --------------------------------------------------------------------------
   One entry point for the page
   -------------------------------------------------------------------------- */

const STRICT_HEMI_TOKEN = /^(?:\d+(?:\.\d+)?[NS]\d+(?:\.\d+)?[EW]|[NS]\d+(?:\.\d+)?[EW]\d+(?:\.\d+)?)$/i;
// One coordinate on its own, such as "40N", "N40" or "40d26m46s". Degrees have at
// most 3 digits, so a geohash such as "s00000000" (0, 0) is not caught here.
const HALF_COORD_TOKEN = /^[NSEW]?\d{1,3}(?:\.\d+)?(?:D(?:\d{1,2}(?:\.\d+)?(?:M(?:\d{1,2}(?:\.\d+)?S?)?)?)?)?[NSEW]?$/i;

/**
 * Read any supported input.
 * mode: 'auto' | 'coords' | 'lonlat' | 'plus' | 'geohash'
 * reference: optional { lat, lon } used to recover a short Plus Code.
 * Returns
 *   { ok: true, lat, lon, kind, label, area?, notes: [] }
 *   { ok: false, error, kind?, needsReference?, shortCode?, swap? }
 *   { ok: false, empty: true }
 */
export function parseLocation(text, { mode = 'auto', reference = null } = {}) {
  const raw = String(text == null ? '' : text).trim();
  if (!raw) return { ok: false, empty: true, error: '' };
  const notes = [];

  if (mode === 'auto') {
    const link = extractFromLink(raw);
    if (link) {
      if (link.error) return err(link.error, { kind: 'link' });
      if (Math.abs(link.lat) > 90 || Math.abs(link.lon) > 180) return err('The link holds a location that is out of range.', { kind: 'link' });
      const article = /^[aeiou]/i.test(link.source) ? 'an' : 'a';
      return { ok: true, lat: link.lat, lon: link.lon, kind: 'link', label: `Read from ${article} ${link.source}.`, notes };
    }
  }

  const tokens = raw.split(/\s+/);
  const first = tokens[0];
  const rest = tokens.slice(1).join(' ');
  const looksPlus = /^[23456789CFGHJMPQRVWX0]*\+[23456789CFGHJMPQRVWX]*$/i.test(first) && (!rest || !/\d/.test(rest));

  if (mode === 'plus' || (mode === 'auto' && looksPlus)) {
    const code = mode === 'plus' ? raw.replace(/\s+/g, '') : first;
    if (mode === 'plus' && /\s/.test(raw) && !olcIsValid(code)) {
      // "CJ+2VX London" typed with the Plus Code mode selected
      const c2 = first;
      if (olcIsValid(c2)) return parsePlus(c2, tokens.slice(1).join(' '), reference, notes);
    }
    return parsePlus(code, mode === 'plus' ? '' : rest, reference, notes);
  }

  const single = tokens.length === 1;
  const geohashChars = single && /^[0-9a-z]+$/i.test(first);
  // "40N" or "40d26m46s" is a coordinate still being typed, not a geohash.
  const looksLikeCoordinate = STRICT_HEMI_TOKEN.test(first) || HALF_COORD_TOKEN.test(first);
  if (mode === 'geohash' || (mode === 'auto' && geohashChars && /[a-z]/i.test(first) && !looksLikeCoordinate)) {
    const h = raw.replace(/\s+/g, '');
    if (!/^[0-9a-z]+$/i.test(h)) return err('A geohash has only letters and digits.', { kind: 'geohash' });
    const badChar = h.match(/[ailo]/i);
    if (badChar) return err(`"${badChar[0]}" is not used in geohashes. The geohash alphabet leaves out a, i, l and o.`, { kind: 'geohash' });
    if (h.length > GEOHASH_MAX) return err(`This converter reads geohashes of up to ${GEOHASH_MAX} characters (a cell about 2 cm across). Remove the extra characters.`, { kind: 'geohash' });
    const cell = geohashDecode(h);
    return { ok: true, lat: cell.lat, lon: cell.lon, kind: 'geohash', label: `Read as ${h.length === 8 || h.length === 11 ? 'an' : 'a'} ${h.length}-character geohash. The location shown is the centre of its cell.`, area: cell, notes };
  }

  const res = parseCoordinates(raw, { order: mode === 'lonlat' ? 'lonlat' : 'latlon' });
  if (!res.ok) {
    if (mode === 'auto' && geohashChars && first.length >= (/[a-z]/i.test(first) ? 3 : 4)) {
      res.error += ' If this is a geohash, choose Geohash under "Read as".';
    }
    return Object.assign(res, { kind: 'coords' });
  }
  if (mode === 'auto' && geohashChars && STRICT_HEMI_TOKEN.test(first)) {
    notes.push('This could also be a geohash. To read it as one, choose Geohash under "Read as".');
  }
  if (mode === 'auto' && /^\s*\[/.test(raw) && !/[NSEW]/i.test(raw.replace(/\b(lat|lng|lon|long|latitude|longitude)\b/gi, ''))) {
    notes.push('Square brackets often mean GeoJSON, which puts longitude first. If so, choose "Longitude, latitude" under "Read as".');
  }
  const orderNote = mode === 'lonlat' ? ' Longitude was read first.' : '';
  return { ok: true, lat: res.lat, lon: res.lon, kind: 'coords', label: `Read as ${res.format}.${orderNote}`, notes };
}

function parsePlus(code, extra, reference, notes) {
  if (!olcIsValid(code)) {
    return err('This is not a valid Plus Code. A full code looks like 8FVC9G8F+6X: eight characters, a plus sign, then two or more. Plus Codes use only the digits 2 to 9 and the letters C F G H J M P Q R V W X.', { kind: 'plus' });
  }
  if (olcIsFull(code)) {
    const cell = olcDecode(code);
    if (extra) notes.push(`"${extra.slice(0, 40)}" after the code was ignored. A full code does not need a place name.`);
    return { ok: true, lat: cell.lat, lon: cell.lon, kind: 'plus', label: `Read as a full Plus Code (${cell.length} digits). The location shown is the centre of its cell.`, area: cell, notes };
  }
  if (!olcIsShort(code)) return err('This Plus Code is not valid.', { kind: 'plus' });
  const resolution = olcShortCodeResolution(code);
  const dropped = OLC_SEPARATOR_POSITION - code.indexOf(OLC_SEPARATOR);
  // Half a cell, shrunk to stay true east-west up to about 60 degrees of latitude.
  const within = formatLength((resolution / 2) * METRES_PER_DEGREE * 0.45);
  if (!reference) {
    return err(
      (extra ? `This is a short Plus Code followed by a place name ("${extra.slice(0, 40)}"). This page cannot look up place names, because that would mean sending them to a map service. ` : 'This is a short Plus Code. ') +
      `It leaves out the first ${dropped} characters, so it only points to one place when you say what it is near. Enter the coordinates of a point within about ${within} of it below, or open the code in Google Maps.`,
      { kind: 'plus', needsReference: true, shortCode: code.toUpperCase(), within });
  }
  const full = olcRecoverNearest(code, reference.lat, reference.lon);
  const cell = olcDecode(full);
  notes.push(`The short code ${code.toUpperCase()} was completed to ${full} using the nearby point you gave. If that point is more than about ${within} away, the result can be wrong.`);
  return { ok: true, lat: cell.lat, lon: cell.lon, kind: 'plus', label: `Read as a short Plus Code near ${fixed(reference.lat, 4)}, ${fixed(reference.lon, 4)}. The location shown is the centre of its cell.`, area: cell, notes, recovered: full };
}

/** Every output format for one location. */
export function allFormats(lat, lon, { plusLength = 10, geohashPrecision = 9 } = {}) {
  return {
    decimal: formatDecimal(lat, lon),
    lonlat: `${fixed(lon, 6)}, ${fixed(lat, 6)}`,
    dms: formatDMS(lat, lon),
    ddm: formatDDM(lat, lon),
    plus: olcEncode(lat, lon, plusLength),
    plusSize: formatCellSize(olcCellDegrees(plusLength), lat),
    geohash: geohashEncode(lat, lon, geohashPrecision),
    geohashSize: formatCellSize(geohashCellDegrees(geohashPrecision), lat),
    links: mapLinks(lat, lon),
  };
}
