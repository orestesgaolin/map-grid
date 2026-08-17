// Ready-made states and named regions. Each preset is a patch merged into the
// current state, so anything it does not mention is kept.

export const REGIONS = [
  {id: 'world', label: 'Whole world', box: [-180, 180, -85, 85]},
  {id: 'europe', label: 'Europe', box: [-12, 42, 34, 72]},
  {id: 'mediterranean', label: 'Mediterranean', box: [-7, 38, 29, 47]},
  {id: 'britain', label: 'British Isles', box: [-11, 3, 49, 61]},
  {id: 'scandinavia', label: 'Scandinavia and the Baltic', box: [3, 33, 53, 72]},
  {id: 'alps', label: 'The Alps', box: [5, 16.5, 44, 48.5]},
  {id: 'northsea', label: 'North Sea', box: [-5, 12, 50, 62]},
  {id: 'africa', label: 'Africa', box: [-20, 55, -37, 39]},
  {id: 'asia', label: 'Asia', box: [25, 150, 0, 78]},
  {id: 'southasia', label: 'South Asia', box: [60, 100, 5, 38]},
  {id: 'eastasia', label: 'East Asia', box: [100, 148, 18, 54]},
  {id: 'japan', label: 'Japan', box: [128, 147, 30, 46]},
  {id: 'northamerica', label: 'North America', box: [-170, -50, 12, 75]},
  {id: 'usa', label: 'United States (conterminous)', box: [-126, -66, 24, 50]},
  {id: 'southamerica', label: 'South America', box: [-83, -33, -57, 14]},
  {id: 'australia', label: 'Australia and New Zealand', box: [110, 180, -50, -8]},
  {id: 'atlantic', label: 'North Atlantic', box: [-80, 10, 20, 70]},
  {id: 'pacific', label: 'Pacific', box: [120, 290, -50, 50]},
  {id: 'arctic', label: 'Arctic', box: [-180, 180, 60, 90]},
  {id: 'antarctic', label: 'Antarctic', box: [-180, 180, -90, -58]},
];

export function regionPatch(id) {
  const region = REGIONS.find((r) => r.id === id);
  if (!region) return null;
  const [west, east, south, north] = region.box;
  return {view: {mode: 'section', west, east, south, north, zoom: 1, panX: 0, panY: 0}};
}

