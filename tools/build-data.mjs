// Builds the static data payload in data/ from public-domain Natural Earth sources.
//
//   npm run data
//
// Outputs (all TopoJSON unless noted):
//   data/base-{110m,50m,10m}.json    land silhouette + country borders (world-atlas)
//   data/rivers-{110m,50m,10m}.json  rivers and lake centre lines
//   data/lakes-{110m,50m,10m}.json   lakes
//   data/cities.json                 populated places, compact column format (plain JSON)
//   data/manifest.json               file list with byte sizes, for reference
import {mkdir, readFile, writeFile, stat} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {topology} from 'topojson-server';
import {feature, mergeArcs} from 'topojson-client';
import {presimplify, simplify} from 'topojson-simplify';
import {geoArea} from 'd3-geo';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = resolve(root, 'data');
const cacheDir = resolve(root, '.cache');
const NE = 'https://raw.githubusercontent.com/martynafford/natural-earth-geojson/master';

const RESOLUTIONS = ['110m', '50m', '10m'];

// Quantisation grid and simplification weight per resolution. The grid step is
// 360 deg / quantization, so 1e5 snaps to about 400 m and 1e6 to about 40 m.
// The weight is a planar triangle area in quantised units; 0 keeps every point.
// Simplification is off everywhere: at 10m it cut 256k points down to 7k, which
// is far too coarse for print.
const TUNING = {
  '110m': {quantization: 1e4, weight: 0},
  '50m': {quantization: 1e5, weight: 0},
  '10m': {quantization: 1e6, weight: 0},
};

async function cached(name, url) {
  const file = resolve(cacheDir, name);
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    process.stdout.write(`fetch ${url}\n`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
    const text = await res.text();
    await mkdir(cacheDir, {recursive: true});
    await writeFile(file, text);
    return JSON.parse(text);
  }
}

/** Keeps only the listed properties, dropping features without geometry. */
function trim(geojson, keep) {
  return {
    type: 'FeatureCollection',
    features: geojson.features
      .filter((f) => f.geometry)
      .map((f) => {
        const properties = {};
        for (const k of keep) {
          const v = f.properties[k];
          if (v !== null && v !== undefined && v !== '') properties[k] = v;
        }
        return {type: 'Feature', properties, geometry: f.geometry};
      }),
  };
}

function toTopology(objects, res) {
  const {quantization, weight} = TUNING[res];
  let topo = topology(objects, quantization);
  if (weight > 0) topo = simplify(presimplify(topo), weight);
  return topo;
}

const SPHERE = 4 * Math.PI;
const LAND_STERADIANS = 3.6; // about 29 percent of the sphere

/**
 * Reverses polygon rings whose spherical area covers more than half the globe.
 * The 10m land and country polygons published by world-atlas contain a few such
 * rings; d3-geo then fills the sea instead of the land, which shows up as soon
 * as the map is clipped to a circle (globe or tilted view).
 */
function rewind(features) {
  let fixed = 0;
  for (const f of features) {
    const geometry = f.geometry;
    if (!geometry) continue;
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
    for (const rings of polygons) {
      const area = geoArea({type: 'Polygon', coordinates: rings});
      if (area <= SPHERE / 2) continue;
      for (const ring of rings) ring.reverse();
      fixed++;
      if (geoArea({type: 'Polygon', coordinates: rings}) > SPHERE / 2) {
        throw new Error(`cannot rewind a ring of ${f.properties?.name || f.id || 'a feature'}`);
      }
    }
  }
  return fixed;
}

/** Land silhouette plus country borders, rebuilt with valid winding. */
function buildBase(source, res) {
  const {quantization} = TUNING[res];
  const countries = feature(source, source.objects.countries);
  const fixed = rewind(countries.features);
  const topo = topology({countries}, quantization);
  topo.objects.land = mergeArcs(topo, topo.objects.countries.geometries);

  for (const [name, area] of [
    ['land', geoArea(feature(topo, topo.objects.land))],
    ['countries', feature(topo, topo.objects.countries).features.reduce((a, f) => a + geoArea(f), 0)],
  ]) {
    if (Math.abs(area - LAND_STERADIANS) > 0.4) {
      throw new Error(`${res} ${name}: spherical area ${area.toFixed(2)} sr, expected about ${LAND_STERADIANS}`);
    }
  }
  return {topo, fixed};
}

async function writeJSON(name, value) {
  const file = resolve(dataDir, name);
  await writeFile(file, JSON.stringify(value));
  const {size} = await stat(file);
  console.log(`  ${name.padEnd(22)} ${(size / 1024).toFixed(0).padStart(6)} kB`);
  return size;
}

async function main() {
  await mkdir(dataDir, {recursive: true});
  const manifest = {generated: process.env.BUILD_DATE || null, files: {}};

  for (const res of RESOLUTIONS) {
    console.log(`\n${res}`);

    // Land silhouette and country borders, from world-atlas (Natural Earth).
    const source = JSON.parse(await readFile(resolve(root, `node_modules/world-atlas/countries-${res}.json`), 'utf8'));
    const {topo, fixed} = buildBase(source, res);
    manifest.files[`base-${res}.json`] = await writeJSON(`base-${res}.json`, topo);
    if (fixed) console.log(`    rewound ${fixed} ring${fixed > 1 ? 's' : ''}`);

    const rivers = await cached(
      `rivers-${res}.geojson`,
      `${NE}/${res}/physical/ne_${res}_rivers_lake_centerlines.json`
    );
    manifest.files[`rivers-${res}.json`] = await writeJSON(
      `rivers-${res}.json`,
      toTopology({rivers: trim(rivers, ['name', 'featurecla', 'scalerank'])}, res)
    );

    const lakes = await cached(`lakes-${res}.geojson`, `${NE}/${res}/physical/ne_${res}_lakes.json`);
    manifest.files[`lakes-${res}.json`] = await writeJSON(
      `lakes-${res}.json`,
      toTopology({lakes: trim(lakes, ['name', 'scalerank'])}, res)
    );
  }

  // Populated places: one file for every resolution, filtered in the browser.
  console.log('\ncities');
  const places = await cached('cities.geojson', `${NE}/10m/cultural/ne_10m_populated_places_simple.json`);
  const rows = places.features
    .map((f) => {
      const p = f.properties;
      const [lon, lat] = f.geometry.coordinates;
      return [
        p.name || p.nameascii || '',
        p.adm0name || '',
        Math.round(lon * 1e4) / 1e4,
        Math.round(lat * 1e4) / 1e4,
        p.pop_max || 0,
        p.adm0cap ? 1 : 0,
        p.scalerank ?? 10,
      ];
    })
    .filter((r) => r[0] && r[4] > 0)
    .sort((a, b) => b[4] - a[4]);
  manifest.files['cities.json'] = await writeJSON('cities.json', {
    columns: ['name', 'country', 'lon', 'lat', 'pop', 'capital', 'rank'],
    rows,
  });
  console.log(`  ${rows.length} places, largest ${rows[0][0]} (${rows[0][4].toLocaleString('en-US')})`);

  await writeJSON('manifest.json', manifest);
}

await main();
