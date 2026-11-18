/* ==========================================================================
   Simulator GPX Builder and Fixer - core logic
   https://wanderspoofer.com/tools/simulator-gpx/

   Pure functions only. No DOM, no network, no dependencies. The same file runs
   in the browser (loaded by index.html) and in Node (loaded by the tests).

   Conventions
   - A point is { lat, lon } in decimal degrees (WGS84). Planned points also
     carry `time` as milliseconds since the Unix epoch, always a whole second.
   - Distances are metres, speeds are metres per second, durations are seconds.
   ========================================================================== */

export const EARTH_RADIUS_M = 6371008.8; // mean Earth radius

export const SPEED_PRESETS = Object.freeze({ walk: 1.4, run: 3, cycle: 5.5, drive: 13.9 });

export const LIMITS = Object.freeze({
  maxFileBytes: 4 * 1024 * 1024, // largest file the page will read
  doctorMaxPoints: 20000,        // the doctor warns above this
  maxOutputPoints: 100000,       // planRoute refuses to build more than this
  maxSpeedMps: 100,              // the doctor flags segments faster than this
  simctlInlineMax: 20,           // more waypoints than this -> stdin form
});

export const SOURCES = Object.freeze({
  appleHelpDebugger: 'https://help.apple.com/xcode/mac/current/#/dev1b4074150',
  appleHelpScheme: 'https://help.apple.com/xcode/mac/current/#/dev8dbd2f820',
  androidExtendedControls: 'https://developer.android.com/studio/run/emulator-extended-controls',
  androidConsole: 'https://developer.android.com/studio/run/emulator-console',
  aospGpxParser: 'https://android.googlesource.com/platform/external/qemu/+/refs/heads/emu-master-dev/android/emu/gps/src/android/gps/GpxParser.cpp',
  gpx11: 'https://www.topografix.com/GPX/1/1/',
  rfc7946: 'https://www.rfc-editor.org/rfc/rfc7946',
  polyline: 'https://developers.google.com/maps/documentation/utilities/polylinealgorithm',
});

const GPX_NS = 'http://www.topografix.com/GPX/1/1';
const CREATOR = 'Wander Simulator GPX Builder (wanderspoofer.com/tools/simulator-gpx)';

/* --------------------------------------------------------------------------
   Geometry
   -------------------------------------------------------------------------- */

const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

/** True when lat and lon are finite numbers inside the WGS84 ranges. */
export function isValidPoint(p) {
  return !!p && Number.isFinite(p.lat) && Number.isFinite(p.lon) &&
    p.lat >= -90 && p.lat <= 90 && p.lon >= -180 && p.lon <= 180;
}

/** Great-circle distance in metres between two points (haversine formula). */
export function haversine(a, b) {
  const p1 = toRad(a.lat);
  const p2 = toRad(b.lat);
  const dp = p2 - p1;
  const dl = toRad(b.lon - a.lon);
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Point a fraction f (0..1) of the way from a to b along the great circle. */
export function intermediate(a, b, f) {
  if (f <= 0) return { lat: a.lat, lon: a.lon };
  if (f >= 1) return { lat: b.lat, lon: b.lon };
  const d = haversine(a, b) / EARTH_RADIUS_M; // angular distance
  const sinD = Math.sin(d);
  if (d < 1e-12 || Math.abs(sinD) < 1e-12) {
    // identical or antipodal points: fall back to a straight blend
    return { lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f };
  }
  const A = Math.sin((1 - f) * d) / sinD;
  const B = Math.sin(f * d) / sinD;
  const p1 = toRad(a.lat), l1 = toRad(a.lon), p2 = toRad(b.lat), l2 = toRad(b.lon);
  const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
  const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
  const z = A * Math.sin(p1) + B * Math.sin(p2);
  return { lat: toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))), lon: toDeg(Math.atan2(y, x)) };
}

/** Total length in metres of a polyline. */
export function pathLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += haversine(points[i - 1], points[i]);
  return total;
}

/** Drop points that repeat the one before them. */
export function dropConsecutiveDuplicates(points) {
  const out = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || last.lat !== p.lat || last.lon !== p.lon) out.push(p);
  }
  return out;
}

/**
 * Resample a polyline so consecutive points are `step` metres apart, measured
 * along the path. The first point is always kept and the route always ends on
 * the exact last point, so only the final gap can differ from `step`: it is
 * shorter, or up to 5% longer when the leftover is too small to be worth a
 * point of its own.
 */
export function resample(points, step) {
  if (!(step > 0) || !Number.isFinite(step)) throw new RangeError('step must be a positive number of metres');
  const pts = dropConsecutiveDuplicates(points);
  if (pts.length === 0) return [];
  const first = { lat: pts[0].lat, lon: pts[0].lon };
  if (pts.length === 1) return [first];
  const out = [first];
  let need = step; // distance still to travel before the next output point
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const segLen = haversine(a, b);
    if (segLen === 0) continue;
    const firstAt = need;
    let k = 0;
    let pos = firstAt;
    while (pos <= segLen + 1e-9) {
      out.push(intermediate(a, b, Math.min(1, pos / segLen)));
      k++;
      pos = firstAt + k * step;
    }
    const lastAt = k === 0 ? null : firstAt + (k - 1) * step;
    need = k === 0 ? need - segLen : step - (segLen - lastAt);
  }
  const end = pts[pts.length - 1];
  const leftover = step - need; // distance from the last output point to the end
  if (out.length > 1 && leftover < step * 0.05) {
    out[out.length - 1] = { lat: end.lat, lon: end.lon };
  } else if (leftover > 0) {
    out.push({ lat: end.lat, lon: end.lon });
  }
  return out;
}

/* --------------------------------------------------------------------------
   Route editing helpers
   -------------------------------------------------------------------------- */

export function reverseRoute(points) {
  return points.slice().reverse();
}

/** A B C -> A B C B A */
export function outAndBack(points) {
  if (points.length < 2) return points.slice();
  return points.concat(points.slice(0, -1).reverse());
}

/** A B C -> A B C A (no change when the route already ends where it starts) */
export function closeLoop(points) {
  if (points.length < 2) return points.slice();
  const a = points[0];
  const z = points[points.length - 1];
  if (a.lat === z.lat && a.lon === z.lon) return points.slice();
  return points.concat([{ lat: a.lat, lon: a.lon }]);
}

export function swapLatLon(points) {
  return points.map((p) => ({ ...p, lat: p.lon, lon: p.lat }));
}

/* --------------------------------------------------------------------------
   Timing
   -------------------------------------------------------------------------- */

/** Milliseconds since epoch -> "YYYY-MM-DDTHH:MM:SSZ" (UTC, whole seconds). */
export function formatGpxTime(ms) {
  const d = new Date(Math.floor(ms / 1000) * 1000);
  if (Number.isNaN(d.getTime())) throw new RangeError('invalid time');
  const iso = d.toISOString(); // 2026-01-01T09:00:00.000Z
  if (iso.length !== 24) throw new RangeError('time is outside the years 0000-9999');
  return iso.slice(0, 19) + 'Z';
}

/**
 * Give each point a whole-second timestamp, `interval` seconds apart, starting
 * at `start` (ms since epoch, rounded down to a whole second).
 */
export function stampTimes(points, { start = Date.now(), interval = 1 } = {}) {
  const step = normaliseInterval(interval);
  const startSec = Math.floor(start / 1000);
  return points.map((p, i) => ({ lat: p.lat, lon: p.lon, time: (startSec + i * step) * 1000 }));
}

