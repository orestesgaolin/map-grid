// Projection registry and the code that aims, fits and clips a projection to
// the map rectangle. All page coordinates are millimetres.

import {R_EARTH_KM} from './state.js';

const DEG = 180 / Math.PI;

// aim: how the centre controls are applied.
//   cylindrical - rotate in longitude only, distortion grows away from centre
//   conic       - rotate in longitude, centre in latitude, standard parallels
//   azimuthal   - rotate in longitude and latitude, optional roll
//   perspective - satellite view, uses height and tilt
const DEFS = [
  // Cylindrical
  {id: 'equirectangular', label: 'Equirectangular (Plate Carrée)', group: 'Cylindrical', fn: 'geoEquirectangular', aim: 'cylindrical'},
  {id: 'mercator', label: 'Mercator', group: 'Cylindrical', fn: 'geoMercator', aim: 'cylindrical', latLimit: 85.0511287798066},
  {id: 'transverseMercator', label: 'Transverse Mercator', group: 'Cylindrical', fn: 'geoTransverseMercator', aim: 'cylindrical', latLimit: 89.9, transverse: true},
  {id: 'miller', label: 'Miller cylindrical', group: 'Cylindrical', fn: 'geoMiller', aim: 'cylindrical'},
  {id: 'cylindricalEqualArea', label: 'Cylindrical equal area (Gall–Peters)', group: 'Cylindrical', fn: 'geoCylindricalEqualArea', aim: 'cylindrical', parallel: true},

  // Pseudocylindrical and other whole-world frames
  {id: 'robinson', label: 'Robinson', group: 'Whole world', fn: 'geoRobinson', aim: 'cylindrical'},
  {id: 'winkel3', label: 'Winkel tripel', group: 'Whole world', fn: 'geoWinkel3', aim: 'cylindrical'},
  {id: 'naturalEarth1', label: 'Natural Earth', group: 'Whole world', fn: 'geoNaturalEarth1', aim: 'cylindrical'},
  {id: 'equalEarth', label: 'Equal Earth', group: 'Whole world', fn: 'geoEqualEarth', aim: 'cylindrical'},
  {id: 'mollweide', label: 'Mollweide', group: 'Whole world', fn: 'geoMollweide', aim: 'cylindrical'},
  {id: 'hammer', label: 'Hammer', group: 'Whole world', fn: 'geoHammer', aim: 'azimuthal'},
  {id: 'aitoff', label: 'Aitoff', group: 'Whole world', fn: 'geoAitoff', aim: 'azimuthal'},
  {id: 'eckert4', label: 'Eckert IV', group: 'Whole world', fn: 'geoEckert4', aim: 'cylindrical'},
  {id: 'sinusoidal', label: 'Sinusoidal', group: 'Whole world', fn: 'geoSinusoidal', aim: 'cylindrical'},
  {id: 'vanDerGrinten', label: 'Van der Grinten', group: 'Whole world', fn: 'geoVanDerGrinten', aim: 'azimuthal'},

  // Conic
  {id: 'conicConformal', label: 'Lambert conformal conic', group: 'Conic', fn: 'geoConicConformal', aim: 'conic', parallels: true, latLimit: 88},
  {id: 'conicEqualArea', label: 'Albers equal area conic', group: 'Conic', fn: 'geoConicEqualArea', aim: 'conic', parallels: true},
  {id: 'conicEquidistant', label: 'Equidistant conic', group: 'Conic', fn: 'geoConicEquidistant', aim: 'conic', parallels: true},
  {id: 'bonne', label: 'Bonne', group: 'Conic', fn: 'geoBonne', aim: 'conic', parallel: true},
  {id: 'polyconic', label: 'Polyconic', group: 'Conic', fn: 'geoPolyconic', aim: 'conic'},

  // Azimuthal
  {id: 'orthographic', label: 'Orthographic (globe)', group: 'Azimuthal', fn: 'geoOrthographic', aim: 'azimuthal', clipAngle: 90},
  {id: 'stereographic', label: 'Stereographic', group: 'Azimuthal', fn: 'geoStereographic', aim: 'azimuthal', clipAngle: 135},
  {id: 'azimuthalEquidistant', label: 'Azimuthal equidistant', group: 'Azimuthal', fn: 'geoAzimuthalEquidistant', aim: 'azimuthal', clipAngle: 179},
  {id: 'azimuthalEqualArea', label: 'Azimuthal equal area (Lambert)', group: 'Azimuthal', fn: 'geoAzimuthalEqualArea', aim: 'azimuthal', clipAngle: 179},
  {id: 'gnomonic', label: 'Gnomonic', group: 'Azimuthal', fn: 'geoGnomonic', aim: 'azimuthal', clipAngle: 70},

  // Perspective
  {id: 'satellite', label: 'Satellite / tilted perspective (3D)', group: 'Perspective', fn: 'geoSatellite', aim: 'perspective', tiltOnly: true},
];

