// Application state: defaults, dotted-path access, URL hash persistence.

export const R_EARTH_KM = 6371.0088;

// Page sizes in millimetres, given as landscape (width, height).
export const PAGE_SIZES = {
  A5: [210, 148],
  A4: [297, 210],
  A3: [420, 297],
  A2: [594, 420],
  Letter: [279.4, 215.9],
  Tabloid: [431.8, 279.4],
  Square: [240, 240],
  Custom: null,
};

export function defaultState() {
  return {
    page: {size: 'A4', orientation: 'landscape', width: 297, height: 210, margin: 14},
    projection: {id: 'naturalEarth1', lon0: 0, lat0: 0, roll: 0, parallels: [30, 60], parallel: 30},
    view: {
      mode: 'world', // world | section | tilt
      west: -12,
      east: 32,
      south: 35,
      north: 62,
      heightKm: 2000,
      tilt: 25,
      horizon: 0.9,
      zoom: 1,
      panX: 0,
      panY: 0,
    },
    grid: {
      auto: true,
      majorLon: 15,
      majorLat: 15,
      minorLon: 5,
      minorLat: 5,
      minor: true,
      labels: 'frame', // frame | inline | both | none
      format: 'dms', // dms | decimal | signed
      hemisphere: true,
      frameStyle: 'checker', // plain | ticks | checker
      tightFrame: true,
      tick: 1.8,
      labelSize: 2.6,
      labelGap: 1.0,
      band: 1.6,
    },
    layers: {
      ocean: true,
      seaCutout: true,
      land: true,
      coast: true,
      borders: false,
      rivers: true,
      lakes: true,
      cities: true,
      dots: false,
      sphere: true,
      frame: true,
      scalebar: false,
    },
    cities: {minPop: 5000000, max: 40, labels: true, capitalsOnly: false, dot: 1.1},
    dots: {spacing: 6, size: 0.9, numbers: false, minIsland: 3, labelSize: 1.8},
    detail: '110m',
    style: {
      theme: 'print',
      font: 'sans',
      lineScale: 1,
      paper: '#ffffff',
      ocean: '#eef3f7',
      land: '#f6f3ec',
      coast: '#5a6472',
      border: '#a9b0ba',
      water: '#c3d8e8',
      waterLine: '#7fa4c0',
      river: '#7fa4c0',
      gridMajor: '#8b95a3',
      gridMinor: '#c8ced7',
      frame: '#2c333d',
      text: '#2c333d',
      city: '#c0392b',
      cityText: '#2c333d',
    },
    title: {show: false, text: '', subtitle: '', credit: true},
  };
}

export function get(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

export function set(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  let node = obj;
  for (const k of keys) {
    if (node[k] == null || typeof node[k] !== 'object') node[k] = {};
    node = node[k];
  }
  node[last] = value;
  return obj;
}

function isPlainObject(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

/** Recursive merge of a partial patch into a full state object. */
export function merge(base, patch) {
  if (!isPlainObject(patch)) return base;
  for (const [k, v] of Object.entries(patch)) {
    if (isPlainObject(v) && isPlainObject(base[k])) merge(base[k], v);
    else if (v !== undefined) base[k] = v;
  }
  return base;
}

/** Difference of `value` against `base`, keeping only what changed. */
function diff(value, base) {
  if (!isPlainObject(value) || !isPlainObject(base)) {
    return JSON.stringify(value) === JSON.stringify(base) ? undefined : value;
  }
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    const d = diff(v, base[k]);
    if (d !== undefined) out[k] = d;
  }
  return Object.keys(out).length ? out : undefined;
}

export function toHash(state) {
  const d = diff(state, defaultState());
  return d ? '#' + encodeURIComponent(JSON.stringify(d)) : '';
}

export function fromHash(hash) {
  const raw = (hash || '').replace(/^#/, '');
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(raw));
  } catch {
    console.warn('mapgrid: cannot read state from URL');
    return null;
  }
}

/** Page box in millimetres, honouring the orientation of a named size. */
export function pageBox(page) {
  const preset = PAGE_SIZES[page.size];
  if (!preset) return {width: page.width, height: page.height};
  const [long, short] = preset;
  return page.orientation === 'portrait' ? {width: short, height: long} : {width: long, height: short};
}