function normaliseInterval(interval) {
  const n = Math.round(Number(interval));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/**
 * The core step: turn a hand-drawn or imported route into evenly paced,
 * timestamped points.
 *
 *   speed    metres per second (required, > 0)
 *   interval whole seconds between points (default 1)
 *   dwell    seconds to wait at every input point (default 0)
 *   start    ms since epoch for the first point (default now)
 *
 * With dwell = 0 the path is cut at its sharp corners and turnarounds (the
 * points that keyVertices finds) and each piece is resampled at speed x
 * interval. Gentle bends and GPS jitter are smoothed over, but a corner or the
 * far end of an out-and-back is always reached; only the gap just before each
 * kept corner is shorter than the step. `corners` reports how many there are.
 * With a dwell every leg is resampled on its own so that every input point is
 * hit exactly, then repeated once per interval for the length of the dwell.
 * Repeating the point (instead of leaving a gap in the times) makes the pause
 * work both when a player honours <time> and when it steps one point per update.
 */
export function planRoute(points, { speed, interval = 1, dwell = 0, start = Date.now() } = {}) {
  if (!(speed > 0) || !Number.isFinite(speed)) throw new RangeError('speed must be a positive number of metres per second');
  if (!Number.isFinite(start)) throw new RangeError('start must be a time in milliseconds');
  const every = normaliseInterval(interval);
  const dwellNum = Number(dwell);
  const dwellSteps = dwellNum > 0 && Number.isFinite(dwellNum) ? Math.max(1, Math.round(dwellNum / every)) : 0;
  const step = speed * every;
  const shape = dropConsecutiveDuplicates(points.filter(isValidPoint));
  const distance = pathLength(shape);

  // the input points each piece starts and ends on
  const keys = dwellSteps > 0 ? shape.map((_, i) => i) : keyVertices(shape, cornerTolerance(step));
  const tooMany = (n) => {
    const err = new RangeError(
      `This route would need about ${n.toLocaleString('en-US')} points. ` +
      `The limit is ${LIMITS.maxOutputPoints.toLocaleString('en-US')}. Use a faster speed, a longer interval or a shorter route.`);
    err.code = 'TOO_MANY_POINTS';
    return err;
  };
  // each piece adds about ceil(length / step) points; every vertex adds its dwell copies
  let estimate = shape.length > 0 ? 1 + shape.length * dwellSteps : 0;
  for (let k = 1; k < keys.length; k++) {
    estimate += Math.max(1, Math.ceil(pathLength(shape.slice(keys[k - 1], keys[k] + 1)) / step));
    if (estimate > LIMITS.maxOutputPoints) break;
  }
  if (estimate > LIMITS.maxOutputPoints) throw tooMany(estimate);

  const path = [];
  if (shape.length > 0) {
    path.push({ lat: shape[0].lat, lon: shape[0].lon });
    for (let k = 0; k < dwellSteps; k++) path.push({ lat: shape[0].lat, lon: shape[0].lon });
  }
  for (let k = 1; k < keys.length; k++) {
    const piece = resample(shape.slice(keys[k - 1], keys[k] + 1), step);
    for (let j = 1; j < piece.length; j++) path.push(piece[j]);
    const v = shape[keys[k]];
    for (let d = 0; d < dwellSteps; d++) path.push({ lat: v.lat, lon: v.lon });
  }
  if (path.length > LIMITS.maxOutputPoints) throw tooMany(path.length);

  const stamped = stampTimes(path, { start, interval: every });
  return {
    points: stamped,
    shape,
    count: stamped.length,
    distance,
    duration: stamped.length > 1 ? (stamped.length - 1) * every : 0,
    step,
    speed,
    interval: every,
    dwell: dwellSteps * every,
    corners: dwellSteps > 0 ? 0 : Math.max(0, keys.length - 2),
  };
}

/**
 * How far (metres) a vertex has to stand out from the straight line between
 * its neighbours before planRoute keeps it exactly: a quarter of a step, and
 * never less than 10 m so that GPS jitter in a recorded track is not kept.
 */
function cornerTolerance(step) {
  return Math.max(step / 4, 10);
}

/** Distance in metres from p to the segment a-b, on a local flat projection around a. */
function distanceToSegment(p, a, b) {
  const kx = Math.cos(toRad(a.lat)) * EARTH_RADIUS_M;
  const wrap = (d) => (d > 180 ? d - 360 : d < -180 ? d + 360 : d);
  const bx = toRad(wrap(b.lon - a.lon)) * kx, by = toRad(b.lat - a.lat) * EARTH_RADIUS_M;
  const px = toRad(wrap(p.lon - a.lon)) * kx, py = toRad(p.lat - a.lat) * EARTH_RADIUS_M;
  const len2 = bx * bx + by * by;
  const t = len2 > 0 ? Math.max(0, Math.min(1, (px * bx + py * by) / len2)) : 0;
  return Math.hypot(px - t * bx, py - t * by);
}

/**
 * Indexes of the vertices that shape the route (Ramer-Douglas-Peucker with the
 * given tolerance in metres). The first and last index are always included.
 */
export function keyVertices(points, tolerance) {
  const n = points.length;
  if (n === 0) return [];
  if (n === 1) return [0];
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    if (b - a < 2) continue;
    let maxD = -1;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = distanceToSegment(points[i], points[a], points[b]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tolerance) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(i);
  return out;
}

/* --------------------------------------------------------------------------
   Number and text formatting
   -------------------------------------------------------------------------- */

/** Fixed-decimal coordinate with "." as the separator and no negative zero. */
export function formatCoord(n, decimals = 7) {
  const s = Number(n).toFixed(decimals);
  return /^-0(\.0*)?$/.test(s) ? s.slice(1) : s;
}

function formatNumber(n) {
  // short, locale-free number for command lines: 1.4, 13.9, 5
  return String(Number(Number(n).toFixed(3)));
}

/**
 * Escape text for XML. Characters that XML 1.0 does not allow at all (most
 * control characters, U+FFFE, U+FFFF and unpaired surrogates) are replaced
 * with U+FFFD so the file stays well formed.
 */
export function escapeXml(s) {
  return String(s)
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF\uD800-\uDFFF]/g,
      (c) => (c.length === 2 ? c : '\uFFFD'))
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/**
 * Longitude for a GPX file. GPX 1.1 allows -180 <= lon < 180, so a longitude
 * that is (or rounds to) 180 is written as the same meridian, -180.
 */
function formatLon(lon) {
  const s = formatCoord(lon);
  return Number(s) >= 180 ? formatCoord(Number(s) - 360) : s;
}

/* --------------------------------------------------------------------------
   Writers
   -------------------------------------------------------------------------- */

function assertTimed(points, what) {
  let prev = -Infinity;
  for (const p of points) {
    if (!Number.isFinite(p.time)) throw new TypeError(`${what}: every point needs a time`);
    if (p.time % 1000 !== 0) throw new TypeError(`${what}: times must be whole seconds`);
    if (p.time <= prev) throw new TypeError(`${what}: times must be strictly increasing`);
    prev = p.time;
  }
}

