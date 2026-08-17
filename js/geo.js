// Graticule construction, frame ticks, coordinate labels.
//
// Every graticule line is traced through the projection with a recording path
// context. The projection carries clipExtent(map rect) plus, on globe and
// satellite views, clipAngle(horizon), so a traced sub path is already cut to
// what is visible and its end points sit exactly on the frame where the line
// leaves the map. That is what turns into a border tick.

import {latLimit, visibleBox} from './projections.js';

const DEG = Math.PI / 180;

/** Ladder of labelled graticule steps in degrees, coarse to fine. */
const MAJOR_STEPS = [90, 60, 45, 30, 20, 15, 10, 5, 2, 1, 0.5, 0.25, 1 / 6, 1 / 12, 1 / 30, 1 / 60];

/** Subdivision for each labelled step, chosen to stay on whole minutes. */
const MINOR_OF = new Map([
  [90, 15],
  [60, 15],
  [45, 15],
  [30, 10],
  [20, 5],
  [15, 5],
  [10, 2],
  [5, 1],
  [2, 0.5],
  [1, 0.25],
  [0.5, 0.1],
  [0.25, 0.05],
  [1 / 6, 1 / 60],
  [1 / 12, 1 / 60],
  [1 / 30, 1 / 120],
  [1 / 60, 1 / 300],
]);

export function minorFor(major) {
  return MINOR_OF.get(major) ?? major / 5;
}

/** Nearest step on the ladder that gives roughly `target` intervals. */
export function pickStep(span, target = 8) {
  const wanted = Math.abs(span) / Math.max(target, 1);
  let best = MAJOR_STEPS[0];
  let bestErr = Infinity;
  for (const s of MAJOR_STEPS) {
    const err = Math.abs(Math.log(s / wanted));
    if (err < bestErr) {
      bestErr = err;
      best = s;
    }
  }
  return best;
}

/**
 * Geographic range actually covered by the map rectangle, found by inverting
 * points around its border. Only points that survive a round trip are used, so
 * corners outside the globe are ignored. Returns null when too few points are
 * usable.
 */
export function rectRange(projection, rect, centreLon, samples = 20) {
  if (typeof projection.invert !== 'function') return null;
  const points = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const x = rect.x0 + (rect.x1 - rect.x0) * t;
    const y = rect.y0 + (rect.y1 - rect.y0) * t;
    points.push([x, rect.y0], [x, rect.y1], [rect.x0, y], [rect.x1, y]);
  }
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  let used = 0;
  for (const p of points) {
    const ll = projection.invert(p);
    if (!ll || !Number.isFinite(ll[0]) || !Number.isFinite(ll[1]) || Math.abs(ll[1]) > 90.0001) continue;
    const back = projection(ll);
    if (!back || Math.hypot(back[0] - p[0], back[1] - p[1]) > 0.5) continue; // not a real inverse here
    let lon = ll[0];
    while (lon - centreLon > 180) lon -= 360;
    while (lon - centreLon < -180) lon += 360;
    west = Math.min(west, lon);
    east = Math.max(east, lon);
    south = Math.min(south, ll[1]);
    north = Math.max(north, ll[1]);
    used++;
  }
  if (used < 8 || !Number.isFinite(west) || east - west > 360) return null;
  return {west, east, south, north};
}

/**
 * Resolves the four graticule steps and the latitude/longitude range the
 * graticule is drawn over. `aim` is what buildProjection reported: centre, clip
 * angle, the projection itself and the map rectangle.
 *
 * A globe or a tilted view only needs lines inside its own field of view. A
 * section needs lines over its box *and* over whatever else the rectangle
 * shows, otherwise a curved conic graticule stops short of the frame and no
 * border ticks are produced.
 */