export const PRESETS = [
  {
    id: 'world-natural',
    label: 'World — Natural Earth, chequered border',
    patch: {
      view: {mode: 'world', zoom: 1, panX: 0, panY: 0},
      projection: {id: 'naturalEarth1', lon0: 0, lat0: 0, roll: 0},
      grid: {auto: true, frameStyle: 'checker', labels: 'frame', minor: true},
      layers: {land: true, coast: true, ocean: true, rivers: true, lakes: true, cities: false, sphere: true, borders: false},
      detail: '110m',
      style: {theme: 'print'},
    },
  },
  {
    id: 'world-robinson',
    label: 'World — Robinson with cities',
    patch: {
      view: {mode: 'world', zoom: 1, panX: 0, panY: 0},
      projection: {id: 'robinson', lon0: 0, lat0: 0, roll: 0},
      grid: {auto: false, majorLon: 30, majorLat: 15, minorLon: 10, minorLat: 5, frameStyle: 'ticks'},
      layers: {cities: true, borders: true, rivers: false},
      cities: {minPop: 5000000, max: 40, labels: true},
      detail: '110m',
      style: {theme: 'atlas'},
    },
  },
  {
    id: 'grid-only',
    label: 'Blank graticule — line art, no land',
    patch: {
      view: {mode: 'world', zoom: 1, panX: 0, panY: 0},
      projection: {id: 'equirectangular', lon0: 0, lat0: 0, roll: 0},
      grid: {auto: false, majorLon: 15, majorLat: 15, minorLon: 5, minorLat: 5, frameStyle: 'checker', labels: 'frame'},
      layers: {
        land: false,
        coast: false,
        ocean: false,
        rivers: false,
        lakes: false,
        borders: false,
        cities: false,
        sphere: true,
      },
      style: {theme: 'mono'},
    },
  },
  {
    id: 'dots-europe',
    label: 'Connect the dots — Europe, numbered',
    patch: {
      view: {mode: 'section', west: -11, east: 32, south: 35, north: 60, zoom: 1, panX: 0, panY: 0},
      projection: {id: 'conicConformal'},
      grid: {auto: true, frameStyle: 'ticks', labels: 'frame', minor: false},
      layers: {
        land: false,
        coast: false,
        ocean: false,
        rivers: false,
        lakes: false,
        borders: false,
        cities: false,
        dots: true,
        sphere: false,
        scalebar: false,
      },
      dots: {spacing: 5, size: 0.9, numbers: true, minIsland: 6, labelSize: 1.7},
      detail: '50m',
      style: {theme: 'mono'},
    },
  },
  {
    id: 'globe-europe',
    label: 'Globe — Europe, orthographic',
    patch: {
      view: {mode: 'world', zoom: 1, panX: 0, panY: 0},
      projection: {id: 'orthographic', lon0: 12, lat0: 48, roll: 0},
      grid: {auto: false, majorLon: 15, majorLat: 15, minorLon: 5, minorLat: 5, labels: 'inline', frameStyle: 'plain'},
      layers: {land: true, coast: true, ocean: true, rivers: true, lakes: true, sphere: true, cities: true, frame: false},
      cities: {minPop: 3000000, max: 25, labels: true},
      detail: '50m',
      style: {theme: 'print'},
    },
  },
  {
    id: 'section-mercator',
    label: 'Section — Mercator, North Sea',
    patch: {
      view: {mode: 'section', west: -5, east: 12, south: 50, north: 62, zoom: 1, panX: 0, panY: 0},
      projection: {id: 'mercator'},
      grid: {auto: true, frameStyle: 'checker', labels: 'frame', format: 'dms'},
      layers: {land: true, coast: true, ocean: true, rivers: true, lakes: true, cities: true, scalebar: true, sphere: false},
      cities: {minPop: 200000, max: 60, labels: true},
      detail: '50m',
      style: {theme: 'print'},
    },
  },
  {
    id: 'section-conic',
    label: 'Section — Albers conic, United States',
    patch: {
      view: {mode: 'section', west: -126, east: -66, south: 24, north: 50, zoom: 1, panX: 0, panY: 0},
      projection: {id: 'conicEqualArea'},
      grid: {auto: true, frameStyle: 'ticks', labels: 'frame'},
      layers: {borders: true, rivers: true, lakes: true, cities: true, scalebar: true, sphere: false},
      cities: {minPop: 1000000, max: 40},
      detail: '50m',
      style: {theme: 'atlas'},
    },
  },
  {
    id: 'tilt-alps',
    label: '3D — the Alps from 400 km',
    patch: {
      view: {mode: 'tilt', heightKm: 400, tilt: 30, horizon: 0.95, zoom: 1, panX: 0, panY: 0},
      projection: {lon0: 10.5, lat0: 46.2, roll: 0},
      grid: {auto: true, labels: 'frame', frameStyle: 'ticks'},
      layers: {land: true, coast: true, rivers: true, lakes: true, cities: true, sphere: true, scalebar: false},
      cities: {minPop: 100000, max: 40, labels: true},
      detail: '10m',
      style: {theme: 'print'},
    },
  },
  {
    id: 'tilt-earth',
    label: '3D — Earth from 12 000 km',
    patch: {
      view: {mode: 'tilt', heightKm: 12000, tilt: 20, horizon: 0.9, zoom: 1, panX: 0, panY: 0},
      projection: {lon0: 20, lat0: 30, roll: 0},
      grid: {auto: false, majorLon: 15, majorLat: 15, minorLon: 5, minorLat: 5, labels: 'frame', frameStyle: 'plain'},
      layers: {land: true, coast: true, ocean: true, rivers: true, lakes: true, cities: false, sphere: true},
      detail: '110m',
      style: {theme: 'night'},
    },
  },
  {
    id: 'polar',
    label: 'Polar — Arctic, azimuthal equidistant',
    patch: {
      view: {mode: 'section', west: -180, east: 180, south: 60, north: 90, zoom: 1, panX: 0, panY: 0},
      projection: {id: 'azimuthalEquidistant'},
      grid: {auto: false, majorLon: 15, majorLat: 10, minorLon: 5, minorLat: 5, labels: 'frame', frameStyle: 'ticks'},
      layers: {land: true, coast: true, ocean: true, rivers: true, lakes: true, sphere: true, cities: false},
      detail: '50m',
      style: {theme: 'print'},
    },
  },
  {
    id: 'blueprint-pacific',
    label: 'Blueprint — Pacific, Winkel tripel',
    patch: {
      view: {mode: 'world', zoom: 1, panX: 0, panY: 0},
      projection: {id: 'winkel3', lon0: -160, lat0: 0, roll: 0},
      grid: {auto: false, majorLon: 30, majorLat: 15, minorLon: 10, minorLat: 5, labels: 'frame', frameStyle: 'plain'},
      layers: {land: true, coast: true, ocean: true, rivers: false, lakes: false, sphere: true, cities: false},
      detail: '110m',
      style: {theme: 'blueprint'},
    },
  },
];

export function presetPatch(id) {
  return PRESETS.find((p) => p.id === id)?.patch ?? null;
}