function gpxOpen() {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="${escapeXml(CREATOR)}" xmlns="${GPX_NS}">\n`;
}

/**
 * GPX for Xcode's Simulate Location: waypoints only, each with a whole-second
 * UTC time, in ascending order. No <trk> or <rte>, which Xcode does not support.
 */
export function writeXcodeGPX(points) {
  assertTimed(points, 'Xcode GPX');
  let out = gpxOpen();
  for (const p of points) {
    out += `  <wpt lat="${formatCoord(p.lat)}" lon="${formatLon(p.lon)}"><time>${formatGpxTime(p.time)}</time></wpt>\n`;
  }
  return out + '</gpx>\n';
}

/**
 * GPX for the Android Emulator: one track, one segment, each track point with
 * a whole-second time that is later than the one before it.
 */
export function writeAndroidGPX(points, { name = 'Route' } = {}) {
  assertTimed(points, 'Android GPX');
  let out = gpxOpen();
  out += `  <trk>\n    <name>${escapeXml(name)}</name>\n    <trkseg>\n`;
  for (const p of points) {
    out += `      <trkpt lat="${formatCoord(p.lat)}" lon="${formatLon(p.lon)}"><time>${formatGpxTime(p.time)}</time></trkpt>\n`;
  }
  return out + '    </trkseg>\n  </trk>\n</gpx>\n';
}

/** Plain GPX 1.1 track. Times are written only for points that have one. */
export function writeTrackGPX(points, { name = 'Route' } = {}) {
  let out = gpxOpen();
  out += `  <trk>\n    <name>${escapeXml(name)}</name>\n    <trkseg>\n`;
  for (const p of points) {
    const time = Number.isFinite(p.time) ? `<time>${formatGpxTime(p.time)}</time>` : '';
    out += time
      ? `      <trkpt lat="${formatCoord(p.lat)}" lon="${formatLon(p.lon)}">${time}</trkpt>\n`
      : `      <trkpt lat="${formatCoord(p.lat)}" lon="${formatLon(p.lon)}"/>\n`;
  }
  return out + '    </trkseg>\n  </trk>\n</gpx>\n';
}

/**
 * Split a line where it crosses the antimeridian (RFC 7946 section 3.1.9):
 * each part ends at +-180 and the next one starts on the other side.
 * Input and output positions are [lon, lat].
 */
function cutAtAntimeridian(positions) {
  const parts = [];
  let cur = [];
  const push = (pos) => {
    const last = cur[cur.length - 1];
    if (!last || last[0] !== pos[0] || last[1] !== pos[1]) cur.push(pos);
  };
  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    const prev = positions[i - 1];
    if (prev && Math.abs(pos[0] - prev[0]) > 180) {
      const edge = prev[0] > 0 ? 180 : -180;
      const unwrapped = pos[0] + (edge > 0 ? 360 : -360);
      const f = unwrapped === prev[0] ? 0 : (edge - prev[0]) / (unwrapped - prev[0]);
      const lat = Number(formatCoord(prev[1] + f * (pos[1] - prev[1])));
      push([edge, lat]);
      parts.push(cur);
      cur = [];
      push([-edge, lat]);
    }
    push(pos);
  }
  parts.push(cur);
  return parts.filter((p) => p.length >= 2);
}

/**
 * GeoJSON (RFC 7946) Feature holding a LineString. Positions are [lon, lat].
 * A route that crosses the antimeridian is written as a MultiLineString cut
 * at +-180, as the RFC recommends.
 */
export function writeGeoJSON(points, { name = 'Route' } = {}) {
  const positions = points.map((p) => [Number(formatCoord(p.lon)), Number(formatCoord(p.lat))]);
  const fmt = (pos) => `[${pos[0]}, ${pos[1]}]`;
  let geometry;
  if (points.length === 1) {
    geometry = `{ "type": "Point", "coordinates": ${fmt(positions[0])} }`;
  } else {
    const parts = cutAtAntimeridian(positions);
    const line = parts.length === 1 ? parts[0] : positions;
    geometry = parts.length > 1
      ? `{\n    "type": "MultiLineString",\n    "coordinates": [\n      ${parts.map((part) => `[${part.map(fmt).join(', ')}]`).join(',\n      ')}\n    ]\n  }`
      : `{\n    "type": "LineString",\n    "coordinates": [\n      ${line.map(fmt).join(',\n      ')}\n    ]\n  }`;
  }
  return `{\n  "type": "Feature",\n  "properties": { "name": ${JSON.stringify(name)} },\n  "geometry": ${geometry}\n}\n`;
}

/**
 * Command for the iOS Simulator. Syntax from `xcrun simctl help location`:
 *   start [--speed=<meters/sec>] [--distance=<meters>|--interval=<seconds>] <lat1>,<lon1> <latN>,<lonN>...
 * and "Use '-' to read waypoints from stdin, one waypoint per line."
 * simctl interpolates between waypoints itself, so pass the route's shape, not
 * the densified points. Long routes use the stdin form.
 *
 * The inline form always puts "--" before the waypoints. Without it simctl
 * reads a waypoint with a negative latitude (such as -33.8688,151.2093) as an
 * option and stops with "invalid option" (checked on Xcode 27.2).
 */
export function simctlCommand(points, { speed, interval = 1, device = 'booted', inlineMax = LIMITS.simctlInlineMax } = {}) {
  const pts = dropConsecutiveDuplicates(points.filter(isValidPoint));
  if (pts.length === 0) return '';
  const pair = (p) => `${formatCoord(p.lat, 6)},${formatCoord(p.lon, 6)}`;
  if (pts.length === 1) return `xcrun simctl location ${device} set ${pair(pts[0])}`;
  const head = `xcrun simctl location ${device} start --speed=${formatNumber(speed)} --interval=${formatNumber(interval)}`;
  const pairs = pts.map(pair);
  if (pairs.length <= inlineMax) return `${head} -- ${pairs.join(' ')}`;
  return `${head} - <<'EOF'\n${pairs.join('\n')}\nEOF`;
}

/**
 * Shell script for the Android Emulator console. `geo fix` takes LONGITUDE
 * first, then latitude. Pass the planned (densified) points: the script sends
 * one fix, sleeps for the interval, and repeats.
 */
export function adbScript(points, { interval = 1 } = {}) {
  const every = normaliseInterval(interval);
  const lines = points.filter(isValidPoint).map((p) => `${formatCoord(p.lon)} ${formatCoord(p.lat)}`);
  return [
    '#!/bin/sh',
    '# Plays a route on a running Android Emulator: one GPS fix every ' + every + ' s.',
    '# Made with https://wanderspoofer.com/tools/simulator-gpx/',
    '#',
    '# WARNING: "geo fix" takes LONGITUDE first, then LATITUDE.',
    '# Each line below is "<longitude> <latitude>".',
    '# More than one emulator running? Use: adb -s emulator-5554 emu geo fix ...',
    'while read -r LON LAT; do',
    '  adb emu geo fix "$LON" "$LAT" </dev/null',
    `  sleep ${every}`,
    "done <<'EOF'",
    ...lines,
    'EOF',
    '',
  ].join('\n');
}

/* --------------------------------------------------------------------------
   Encoded polyline (Google's algorithm) and the permalink
   -------------------------------------------------------------------------- */

function encodeSigned(value) {
  let v = value < 0 ? ~(value << 1) : value << 1;
  let out = '';
  while (v >= 0x20) {
    out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>>= 5;
  }
  return out + String.fromCharCode(v + 63);
}

/** Encode points as a Google encoded polyline. Precision 5 is about 1.1 m. */
export function encodePolyline(points, precision = 5) {
  const factor = 10 ** precision;
  let prevLat = 0;
  let prevLon = 0;
  let out = '';
  for (const p of points) {
    const lat = Math.round(p.lat * factor);
    const lon = Math.round(p.lon * factor);
    out += encodeSigned(lat - prevLat) + encodeSigned(lon - prevLon);
    prevLat = lat;
    prevLon = lon;
  }
  return out;
}

/** Decode a Google encoded polyline. Throws on a truncated or invalid string. */
export function decodePolyline(str, precision = 5) {
  const factor = 10 ** precision;
  const out = [];
  let i = 0;
  let lat = 0;
  let lon = 0;
  const next = () => {
    let result = 0;
    let shift = 0;
    let b;
    do {
      if (i >= str.length) throw new Error('polyline ended early');
      b = str.charCodeAt(i++) - 63;
      if (b < 0 || b > 63) throw new Error('invalid polyline character');
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < str.length) {
    lat += next();
    lon += next();
    out.push({ lat: lat / factor, lon: lon / factor });
  }
  return out;
}

/** "#r=<polyline>&s=<speed>&i=<interval>&d=<dwell>" for the URL fragment. */
export function buildPermalinkHash({ points, speed, interval, dwell } = {}) {
  let hash = '#r=' + encodeURIComponent(encodePolyline(points || []));
  if (Number.isFinite(speed)) hash += '&s=' + formatNumber(speed);
  if (Number.isFinite(interval)) hash += '&i=' + formatNumber(interval);
  if (Number.isFinite(dwell) && dwell > 0) hash += '&d=' + formatNumber(dwell);
  return hash;
}

/** Inverse of buildPermalinkHash. Returns null when the hash holds no route. */
export function parsePermalinkHash(hash) {
  const raw = String(hash || '').replace(/^#/, '');
  if (!raw) return null;
  const fields = {};
  for (const part of raw.split('&')) {
    const eq = part.indexOf('=');
    if (eq > 0) fields[part.slice(0, eq)] = part.slice(eq + 1);
  }
  if (!fields.r) return null;
  let points;
  try {
    points = decodePolyline(decodeURIComponent(fields.r)).filter(isValidPoint);
  } catch {
    return null;
  }
  if (points.length === 0) return null;
  const num = (v) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);
  return { points, speed: num(fields.s), interval: num(fields.i), dwell: num(fields.d) };
}

/* --------------------------------------------------------------------------
   Pasted text: decimal pairs, DMS, and map links
   -------------------------------------------------------------------------- */

const NUM = '[-+]?\\d+(?:\\.\\d+)?';
const PAIR_RE = new RegExp(`^\\s*(?:loc:)?\\s*(${NUM})\\s*,\\s*(${NUM})`);

function normaliseMarks(s) {
  return s
    .replace(/[\u2032\u2019\u2018\u00b4`]/g, "'")   // prime and curly single quotes
    .replace(/[\u2033\u201d\u201c]/g, '"')          // double prime and curly double quotes
    .replace(/''/g, '"')
    .replace(/[\u00ba\u02da]/g, '\u00b0')           // masculine ordinal, ring above -> degree
    .replace(/\u2212/g, '-');                       // minus sign
}

/**
 * One angle: "37.7749", "-122.4194", "37\u00b046'29.6\"N", "122 25 9.8 W",
 * "N 37\u00b0 46.494'". Returns { value, hemi } or null.
 */