export const HEIGHT_LIMITS = {min: 30, max: 60000}; // km above the surface

let cachedList = null;

/** Projections whose d3 constructor is really present in the loaded bundles. */
export function projections() {
  if (!cachedList) cachedList = DEFS.filter((d) => typeof globalThis.d3?.[d.fn] === 'function');
  return cachedList;
}

export function projectionDef(id) {
  const list = projections();
  return list.find((d) => d.id === id) || list.find((d) => d.id === 'naturalEarth1') || list[0];
}

/** Latitude the graticule and fit box must stay inside for this projection. */
export function latLimit(def) {
  return def.latLimit ?? 90;
}

/** Section box, normalised so that east is always greater than west. */
export function sectionBox(view) {
  let {west, east, south, north} = view;
  if (!(east > west)) east += 360;
  if (east - west > 360) east = west + 360;
  if (south > north) [south, north] = [north, south];
  return {west, east, south: Math.max(south, -90), north: Math.min(north, 90)};
}

export function boxCentre(box) {
  return [(box.west + box.east) / 2, (box.south + box.north) / 2];
}

/**
 * Point cloud covering a geographic box. Used as the fitExtent target: points
 * survive the sphere clip individually, so no polygon winding rules apply and
 * hidden parts of the box simply drop out.
 */
function boxPoints(box, limit = 90) {
  const south = Math.max(box.south, -limit);
  const north = Math.min(box.north, limit);
  const n = 24;
  const coordinates = [];
  for (let i = 0; i <= n; i++) {
    const lon = box.west + ((box.east - box.west) * i) / n;
    for (let j = 0; j <= n; j++) coordinates.push([lon, south + ((north - south) * j) / n]);
  }
  return {type: 'MultiPoint', coordinates};
}

/** Horizon half-angle in degrees seen from `heightKm` above the surface. */
export function horizonAngle(heightKm) {
  const d = 1 + heightKm / R_EARTH_KM;
  return Math.acos(1 / d) * DEG;
}

/**
 * Largest angular radius a tilted perspective can show.
 *
 * A tilted camera has a vanishing line: ground beyond it projects to infinity
 * and then wraps to the wrong side. The satellite projection turns that into
 * coordinates near infinity, which destroys the fit and produces empty output.
 * The limit below keeps the far edge of the view at a bounded stretch, so the
 * view stays finite. `stretch` is the smallest fraction of the untilted
 * perspective denominator that is still accepted; 0.35 allows about three times
 * the vertical stretch at the far edge.
 *
 * Condition, with P the distance in earth radii and W the tilt:
 *   sin(t)·tan(W)/(1 - stretch) + cos(t) <= P
 * which is R·cos(t - W') <= P for W' = atan(tan(W)/(1 - stretch)),
 * R = 1/cos(W'). Hence t <= W' - acos(P·cos(W')).
 */
export function tiltLimitAngle(distance, tiltDeg, stretch = 0.35) {
  if (!tiltDeg) return Infinity;
  const wPrime = Math.atan(Math.tan(tiltDeg / DEG) / (1 - stretch));
  const c = distance * Math.cos(wPrime);
  if (c >= 1) return Infinity; // the vanishing line is below the horizon
  return (wPrime - Math.acos(c)) * DEG;
}

/**
 * Geographic box that contains a circular field of view. Uses the tangent
 * longitude of a small circle, so it is tight rather than merely safe.
 */
export function visibleBox([lon0, lat0], clipAngle, limit = 90) {
  const r = Math.min(Math.max(clipAngle, 0), 180);
  const south = Math.max(lat0 - r, -limit);
  const north = Math.min(lat0 + r, limit);
  const s = Math.sin(r / DEG) / Math.cos(lat0 / DEG);
  const dLon = !Number.isFinite(s) || Math.abs(s) >= 1 ? 180 : Math.asin(s) * DEG;
  return {west: lon0 - dLon, east: lon0 + dLon, south, north};
}

/** Ground radius in km covered by the visible cap at a given height. */
export function horizonRadiusKm(heightKm) {
  return (horizonAngle(heightKm) / DEG) * R_EARTH_KM;
}