export function graticuleSpec(state, def, aim = {}) {
  const limit = latLimit(def);
  const section = state.view.mode === 'section';
  const capped = !section && aim.clipAngle != null && aim.clipAngle < 180;
  const global = !section && !capped;

  const requested = section
    ? {
        west: state.view.west,
        east: state.view.east > state.view.west ? state.view.east : state.view.east + 360,
        south: Math.max(Math.min(state.view.south, state.view.north), -limit),
        north: Math.min(Math.max(state.view.south, state.view.north), limit),
      }
    : capped
      ? visibleBox(aim.centre || [0, 0], aim.clipAngle, limit)
      : {west: -180, east: 180, south: -limit, north: limit};

  // The spacing follows the requested section; the range covers the frame.
  let box = requested;
  if (section && aim.projection && aim.rect) {
    const seen = rectRange(aim.projection, aim.rect, (requested.west + requested.east) / 2);
    if (seen) {
      box = {
        west: Math.min(requested.west, seen.west),
        east: Math.max(requested.east, seen.east),
        south: Math.max(Math.min(requested.south, seen.south), -limit),
        north: Math.min(Math.max(requested.north, seen.north), limit),
      };
      if (box.east - box.west > 360) box.east = box.west + 360;
    }
  }

  let majorLon = state.grid.majorLon;
  let majorLat = state.grid.majorLat;
  if (state.grid.auto) {
    majorLon = global ? 15 : pickStep(requested.east - requested.west, 8);
    majorLat = global ? 15 : pickStep(requested.north - requested.south, 6);
  }
  const minorLon = state.grid.auto ? minorFor(majorLon) : state.grid.minorLon;
  const minorLat = state.grid.auto ? minorFor(majorLat) : state.grid.minorLat;

  // Grow the range outward to whole multiples of the step so that lines land on
  // the frame edges of the requested section.
  const down = (v, step) => Math.floor(v / step) * step;
  const up = (v, step) => Math.ceil(v / step) * step;
  const range = {
    west: global ? -180 : down(box.west, minorLon),
    east: global ? 180 : up(box.east, minorLon),
    south: global ? -limit : Math.max(down(box.south, minorLat), -limit),
    north: global ? limit : Math.min(up(box.north, minorLat), limit),
  };
  if (range.east - range.west > 360) range.east = range.west + 360;

  return {majorLon, majorLat, minorLon, minorLat, box, range, limit, global};
}

function seq(from, to, step) {
  const out = [];
  const start = Math.ceil(from / step - 1e-9) * step;
  for (let i = 0; ; i++) {
    const v = start + i * step;
    if (v > to + 1e-9) break;
    out.push(Math.abs(v) < 1e-12 ? 0 : v);
  }
  return out;
}

/** Sampling step in degrees: fine enough that curved lines stay smooth. */
function sampleStep(span) {
  return Math.min(1, Math.max(span / 120, 0.002));
}

function meridianCoords(lon, south, north) {
  const step = sampleStep(north - south);
  const out = [];
  for (let lat = south; lat < north - 1e-9; lat += step) out.push([lon, lat]);
  out.push([lon, north]);
  return out;
}

function parallelCoords(lat, west, east) {
  const step = sampleStep(east - west);
  const out = [];
  for (let lon = west; lon < east - 1e-9; lon += step) out.push([lon, lat]);
  out.push([east, lat]);
  return out;
}

/**
 * All graticule lines for a spec, as {axis, value, coordinates} records.
 * Minor lines that coincide with a labelled line are dropped.
 */