export function parseAngle(text) {
  let s = normaliseMarks(String(text)).trim();
  if (!s) return null;
  let hemi = null;
  let m = s.match(/^([NSEW])\s*(?=[-+\d])/i);
  if (m) {
    hemi = m[1].toUpperCase();
    s = s.slice(m[0].length);
  } else if ((m = s.match(/[\d\s\u00b0'"]([NSEW])$/i))) {
    // "37d 46m 29.6s": with d / m unit markers, a lowercase "s" straight after
    // the last number is the seconds marker, not South
    const secondsMarker = m[1] === 's' && /\d$/.test(s.slice(0, -1)) && /\d\s*(?:deg|d|m)(?![a-z])/i.test(s);
    if (!secondsMarker) {
      hemi = m[1].toUpperCase();
      s = s.slice(0, -1).trim();
    }
  }
  const rest = s.replace(new RegExp(NUM, 'g'), '').replace(/[\u00b0'":\s]|deg|d|m|s/gi, '');
  if (rest !== '') return null;
  const nums = (s.match(new RegExp(NUM, 'g')) || []).map(Number);
  if (nums.length < 1 || nums.length > 3) return null;
  const negative = /^\s*-/.test(s);
  const [d, min = 0, sec = 0] = nums;
  if (nums.length > 1 && (min < 0 || min >= 60 || sec < 0 || sec >= 60)) return null;
  if (hemi && negative) return null;
  let value = Math.abs(d) + min / 60 + sec / 3600;
  if (negative || hemi === 'S' || hemi === 'W') value = -value;
  return { value, hemi };
}

// "48,85": a number written with a decimal comma
const DECIMAL_COMMA_RE = /^[-+]?\d+,\d+$/;
const NUM_RE = new RegExp(`^${NUM}$`);

function splitPair(line) {
  const s = normaliseMarks(line).trim().replace(/^\(|\)$/g, '').trim();
  // 1a. ";" or a tab separates the values: split on that only, so a decimal
  // comma ("48,85;2,29", a European spreadsheet export) stays inside its number
  if (/[;\t]/.test(s)) {
    const parts = s.split(/\s*[;\t]\s*/).filter((x) => x !== '');
    if (parts.every((x) => !x.includes(',') || DECIMAL_COMMA_RE.test(x))) {
      const fixed = parts.map((x) => (DECIMAL_COMMA_RE.test(x) ? x.replace(',', '.') : x));
      if (fixed.length === 2) return fixed;
      if (fixed.length > 2) return fixed.every((x) => NUM_RE.test(x)) ? fixed.slice(0, 2) : null;
    }
  }
  // 1b. an explicit separator
  const bySep = s.split(/\s*[,;]\s*|\t+/).filter((x) => x !== '');
  if (bySep.length === 2) return bySep;
  if (bySep.length > 2) {
    // "lat, lon, altitude" style: keep the first two
    if (bySep.every((x) => NUM_RE.test(x))) return bySep.slice(0, 2);
    return null;
  }
  // 2. hemisphere letters mark the boundary
  let m = s.match(/^(.*?\d[^NSEW]*[NS])\s*(.+[EW])$/i) || s.match(/^(.*?\d[^NSEW]*[EW])\s*(.+[NS])$/i);
  if (m) return [m[1], m[2]];
  m = s.match(/^([NS][^NSEW]+?)\s*([EW].+)$/i) || s.match(/^([EW][^NSEW]+?)\s*([NS].+)$/i);
  if (m) return [m[1], m[2]];
  // 3. whitespace only
  const tokens = s.split(/\s+/);
  const allNumbers = tokens.every((t) => new RegExp(`^${NUM}[\u00b0'"]?$`).test(t));
  if (allNumbers && (tokens.length === 2 || tokens.length === 4 || tokens.length === 6)) {
    const half = tokens.length / 2;
    return [tokens.slice(0, half).join(' '), tokens.slice(half).join(' ')];
  }
  return null;
}

function pairToPoint(a, b) {
  const lat = Number(a);
  const lon = Number(b);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

function coordsFromParam(value) {
  if (value == null) return null;
  const m = String(value).match(PAIR_RE);
  if (!m) return null;
  const p = pairToPoint(m[1], m[2]);
  return p && isValidPoint(p) ? p : null;
}

/** A directions result: start, the stops that have coordinates, end. */
function withStops(from, stops, to, provider) {
  const given = stops.filter((x) => String(x).trim() !== '');
  const mids = given.map(coordsFromParam).filter(Boolean);
  const res = { points: [from, ...mids, to], provider };
  if (mids.length < given.length) res.note = 'stops given as place names were skipped';
  return res;
}

/**
 * Read coordinates out of a Google Maps, Apple Maps or OpenStreetMap link, or
 * a geo: URI. Returns { points, provider, note } or { error }.
 * Nothing is fetched: short links that need a network lookup are rejected.
 */
export function parseMapUrl(text) {
  const s = String(text).trim();
  const geo = s.match(new RegExp(`^geo:(${NUM}),(${NUM})`, 'i'));
  if (geo) {
    // Android's form "geo:0,0?q=lat,lng(label)" puts the real place in q=
    let qValue = null;
    const qs = s.indexOf('?');
    if (qs !== -1) {
      for (const part of s.slice(qs + 1).split('&')) {
        if (!/^q=/i.test(part)) continue;
        const raw = part.slice(2).replace(/\+/g, ' ');
        try { qValue = decodeURIComponent(raw); } catch { qValue = raw; }
      }
    }
    const fromQ = qValue !== null ? coordsFromParam(qValue) : null;
    if (fromQ) return { points: [fromQ], provider: 'geo' };
    const p = pairToPoint(geo[1], geo[2]);
    if (!p || !isValidPoint(p)) return { error: 'The geo: link has coordinates out of range.' };
    if (qValue !== null && p.lat === 0 && p.lon === 0) {
      return { error: 'This geo: link searches for a place by name. Only links with coordinates can be read.' };
    }
    return { points: [p], provider: 'geo' };
  }
  let url;
  try {
    url = new URL(s);
  } catch {
    return { error: 'Not a valid link.' };
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const q = url.searchParams;
  const decodedPath = (() => { try { return decodeURIComponent(url.pathname); } catch { return url.pathname; } })();
  const decodedHash = (() => { try { return decodeURIComponent(url.hash); } catch { return url.hash; } })();

  if (host === 'goo.gl' || host.endsWith('.goo.gl') || host === 'g.co' || host === 'maps.apple' || host.endsWith('.maps.apple')) {
    return { error: 'Short links hide the coordinates. Open the link, then copy the full address from the browser.' };
  }

  // --- OpenStreetMap ---
  if (/(^|\.)openstreetmap\.org$/.test(host) || /(^|\.)osm\.org$/.test(host)) {
    if (decodedPath.startsWith('/go/')) {
      return { error: 'OpenStreetMap short links hide the coordinates. Open the link, then copy the full address.' };
    }
    const marker = pairToPoint(q.get('mlat'), q.get('mlon'));
    if (q.get('mlat') !== null && marker && isValidPoint(marker)) return { points: [marker], provider: 'osm' };
    const route = q.get('route');
    if (route) {
      const pts = route.split(';').map(coordsFromParam).filter(Boolean);
      if (pts.length) return { points: pts, provider: 'osm' };
    }
    const hashMap = decodedHash.match(new RegExp(`map=\\d+(?:\\.\\d+)?/(${NUM})/(${NUM})`));
    if (hashMap) {
      const p = pairToPoint(hashMap[1], hashMap[2]);
      if (p && isValidPoint(p)) return { points: [p], provider: 'osm', note: 'map centre' };
    }
    const old = pairToPoint(q.get('lat'), q.get('lon'));
    if (q.get('lat') !== null && old && isValidPoint(old)) return { points: [old], provider: 'osm', note: 'map centre' };
    return { error: 'No coordinates found in this OpenStreetMap link.' };
  }

  // --- Apple Maps ---
  if (host === 'maps.apple.com' || host.endsWith('.maps.apple.com')) {
    // legacy saddr / daddr, or the unified /directions?source=&destination=&waypoint=
    const from = coordsFromParam(q.get('saddr')) || coordsFromParam(q.get('source'));
    const to = coordsFromParam(q.get('daddr')) || coordsFromParam(q.get('destination'));
    if (from && to) return withStops(from, q.getAll('waypoint'), to, 'apple');
    for (const key of ['coordinate', 'll', 'q', 'daddr', 'destination', 'saddr', 'source', 'address', 'sll', 'center']) {
      const p = coordsFromParam(q.get(key));
      if (p) return { points: [p], provider: 'apple', note: key === 'sll' || key === 'center' ? 'map centre' : undefined };
    }
    return { error: 'No coordinates found in this Apple Maps link.' };
  }

  // --- Google Maps ---
  if (/(^|\.)google\.[a-z.]+$/.test(host)) {
    // /maps/dir/lat,lon/lat,lon/...
    const dir = decodedPath.match(/\/maps\/dir\/(.+)/);
    if (dir) {
      const stops = dir[1].split('/').filter((seg) => seg && !seg.startsWith('@') && !seg.startsWith('data='));
      // Google writes a typed "lat, lon" stop with "+" for the space: 37.7749,+-122.4194
      const pts = stops.map((seg) => coordsFromParam(seg.replace(/\+/g, ' '))).filter(Boolean);
      if (pts.length) {
        return pts.length < stops.length
          ? { points: pts, provider: 'google', note: 'stops given as place names were skipped' }
          : { points: pts, provider: 'google' };
      }
    }
    const from = coordsFromParam(q.get('origin')) || coordsFromParam(q.get('saddr'));
    const to = coordsFromParam(q.get('destination')) || coordsFromParam(q.get('daddr'));
    // Maps URLs: waypoints= holds the stops in between, separated by "|"
    if (from && to) return withStops(from, (q.get('waypoints') || '').split('|'), to, 'google');
    // the dropped pin inside the data blob: !3d<lat>!4d<lon>
    const pin = (decodedPath + decodedHash).match(new RegExp(`!3d(${NUM})!4d(${NUM})`));
    if (pin) {
      const p = pairToPoint(pin[1], pin[2]);
      if (p && isValidPoint(p)) return { points: [p], provider: 'google' };
    }
    for (const key of ['q', 'query', 'destination', 'daddr', 'll', 'center', 'viewpoint', 'origin', 'saddr', 'sll']) {
      const p = coordsFromParam(q.get(key));
      if (p) return { points: [p], provider: 'google' };
    }
    const place = decodedPath.match(new RegExp(`/maps/(?:place|search)/(${NUM}),\\+?(${NUM})`));
    if (place) {
      const p = pairToPoint(place[1], place[2]);
      if (p && isValidPoint(p)) return { points: [p], provider: 'google' };
    }
    const at = decodedPath.match(new RegExp(`@(${NUM}),(${NUM})`));
    if (at) {
      const p = pairToPoint(at[1], at[2]);
      if (p && isValidPoint(p)) return { points: [p], provider: 'google', note: 'map centre' };
    }
    return { error: 'No coordinates found in this Google Maps link.' };
  }

  return { error: 'This link is not from Google Maps, Apple Maps or OpenStreetMap.' };
}

/**
 * One line of pasted text -> { points: [...], note? } or { error }.
 * Accepts decimal "lat, lon", degrees-minutes-seconds, and map links.
 */
export function parseCoordinateLine(line) {
  const s = String(line).trim();
  if (!s) return { points: [] };
  if (/^(https?:\/\/|geo:)/i.test(s)) return parseMapUrl(s);
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}[/?]\S*$/i.test(s)) return parseMapUrl('https://' + s);
  const parts = splitPair(s);
  if (!parts) return { error: 'Could not read a latitude and longitude.' };
  const a = parseAngle(parts[0]);
  const b = parseAngle(parts[1]);
  if (!a || !b) return { error: 'Could not read a latitude and longitude.' };
  let lat = a.value;
  let lon = b.value;
  let note;
  const aIsLon = a.hemi === 'E' || a.hemi === 'W';
  const bIsLat = b.hemi === 'N' || b.hemi === 'S';
  if ((a.hemi === 'N' || a.hemi === 'S') && bIsLat) return { error: 'Both values are latitudes.' };
  if (aIsLon && (b.hemi === 'E' || b.hemi === 'W')) return { error: 'Both values are longitudes.' };
  if (aIsLon || bIsLat) {
    [lat, lon] = [lon, lat];
  } else if (!a.hemi && !b.hemi && Math.abs(lat) > 90 && Math.abs(lat) <= 180 && Math.abs(lon) <= 90) {
    [lat, lon] = [lon, lat];
    note = 'read as longitude, latitude because the first number is beyond 90';
  }
  if (Math.abs(lat) > 90) return { error: 'Latitude must be between -90 and 90.' };
  if (Math.abs(lon) > 180) return { error: 'Longitude must be between -180 and 180.' };
  return note ? { points: [{ lat, lon }], note } : { points: [{ lat, lon }] };
}

/**
 * A block of pasted text, one point (or link) per line.
 * Returns { points, errors: [{ line, text, reason }], notes: [{ line, text, note }] }.
 * Blank lines and lines starting with # are skipped.
 */
export function parsePointsText(text) {
  const points = [];
  const errors = [];
  const notes = [];
  const lines = String(text).split(/\r\n|\n|\r/);
  lines.forEach((raw, idx) => {
    const t = raw.trim();
    if (!t || t.startsWith('#')) return;
    const res = parseCoordinateLine(t);
    if (res.error) {
      errors.push({ line: idx + 1, text: t.length > 80 ? t.slice(0, 77) + '...' : t, reason: res.error });
      return;
    }
    for (const p of res.points) points.push(p);
    if (res.note) notes.push({ line: idx + 1, text: t.length > 80 ? t.slice(0, 77) + '...' : t, note: res.note });
  });
  return { points, errors, notes };
}

/** Points -> text for the paste box, one "lat, lon" per line. */
export function pointsToText(points, decimals = 6) {
  return points.map((p) => `${formatCoord(p.lat, decimals)}, ${formatCoord(p.lon, decimals)}`).join('\n');
}

/* --------------------------------------------------------------------------
   A small XML tokenizer and tree builder (runs the same in Node and browsers)
   -------------------------------------------------------------------------- */

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeEntities(s) {
  if (s.indexOf('&') === -1) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, ref) => {
    if (ref[0] === '#') {
      const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      try { return String.fromCodePoint(code); } catch { return whole; }
    }
    return Object.prototype.hasOwnProperty.call(ENTITIES, ref) ? ENTITIES[ref] : whole;
  });
}

const ATTR_RE = /([^\s=/]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

/**
 * Yields { type: 'open', name, attrs, selfClosing }, { type: 'close', name }
 * and { type: 'text', value }. Comments, processing instructions and DOCTYPE
 * are skipped. Throws on markup that never closes.
 */
export function* tokenizeXML(src) {
  const n = src.length;
  let i = 0;
  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt === -1) {
      yield { type: 'text', value: decodeEntities(src.slice(i)) };
      return;
    }
    if (lt > i) yield { type: 'text', value: decodeEntities(src.slice(i, lt)) };
    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt + 4);
      if (end === -1) throw new Error('XML comment is never closed');
      i = end + 3;
    } else if (src.startsWith('<![CDATA[', lt)) {
      const end = src.indexOf(']]>', lt + 9);
      if (end === -1) throw new Error('XML CDATA section is never closed');
      yield { type: 'text', value: src.slice(lt + 9, end) };
      i = end + 3;
    } else if (src.startsWith('<?', lt)) {
      const end = src.indexOf('?>', lt + 2);
      if (end === -1) throw new Error('XML declaration is never closed');
      i = end + 2;
    } else if (src.startsWith('<!', lt)) {
      // DOCTYPE, possibly with an internal subset in [ ... ]
      let depth = 0;
      let j = lt + 2;
      for (; j < n; j++) {
        const c = src[j];
        if (c === '[') depth++;
        else if (c === ']') depth--;
        else if (c === '>' && depth <= 0) break;
      }
      if (j >= n) throw new Error('XML DOCTYPE is never closed');
      i = j + 1;
    } else {
      // find the closing ">" while skipping quoted attribute values
      let j = lt + 1;
      let quote = null;
      for (; j < n; j++) {
        const c = src[j];
        if (quote) {
          if (c === quote) quote = null;
        } else if (c === '"' || c === "'") {
          quote = c;
        } else if (c === '>') {
          break;
        }
      }
      if (j >= n) throw new Error('XML tag is never closed');
      const body = src.slice(lt + 1, j);
      i = j + 1;
      if (body[0] === '/') {
        yield { type: 'close', name: body.slice(1).trim() };
      } else {
        const selfClosing = body.endsWith('/');
        const inner = selfClosing ? body.slice(0, -1) : body;
        const nameMatch = inner.match(/^[^\s/]+/);
        if (!nameMatch) throw new Error('XML tag has no name');
        const attrs = {};
        ATTR_RE.lastIndex = 0;
        const attrText = inner.slice(nameMatch[0].length);
        let m;
        while ((m = ATTR_RE.exec(attrText))) attrs[m[1]] = decodeEntities(m[2] !== undefined ? m[2] : m[3]);
        yield { type: 'open', name: nameMatch[0], attrs, selfClosing };
      }
    }
  }
}