/**
 * Builds the projection for the current state, fitted and clipped to `rect`.
 * Returns the projection plus the resolved centre and clip angle.
 */
export function buildProjection(state, rect) {
  const d3 = globalThis.d3;
  const mode = state.view.mode;
  const def = mode === 'tilt' ? projectionDef('satellite') : projectionDef(state.projection.id);
  const p = d3[def.fn]();
  const box = sectionBox(state.view);
  const limit = latLimit(def);

  const [lon0, lat0] =
    mode === 'section' ? boxCentre(box) : [state.projection.lon0, state.projection.lat0];
  const roll = state.projection.roll || 0;

  // Standard parallels: taken from the box in section mode (one sixth rule).
  let parallels = state.projection.parallels;
  if (def.parallels && mode === 'section') {
    const span = box.north - box.south;
    parallels = [box.south + span / 6, box.north - span / 6];
  }
  if (def.parallels) {
    let [a, b] = parallels;
    if (Math.abs(a + b) < 1e-3) b = a + 1e-3; // conformal conic degenerates here
    p.parallels([a, b]);
  }
  if (def.parallel) p.parallel(mode === 'section' ? (box.south + box.north) / 2 : state.projection.parallel);

  let clipAngle = def.clipAngle ?? null;

  switch (def.aim) {
    case 'azimuthal':
      p.rotate([-lon0, -lat0, roll]);
      break;
    case 'conic':
      p.rotate([-lon0, 0, 0]);
      if (typeof p.center === 'function') p.center([0, Math.max(-89, Math.min(89, lat0))]);
      break;
    case 'perspective': {
      const h = Math.min(Math.max(state.view.heightKm, HEIGHT_LIMITS.min), HEIGHT_LIMITS.max);
      const distance = 1 + h / R_EARTH_KM;
      p.rotate([-lon0, -lat0, roll]);
      p.distance(distance);
      p.tilt(state.view.tilt);
      const wanted = horizonAngle(h) * Math.min(Math.max(state.view.horizon, 0.05), 1);
      clipAngle = Math.min(wanted, tiltLimitAngle(distance, state.view.tilt)) - 1e-6;
      break;
    }
    default:
      p.rotate([-lon0, 0, 0]);
      break;
  }
  if (clipAngle != null && typeof p.clipAngle === 'function') p.clipAngle(clipAngle);

  // Fit. Section mode fits the requested box; the other modes fit the whole
  // visible sphere, limited in latitude where the projection runs to infinity.
  const target =
    mode === 'section'
      ? boxPoints(box, limit)
      : limit >= 90
        ? {type: 'Sphere'}
        : boxPoints({west: -180, east: 180, south: -limit, north: limit}, limit);

  p.fitExtent(
    [
      [rect.x0, rect.y0],
      [rect.x1, rect.y1],
    ],
    target
  );

  if (!Number.isFinite(p.scale()) || p.scale() <= 0) {
    p.scale(150).translate([(rect.x0 + rect.x1) / 2, (rect.y0 + rect.y1) / 2]);
  }

  // Zoom about the centre of the map rectangle, then pan.
  const zoom = Math.min(Math.max(state.view.zoom || 1, 0.05), 200);
  const cx = (rect.x0 + rect.x1) / 2;
  const cy = (rect.y0 + rect.y1) / 2;
  const [tx, ty] = p.translate();
  p.scale(p.scale() * zoom).translate([
    cx + (tx - cx) * zoom + (state.view.panX || 0),
    cy + (ty - cy) * zoom + (state.view.panY || 0),
  ]);

  p.clipExtent([
    [rect.x0, rect.y0],
    [rect.x1, rect.y1],
  ]);

  return {projection: p, def, centre: [lon0, lat0], clipAngle, box, limit, target};
}

/**
 * Map scale denominator (1:N) at the centre of the map, measured by inverting
 * two points one millimetre apart.
 */
export function mapScale(projection, rect) {
  if (typeof projection.invert !== 'function') return null;
  const cx = (rect.x0 + rect.x1) / 2;
  const cy = (rect.y0 + rect.y1) / 2;
  const a = projection.invert([cx - 0.5, cy]);
  const b = projection.invert([cx + 0.5, cy]);
  if (!a || !b) return null;
  const km = globalThis.d3.geoDistance(a, b) * R_EARTH_KM;
  if (!Number.isFinite(km) || km <= 0) return null;
  return {kmPerMm: km, denominator: km * 1e6};
}