/** Drops meridians that repeat the same place a full turn later. */
function uniqueLons(values) {
  const seen = new Set();
  return values.filter((v) => {
    const key = (((v % 360) + 360) % 360).toFixed(6);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function graticuleLines(spec) {
  const {range} = spec;
  const majorMeridians = uniqueLons(seq(range.west, range.east, spec.majorLon));
  const majorParallels = seq(range.south, range.north, spec.majorLat);
  const isMajorLon = new Set(majorMeridians.map((v) => v.toFixed(6)));
  const isMajorLat = new Set(majorParallels.map((v) => v.toFixed(6)));

  const major = [
    ...majorMeridians.map((lon) => ({
      axis: 'lon',
      value: lon,
      coordinates: meridianCoords(lon, range.south, range.north),
    })),
    ...majorParallels
      .filter((lat) => Math.abs(lat) < 90 - 1e-9)
      .map((lat) => ({axis: 'lat', value: lat, coordinates: parallelCoords(lat, range.west, range.east)})),
  ];

  const minor = [
    ...uniqueLons(seq(range.west, range.east, spec.minorLon))
      .filter((lon) => !isMajorLon.has(lon.toFixed(6)))
      .map((lon) => ({axis: 'lon', value: lon, coordinates: meridianCoords(lon, range.south, range.north)})),
    ...seq(range.south, range.north, spec.minorLat)
      .filter((lat) => !isMajorLat.has(lat.toFixed(6)) && Math.abs(lat) < 90 - 1e-9)
      .map((lat) => ({axis: 'lat', value: lat, coordinates: parallelCoords(lat, range.west, range.east)})),
  ];

  return {major, minor};
}

// --- tracing -----------------------------------------------------------------

function recorder() {
  let subs = [];
  let cur = null;
  return {
    beginPath() {},
    moveTo(x, y) {
      cur = [[x, y]];
      subs.push(cur);
    },
    lineTo(x, y) {
      if (cur) cur.push([x, y]);
    },
    closePath() {
      if (cur && cur.length) cur.push(cur[0].slice());
    },
    arc() {},
    reset() {
      subs = [];
      cur = null;
    },
    result() {
      return subs.filter((s) => s.length > 1);
    },
  };
}

/** Returns trace(geometry) -> array of clipped sub paths in page millimetres. */
export function makeTracer(projection) {
  const rec = recorder();
  const path = globalThis.d3.geoPath(projection, rec);
  return (geometry) => {
    rec.reset();
    path(geometry);
    return rec.result();
  };
}

/**
 * Splits a traced ring wherever it runs along the edge of the map rectangle.
 * Clipping closes a cut coastline along the frame, and dots marching down that
 * straight artificial edge do not belong to any coast — so those points are
 * dropped and each real stretch of coast becomes its own numbered sequence.
 */
function splitAtBorder(points, rect, tol = 0.02) {
  const onBorder = (p) =>
    Math.abs(p[0] - rect.x0) < tol ||
    Math.abs(p[0] - rect.x1) < tol ||
    Math.abs(p[1] - rect.y0) < tol ||
    Math.abs(p[1] - rect.y1) < tol;

  if (!points.some(onBorder)) return [points];
  const out = [];
  let run = [];
  for (const p of points) {
    if (onBorder(p)) {
      if (run.length > 1) out.push(run);
      run = [];
    } else {
      run.push(p);
    }
  }
  if (run.length > 1) out.push(run);
  return out;
}

/**
 * Points spaced evenly along traced polylines, for a connect-the-dots outline.
 *
 * Each ring is walked separately and its spacing is rounded to fit the ring
 * exactly, so a closed coastline comes back to its first dot instead of leaving
 * a gap. Numbering restarts on every ring — one sequence per island, the way a
 * puzzle is drawn. Rings shorter than `minLength` are skipped, and `maxDots`
 * stops a fine spacing on detailed data from producing tens of thousands of
 * circles.
 */
export function dotsAlong(subpaths, spacing, {minLength = 0, maxDots = 5000, border = null} = {}) {
  const step = Math.max(spacing, 0.2);
  const rings = [];
  let total = 0;

  const pieces = border ? subpaths.flatMap((points) => splitAtBorder(points, border)) : subpaths;
  for (const points of pieces) {
    if (points.length < 2) continue;
    const lengths = [];
    let length = 0;
    for (let i = 1; i < points.length; i++) {
      const l = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
      lengths.push(l);
      length += l;
    }
    if (length < Math.max(minLength, 1e-6)) continue;

    const closed = Math.hypot(points[0][0] - points[points.length - 1][0], points[0][1] - points[points.length - 1][1]) < 0.05;
    const count = Math.max(closed ? 3 : 2, Math.round(length / step));
    const gap = length / (closed ? count : count - 1);

    const dots = [];
    let index = 0;
    let walked = 0;
    for (let k = 0; k < count; k++) {
      const target = k * gap;
      while (index < lengths.length - 1 && walked + lengths[index] < target) {
        walked += lengths[index];
        index++;
      }
      const t = lengths[index] > 0 ? (target - walked) / lengths[index] : 0;
      const a = points[index];
      const b = points[index + 1] || a;
      dots.push({
        x: a[0] + (b[0] - a[0]) * Math.min(Math.max(t, 0), 1),
        y: a[1] + (b[1] - a[1]) * Math.min(Math.max(t, 0), 1),
        n: k + 1,
      });
    }
    rings.push(dots);
    total += dots.length;
    if (total >= maxDots) break;
  }
  return {rings, total, truncated: total >= maxDots};
}

export function subpathsToPath(subs, digits = 2) {
  let d = '';
  for (const sp of subs) {
    for (let i = 0; i < sp.length; i++) {
      d += (i ? 'L' : 'M') + sp[i][0].toFixed(digits) + ',' + sp[i][1].toFixed(digits);
    }
  }
  return d;
}

export function roundPath(d, digits = 2) {
  if (!d) return d;
  return d.replace(/-?\d+\.\d+/g, (m) => {
    const v = (+m).toFixed(digits);
    return v.includes('.') ? v.replace(/0+$/, '').replace(/\.$/, '') : v;
  });
}

// --- frame ticks -------------------------------------------------------------

const EDGE_TOL = 5e-4; // millimetres

function edgeOf(pt, rect, axis) {
  const onLeft = Math.abs(pt[0] - rect.x0) < EDGE_TOL;
  const onRight = Math.abs(pt[0] - rect.x1) < EDGE_TOL;
  const onTop = Math.abs(pt[1] - rect.y0) < EDGE_TOL;
  const onBottom = Math.abs(pt[1] - rect.y1) < EDGE_TOL;
  const inside =
    pt[0] >= rect.x0 - EDGE_TOL &&
    pt[0] <= rect.x1 + EDGE_TOL &&
    pt[1] >= rect.y0 - EDGE_TOL &&
    pt[1] <= rect.y1 + EDGE_TOL;
  if (!inside) return null;
  // At a corner, meridians prefer the horizontal edges and parallels the
  // vertical ones, which is where their labels read best.
  const order = axis === 'lon' ? ['top', 'bottom', 'left', 'right'] : ['left', 'right', 'top', 'bottom'];
  const hit = {left: onLeft, right: onRight, top: onTop, bottom: onBottom};
  for (const e of order) if (hit[e]) return e;
  return null;
}

/** Border ticks produced where one graticule line meets the map frame. */
export function lineTicks(subs, rect, line) {
  const ticks = [];
  for (const sp of subs) {
    if (sp.length < 2) continue;
    const ends = [
      [sp[0], sp[1]],
      [sp[sp.length - 1], sp[sp.length - 2]],
    ];
    for (const [pt, prev] of ends) {
      const edge = edgeOf(pt, rect, line.axis);
      if (!edge) continue;
      ticks.push({edge, x: pt[0], y: pt[1], axis: line.axis, value: line.value, inward: prev});
    }
  }
  return ticks;
}

/** Drops ticks that repeat the same value at practically the same spot. */
export function dedupeTicks(ticks, minGap = 0.4) {
  const kept = [];
  for (const t of ticks) {
    const along = t.edge === 'top' || t.edge === 'bottom' ? t.x : t.y;
    const clash = kept.some((k) => {
      if (k.edge !== t.edge) return false;
      const kAlong = k.edge === 'top' || k.edge === 'bottom' ? k.x : k.y;
      return Math.abs(kAlong - along) < minGap && Math.abs(k.value - t.value) < 1e-9;
    });
    if (!clash) kept.push(t);
  }
  return kept;
}

// --- labels ------------------------------------------------------------------

export function normaliseLon(lon) {
  let v = ((((lon + 180) % 360) + 360) % 360) - 180;
  if (Math.abs(v + 180) < 1e-9) v = 180;
  return v;
}

function trimNumber(v, digits) {
  return v
    .toFixed(digits)
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '');
}

/**
 * Formats a graticule value. `style` is 'dms', 'decimal' or 'signed';
 * `hemisphere` adds the N/S/E/W letter instead of a sign.
 */
export function formatCoord(value, axis, style = 'dms', hemisphere = true) {
  const raw = axis === 'lon' ? normaliseLon(value) : value;
  const abs = Math.abs(raw);
  const letter = axis === 'lon' ? (raw > 0 ? 'E' : 'W') : raw > 0 ? 'N' : 'S';
  const suffix = hemisphere && abs > 1e-9 && Math.abs(abs - 180) > 1e-9 ? ' ' + letter : '';

  if (style === 'signed') return trimNumber(raw, 4) + '°';
  if (style === 'decimal') return trimNumber(abs, 4) + '°' + suffix;

  const totalSec = Math.round(abs * 3600);
  const deg = Math.floor(totalSec / 3600);
  const min = Math.floor((totalSec % 3600) / 60);
  const sec = totalSec % 60;
  let out = deg + '°';
  if (min || sec) out += String(min).padStart(2, '0') + '′';
  if (sec) out += String(sec).padStart(2, '0') + '″';
  return out + suffix;
}

// --- point visibility --------------------------------------------------------

/**
 * Screen position of a geographic point, or null when the point is behind the
 * horizon or outside the map rectangle.
 */
export function projectPoint(lonlat, projection, rect, centre, clipAngle) {
  if (clipAngle != null) {
    const d = globalThis.d3.geoDistance(lonlat, centre) / DEG;
    if (d > clipAngle) return null;
  }
  const p = projection(lonlat);
  if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
  if (p[0] < rect.x0 || p[0] > rect.x1 || p[1] < rect.y0 || p[1] > rect.y1) return null;
  return p;
}

// --- scale bar ---------------------------------------------------------------

const BAR_STEPS = [
  1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000,
];

/** Picks a round distance that fits in `maxMm` at the given scale. */
export function scaleBar(kmPerMm, maxMm) {
  if (!kmPerMm) return null;
  const maxKm = kmPerMm * maxMm;
  let best = null;
  for (const km of BAR_STEPS) if (km <= maxKm) best = km;
  if (best == null) {
    const km = Math.max(0.05, Math.round((maxKm * 100) / 2) / 100);
    return {km, mm: km / kmPerMm, label: `${trimNumber(km * 1000, 0)} m`};
  }
  return {km: best, mm: best / kmPerMm, label: `${best} km`};
}