const localName = (name) => { const c = name.indexOf(':'); return c === -1 ? name : name.slice(c + 1); };

/** Build a light tree: { name, local, attrs, children, text }. */
export function parseXML(src) {
  const text = String(src).replace(/^\ufeff/, '');
  const doc = { name: '#document', local: '#document', attrs: {}, children: [], text: '' };
  const stack = [doc];
  for (const tok of tokenizeXML(text)) {
    const top = stack[stack.length - 1];
    if (tok.type === 'text') {
      top.text += tok.value;
    } else if (tok.type === 'open') {
      const node = { name: tok.name, local: localName(tok.name), attrs: tok.attrs, children: [], text: '' };
      top.children.push(node);
      if (!tok.selfClosing) stack.push(node);
    } else {
      if (stack.length === 1 || top.name !== tok.name) {
        throw new Error(`XML is not well formed: found </${tok.name}>` + (stack.length > 1 ? ` while <${top.name}> is open` : ' with nothing open'));
      }
      stack.pop();
    }
  }
  if (stack.length > 1) throw new Error(`XML is not well formed: <${stack[stack.length - 1].name}> is never closed`);
  const root = doc.children[0];
  if (!root) throw new Error('No XML element found');
  return root;
}

function walk(node, visit, parent = null) {
  visit(node, parent);
  for (const child of node.children) walk(child, visit, node);
}

const childText = (node, local) => {
  const c = node.children.find((x) => x.local === local);
  return c ? c.text.trim() : null;
};

/* --------------------------------------------------------------------------
   File parsers (all take the file's text)
   -------------------------------------------------------------------------- */

function toNumber(v) {
  if (v === null || v === undefined) return NaN;
  const s = String(v).trim();
  return s === '' ? NaN : Number(s);
}

/**
 * GPX 1.0 / 1.1. Returns every <wpt>, <rtept> and <trkpt> in document order:
 * { format: 'gpx', points: [{ lat, lon, kind, timeRaw, timeCount }], counts }.
 * Bad coordinates are kept (as NaN or out of range) so the doctor can report them.
 */
export function parseGPX(text) {
  const root = parseXML(text);
  if (root.local !== 'gpx') throw new Error('This is XML, but not a GPX file (the top element is <' + root.name + '>).');
  const counts = { wpt: 0, rtept: 0, trkpt: 0, rte: 0, trk: 0, trkseg: 0 };
  const points = [];
  walk(root, (node) => {
    const kind = node.local;
    if (kind === 'rte' || kind === 'trk' || kind === 'trkseg') counts[kind]++;
    if (kind !== 'wpt' && kind !== 'rtept' && kind !== 'trkpt') return;
    counts[kind]++;
    const times = node.children.filter((c) => c.local === 'time');
    points.push({
      lat: toNumber(node.attrs.lat),
      lon: toNumber(node.attrs.lon),
      kind,
      timeRaw: times.length ? times[0].text.trim() : null,
      timeCount: times.length,
    });
  });
  return { format: 'gpx', points, counts, version: root.attrs.version || null, creator: root.attrs.creator || null };
}

/**
 * KML. Reads every <coordinates> list ("lon,lat[,alt]" tuples separated by
 * whitespace) and every <gx:coord> ("lon lat [alt]"), in document order.
 * <when> elements in a gx:Track are paired with its <gx:coord> elements.
 * Each point records `geom`: 'point' for a <Point> placemark, 'line' otherwise.
 */
export function parseKML(text) {
  const root = parseXML(text);
  const points = [];
  let found = false;
  walk(root, (node, parent) => {
    if (node.local === 'coordinates') {
      found = true;
      const geom = parent && parent.local === 'Point' ? 'point' : 'line';
      for (const tuple of node.text.trim().split(/\s+/)) {
        if (!tuple) continue;
        const parts = tuple.split(',');
        points.push({ lat: toNumber(parts[1]), lon: toNumber(parts[0]), kind: 'coordinates', geom, timeRaw: null, timeCount: 0 });
      }
    } else if (node.local === 'Track') {
      const whens = node.children.filter((c) => c.local === 'when').map((c) => c.text.trim());
      const coords = node.children.filter((c) => c.local === 'coord');
      coords.forEach((c, i) => {
        found = true;
        const parts = c.text.trim().split(/\s+/);
        const when = whens[i] !== undefined ? whens[i] : null;
        points.push({ lat: toNumber(parts[1]), lon: toNumber(parts[0]), kind: 'gx:coord', geom: 'line', timeRaw: when, timeCount: when === null ? 0 : 1 });
      });
    }
  });
  if (root.local !== 'kml' && !found) throw new Error('This is XML, but not a KML file (the top element is <' + root.name + '>).');
  return { format: 'kml', points };
}

/**
 * GeoJSON (RFC 7946). Collects every position from any geometry type,
 * including inside Feature, FeatureCollection and GeometryCollection.
 * A position is [longitude, latitude, (altitude)]. Each point records `geom`:
 * 'point' for Point and MultiPoint, 'line' for the other geometry types.
 */
export function parseGeoJSON(text) {
  let data;
  try {
    data = JSON.parse(String(text).replace(/^\ufeff/, ''));
  } catch (e) {
    throw new Error('This is not valid JSON: ' + e.message);
  }
  const points = [];
  const position = (pos, geom) => {
    if (!Array.isArray(pos) || pos.length < 2) throw new Error('GeoJSON has a position that is not [longitude, latitude].');
    points.push({ lat: toNumber(pos[1]), lon: toNumber(pos[0]), kind: 'position', geom, timeRaw: null, timeCount: 0 });
  };
  const nested = (coords, depth, geom) => {
    if (!Array.isArray(coords)) throw new Error('GeoJSON geometry has no coordinates array.');
    if (depth === 0) position(coords, geom);
    else for (const c of coords) nested(c, depth - 1, geom);
  };
  const DEPTH = { Point: 0, MultiPoint: 1, LineString: 1, MultiLineString: 2, Polygon: 2, MultiPolygon: 3 };
  const visit = (obj) => {
    if (obj === null || typeof obj !== 'object') throw new Error('GeoJSON object expected.');
    if (obj.type === 'FeatureCollection') {
      if (!Array.isArray(obj.features)) throw new Error('FeatureCollection has no features array.');
      obj.features.forEach(visit);
    } else if (obj.type === 'Feature') {
      if (obj.geometry) visit(obj.geometry);
    } else if (obj.type === 'GeometryCollection') {
      if (!Array.isArray(obj.geometries)) throw new Error('GeometryCollection has no geometries array.');
      obj.geometries.forEach(visit);
    } else if (Object.prototype.hasOwnProperty.call(DEPTH, obj.type)) {
      nested(obj.coordinates, DEPTH[obj.type], obj.type === 'Point' || obj.type === 'MultiPoint' ? 'point' : 'line');
    } else {
      throw new Error('Not GeoJSON: unknown type ' + JSON.stringify(obj.type) + '.');
    }
  };
  visit(data);
  return { format: 'geojson', points };
}

function splitCsvLine(line, delim) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') {
      quoted = true;
    } else if (c === delim) {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const headerKey = (h) => h.toLowerCase().replace(/[^a-z]/g, '').replace(/(deg|degrees|dd)$/, '');
const LAT_NAMES = new Set(['lat', 'latitude', 'y']);
const LON_NAMES = new Set(['lon', 'lng', 'long', 'longitude', 'x']);
const TIME_NAMES = new Set(['time', 'timestamp', 'datetime', 'date', 'utc']);

/** Column for an exact header name, else for a name that starts with one ("Longitude (WGS84)"). */
function findColumn(keys, names, prefixes) {
  const exact = keys.findIndex((k) => names.has(k));
  return exact !== -1 ? exact : keys.findIndex((k) => prefixes.some((p) => k.startsWith(p)));
}

/**
 * CSV / TSV. Sniffs the delimiter (comma, semicolon or tab) and looks for a
 * header naming the latitude and longitude columns. Without a header the first
 * two columns are read as latitude, longitude. With ";" or tab between the
 * fields, a decimal comma ("48,85") is read as a decimal point.
 */
export function parseCSV(text) {
  const lines = String(text).replace(/^\ufeff/, '').split(/\r\n|\n|\r/).filter((l) => l.trim() !== '');
  if (lines.length === 0) throw new Error('The file is empty.');
  const count = (ch) => lines[0].split(ch).length - 1;
  let delim = [',', ';', '\t'].reduce((best, ch) => (count(ch) > count(best) ? ch : best), ',');
  if (delim === ',') {
    // "48,85;2,29": the commas are decimal commas and ";" (or a tab) is the separator
    for (const ch of [';', '\t']) {
      if (count(ch) > 0 && splitCsvLine(lines[0], ch).every((c) => !c.includes(',') || DECIMAL_COMMA_RE.test(c))) {
        delim = ch;
        break;
      }
    }
  }
  const cellsOf = (line) => {
    const cells = splitCsvLine(line, delim);
    return delim === ',' ? cells : cells.map((c) => (DECIMAL_COMMA_RE.test(c) ? c.replace(',', '.') : c));
  };
  const first = cellsOf(lines[0]);
  const isNumeric = (s) => s !== '' && Number.isFinite(Number(s));
  const hasHeader = !(first.length >= 2 && isNumeric(first[0]) && isNumeric(first[1]));
  let latCol = 0;
  let lonCol = 1;
  let timeCol = -1;
  if (hasHeader) {
    const keys = first.map(headerKey);
    latCol = findColumn(keys, LAT_NAMES, ['latitude', 'lat']);
    lonCol = findColumn(keys, LON_NAMES, ['longitude', 'long', 'lon', 'lng']);
    timeCol = keys.findIndex((k) => TIME_NAMES.has(k));
    if (latCol === -1 || lonCol === -1 || latCol === lonCol) {
      const err = new Error('Could not find latitude and longitude columns. Name them "lat" and "lon" in the first row.');
      // A table: a row of names over rows of numbers. Guessing its column order
      // could swap latitude and longitude, so parseRouteFile reports this error.
      err.tabular = first.length >= 2 && !!parseCoordinateLine(lines[0]).error &&
        lines.slice(1).some((l) => { const c = cellsOf(l); return c.length >= 2 && isNumeric(c[0]) && isNumeric(c[1]); });
      throw err;
    }
  }
  const points = [];
  let skipped = 0;
  for (let i = hasHeader ? 1 : 0; i < lines.length; i++) {
    const cells = cellsOf(lines[i]);
    if (!isNumeric(cells[latCol] || '') || !isNumeric(cells[lonCol] || '')) { skipped++; continue; }
    const timeRaw = timeCol >= 0 && cells[timeCol] ? cells[timeCol] : null;
    points.push({ lat: Number(cells[latCol]), lon: Number(cells[lonCol]), kind: 'row', timeRaw, timeCount: timeRaw ? 1 : 0 });
  }
  return { format: 'csv', points, hasHeader, delimiter: delim, skippedRows: skipped };
}

/** Guess the format from the file name, then from the content. */
export function detectFormat(text, filename = '') {
  const ext = (String(filename).toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';
  if (ext === 'kmz') return 'kmz';
  if (ext === 'gpx') return 'gpx';
  if (ext === 'kml') return 'kml';
  if (ext === 'geojson' || ext === 'json') return 'geojson';
  if (ext === 'csv' || ext === 'tsv') return 'csv';
  const head = String(text).replace(/^\ufeff/, '').trimStart().slice(0, 2000);
  if (head.startsWith('PK')) return 'kmz';
  if (head[0] === '{' || head[0] === '[') return 'geojson';
  if (head[0] === '<') {
    if (/<gpx[\s>]/i.test(head)) return 'gpx';
    if (/<kml[\s>]/i.test(head) || /<(Placemark|Document)[\s>]/.test(head)) return 'kml';
    return 'xml';
  }
  return 'csv';
}

/**
 * Parse any supported route file. Returns the parser's result plus `format`.
 * Plain text that is not CSV falls back to the pasted-coordinates parser.
 */
export function parseRouteFile(text, filename = '') {
  const format = detectFormat(text, filename);
  if (format === 'kmz') throw new Error('KMZ files are zipped. Unzip the file and drop the .kml inside it.');
  if (format === 'gpx') return parseGPX(text);
  if (format === 'kml') return parseKML(text);
  if (format === 'geojson') return parseGeoJSON(text);
  if (format === 'xml') {
    // the sniffer only looks at the start of the file, so check the real top element
    const root = parseXML(text);
    if (root.local === 'gpx') return parseGPX(text);
    if (root.local === 'kml') return parseKML(text);
    throw new Error('This XML file is not GPX or KML (the top element is <' + root.name + '>).');
  }
  try {
    const csv = parseCSV(text);
    if (csv.points.length > 0) return csv;
  } catch (e) {
    if (e.tabular) throw e;
    const pasted = parsePointsText(text);
    if (pasted.points.length > 0) {
      return { format: 'text', points: pasted.points.map((p) => ({ ...p, kind: 'line', timeRaw: null, timeCount: 0 })) };
    }
    throw e;
  }
  const pasted = parsePointsText(text);
  if (pasted.points.length > 0) {
    return { format: 'text', points: pasted.points.map((p) => ({ ...p, kind: 'line', timeRaw: null, timeCount: 0 })) };
  }
  throw new Error('No coordinates found in this file.');
}

/**
 * Pick the points that form the route out of a parsed file. For GPX this
 * prefers track points, then route points, then waypoints, because a file
 * with a track usually uses waypoints for places of interest, not the path.
 * KML and GeoJSON get the same rule: when the file has lines, its single
 * Point placemarks or features (start and end pins) are left out
 * (used = 'lines', with `pins` counting what was left out).
 * Only valid, in-range points are returned.
 */
export function routePointsFrom(parsed) {
  let pts = parsed.points;
  let used = null;
  let pins = 0;
  if (parsed.format === 'gpx') {
    used = parsed.counts.trkpt ? 'trkpt' : parsed.counts.rtept ? 'rtept' : 'wpt';
    pts = pts.filter((p) => p.kind === used);
  } else if ((parsed.format === 'kml' || parsed.format === 'geojson') &&
    pts.some((p) => p.geom === 'line') && pts.some((p) => p.geom === 'point')) {
    used = 'lines';
    const lines = pts.filter((p) => p.geom !== 'point');
    pins = pts.length - lines.length;
    pts = lines;
  }
  const points = pts.filter(isValidPoint).map((p) => ({ lat: p.lat, lon: p.lon }));
  const out = { points, used, dropped: pts.length - points.length };
  if (pins) out.pins = pins;
  return out;
}

/* --------------------------------------------------------------------------
   The GPX doctor
   -------------------------------------------------------------------------- */

const TIME_RE = /^(\d{4})-(\d{2})-(\d{2})[Tt ](\d{2}):(\d{2}):(\d{2})([.,]\d+)?\s*([Zz]|[+-]\d{2}(?::?\d{2})?)?$/;
// The exact XML Schema dateTime form. TIME_RE above also reads near misses
// (a space or "t" for the T, a lowercase z) so their instant is known, and the
// doctor reports them separately, because the Android Emulator's parser needs
// the uppercase T.
const STRICT_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;

/**
 * Read a GPX-style time. Returns
 *   { valid, ms, hasFraction, zone: 'Z' | 'offset' | 'none' }
 * where ms is the real instant (offset and fraction applied).
 */
export function parseTimestamp(raw) {
  if (raw === null || raw === undefined) return { valid: false };
  const m = String(raw).trim().match(TIME_RE);
  if (!m) return { valid: false };
  const [, Y, Mo, D, h, mi, s, frac, zone] = m;
  const base = Date.UTC(+Y, +Mo - 1, +D, +h, +mi, +s);
  if (Number.isNaN(base) || +Mo < 1 || +Mo > 12 || +D < 1 || +D > 31 || +h > 24 || +mi > 59 || +s > 60) return { valid: false };
  // a day the month does not have (2026-02-30) would roll over into the next month
  const day = new Date(Date.UTC(+Y, +Mo - 1, +D));
  if (day.getUTCDate() !== +D || day.getUTCMonth() !== +Mo - 1) return { valid: false };
  let ms = base + (frac ? Math.round(Number('0.' + frac.slice(1)) * 1000) : 0);
  let zoneKind = 'none';
  if (zone) {
    if (/^z$/i.test(zone)) {
      zoneKind = 'Z';
    } else {
      const zm = zone.match(/^([+-])(\d{2}):?(\d{2})?$/);
      const minutes = +zm[2] * 60 + (zm[3] ? +zm[3] : 0);
      ms -= (zm[1] === '-' ? -1 : 1) * minutes * 60000;
      zoneKind = 'offset';
    }
  }
  return { valid: true, ms, hasFraction: !!frac, zone: zoneKind };
}

const plural = (n, one, many) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/**
 * Check a parsed route file for the mistakes that stop it playing in Xcode or
 * the Android Emulator. Works on the result of any parser in this file.
 *
 * Returns { stats, findings }.
 *   stats    { count, distance, duration, avgSpeed, timedCount }
 *            (duration and avgSpeed are null when the file has no usable times)
 *   findings [{ id, level: 'problem' | 'warning' | 'note', affects, count, message, source? }]
 */
export function diagnose(parsed) {
  const pts = parsed.points || [];
  const findings = [];
  const add = (id, level, affects, count, message, source) =>
    findings.push(source ? { id, level, affects, count, message, source } : { id, level, affects, count, message });

  if (pts.length === 0) {
    add('no-points', 'problem', 'both', 0, 'No points were found in this file, so there is nothing to play.');
    return { stats: { count: 0, distance: 0, duration: null, avgSpeed: null, timedCount: 0 }, findings };
  }

  // --- structure (GPX only) ---
  if (parsed.format === 'gpx') {
    const { wpt, rtept, trkpt, trk, rte } = parsed.counts;
    if (trk > 0 || rte > 0) {
      const parts = [];
      if (trk > 0) parts.push(`<trk> (${plural(trkpt, 'track point', 'track points')})`);
      if (rte > 0) parts.push(`<rte> (${plural(rtept, 'route point', 'route points')})`);
      const tail = wpt > 0
        ? `Xcode will ignore them and play only the ${plural(wpt, 'waypoint', 'waypoints')}.`
        : 'Xcode will ignore this, and the file has no <wpt> waypoints, so Xcode has nothing to play.';
      add('xcode-trk-rte', wpt > 0 ? 'warning' : 'problem', 'xcode', trkpt + rtept,
        `This file uses ${parts.join(' and ')}. Xcode's location simulation does not support the route and track tags, only <wpt> waypoints. ${tail} Convert the points to <wpt>.`,
        SOURCES.appleHelpDebugger);
    }
    const multi = pts.filter((p) => p.timeCount > 1).length;
    if (multi > 0) {
      add('time-multiple', 'problem', 'xcode', multi,
        `${plural(multi, 'point has', 'points have')} more than one <time> element. Xcode rejects a waypoint with multiple time elements.`);
    }
  }

  // --- coordinates ---
  const badRange = [];
  let swapped = 0;
  pts.forEach((p, i) => {
    const latOk = Number.isFinite(p.lat) && Math.abs(p.lat) <= 90;
    const lonOk = Number.isFinite(p.lon) && Math.abs(p.lon) <= 180;
    if (!latOk || !lonOk) badRange.push(i);
    if (Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) > 90 && Math.abs(p.lat) <= 180 && Math.abs(p.lon) <= 90) swapped++;
  });
  if (badRange.length > 0) {
    add('coord-range', 'problem', 'both', badRange.length,
      `${plural(badRange.length, 'point has', 'points have')} a missing or out-of-range coordinate (first at point ${badRange[0] + 1}). Latitude must be between -90 and 90 and longitude between -180 and 180.`,
      SOURCES.gpx11);
  }
  if (swapped > 0) {
    add('latlon-swap', 'problem', 'both', swapped,
      `${plural(swapped, 'point looks', 'points look')} like latitude and longitude are swapped: the latitude is beyond 90 while the longitude would fit as a latitude.`);
  }

  let duplicates = 0;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].lat === pts[i - 1].lat && pts[i].lon === pts[i - 1].lon) duplicates++;
  }
  if (duplicates > 0) {
    add('duplicate-points', 'note', 'both', duplicates,
      `${plural(duplicates, 'point repeats', 'points repeat')} the point before. That is fine if the route is meant to pause there. Otherwise remove the repeats.`);
  }

  if (pts.length > LIMITS.doctorMaxPoints) {
    add('too-many-points', 'warning', 'both', pts.length,
      `The file has ${pts.length.toLocaleString('en-US')} points, more than ${LIMITS.doctorMaxPoints.toLocaleString('en-US')}. Large files are slow to load and play. Thin the route or split it.`);
  }

  // --- times ---
  const times = pts.map((p) => (p.timeRaw === null || p.timeRaw === undefined || p.timeRaw === '' ? null : parseTimestamp(p.timeRaw)));
  const withTime = times.filter((t) => t !== null).length;
  const missing = pts.length - withTime;
  const invalid = times.filter((t) => t !== null && !t.valid).length;
  const timeMatters = parsed.format === 'gpx' || parsed.format === 'kml' || withTime > 0;

  if (timeMatters && missing > 0 && pts.length > 1) {
    const all = missing === pts.length;
    add('time-missing', 'warning', 'both', missing,
      (all ? 'No point has a <time>.' : `${plural(missing, 'point has', 'points have')} no <time>.`) +
      ' Without times Xcode moves at a fixed speed you cannot set, and the Android Emulator, which sorts points by time, has nothing to order or pace them by.');
  }
  if (invalid > 0) {
    add('time-invalid', 'problem', 'both', invalid,
      `${plural(invalid, 'time is', 'times are')} not valid ISO 8601 date-times. Use the form YYYY-MM-DDTHH:MM:SSZ, which both simulators read.`, SOURCES.gpx11);
  }
  const loose = pts.filter((p, i) => times[i] && times[i].valid && !STRICT_TIME_RE.test(String(p.timeRaw).trim())).length;
  if (loose > 0) {
    add('time-format', 'problem', 'both', loose,
      `${plural(loose, 'time is', 'times are')} not written exactly as YYYY-MM-DDTHH:MM:SS followed by Z or an offset such as +02:00. Common causes are a space or a lowercase t between the date and the time, a lowercase z, or an offset without a colon. The Android Emulator rejects the whole file when the letter between the date and the time is not an uppercase T, and GPX 1.1 times must be XML Schema dateTime values.`,
      SOURCES.aospGpxParser);
  }
  const fractions = times.filter((t) => t && t.valid && t.hasFraction).length;
  if (fractions > 0) {
    add('time-fraction', 'problem', 'both', fractions,
      `${plural(fractions, 'time has', 'times have')} fractional seconds. Xcode requires times without milliseconds, and the Android Emulator reads whole seconds only, so points less than a second apart collapse onto the same time.`);
  }
  const offsets = times.filter((t) => t && t.valid && t.zone !== 'Z').length;
  if (offsets > 0) {
    add('time-offset', 'warning', 'both', offsets,
      `${plural(offsets, 'time does', 'times do')} not end in Z. GPX times are meant to be UTC, and the Android Emulator ignores anything after the seconds, so an offset such as +02:00 is not applied.`,
      SOURCES.gpx11);
  }

  let notIncreasing = 0;
  let firstBad = -1;
  let fast = 0;
  let maxSpeed = 0;
  let distance = 0;
  let prevTimed = null; // index of the previous point with a valid time
  for (let i = 0; i < pts.length; i++) {
    if (i > 0 && isValidPoint(pts[i]) && isValidPoint(pts[i - 1])) distance += haversine(pts[i - 1], pts[i]);
    const t = times[i];
    if (!t || !t.valid) continue;
    if (prevTimed !== null) {
      // compare whole seconds, which is all either simulator reads
      const dt = Math.floor(t.ms / 1000) - Math.floor(times[prevTimed].ms / 1000);
      if (dt <= 0) {
        notIncreasing++;
        if (firstBad === -1) firstBad = i;
      }
      const exact = (t.ms - times[prevTimed].ms) / 1000;
      if (exact > 0 && prevTimed === i - 1 && isValidPoint(pts[i]) && isValidPoint(pts[i - 1])) {
        const v = haversine(pts[i - 1], pts[i]) / exact;
        if (v > LIMITS.maxSpeedMps) fast++;
        if (v > maxSpeed) maxSpeed = v;
      }
    }
    prevTimed = i;
  }
  if (notIncreasing > 0) {
    add('time-not-increasing', 'problem', 'both', notIncreasing,
      `${plural(notIncreasing, 'point has', 'points have')} a time that is equal to or earlier than the point before (first at point ${firstBad + 1}). Xcode requires each waypoint to be later than the previous one, and the Android Emulator sorts points by time, so the route plays in a different order than the file.`);
  }
  if (fast > 0) {
    add('speed', 'warning', 'both', fast,
      `${plural(fast, 'segment implies', 'segments imply')} a speed above ${LIMITS.maxSpeedMps} m/s (the fastest is ${Math.round(maxSpeed).toLocaleString('en-US')} m/s, about ${Math.round(maxSpeed * 3.6).toLocaleString('en-US')} km/h). That usually means a wrong timestamp or a jump between two separate recordings.`);
  }

  const validTimes = times.filter((t) => t && t.valid).map((t) => t.ms);
  let duration = null;
  if (validTimes.length >= 2) {
    const [lo, hi] = extent(validTimes);
    duration = hi > lo ? (hi - lo) / 1000 : null;
  }
  const stats = {
    count: pts.length,
    distance,
    duration,
    avgSpeed: duration ? distance / duration : null,
    timedCount: validTimes.length,
  };
  return { stats, findings };
}

// Math.max(...array) overflows the call stack for very large arrays.
function extent(values) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return [lo, hi];
}

/* --------------------------------------------------------------------------
   Display helpers (pure, shared by the page and the tests)
   -------------------------------------------------------------------------- */

export function formatDistance(m) {
  if (!Number.isFinite(m)) return '-';
  return m >= 1000 ? `${(m / 1000).toFixed(m >= 100000 ? 0 : 2)} km` : `${m.toFixed(m >= 100 ? 0 : 1)} m`;
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return '-';
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`;
  if (m > 0) return `${m} min ${String(sec).padStart(2, '0')} s`;
  return `${sec} s`;
}

export function formatSpeed(mps) {
  if (!Number.isFinite(mps)) return '-';
  return `${Number(mps.toFixed(2))} m/s (${(mps * 3.6).toFixed(1)} km/h, ${(mps * 2.236936).toFixed(1)} mph)`;
}
