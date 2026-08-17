// Lazy loading of the Natural Earth payload in data/.
// Nothing is fetched until a layer actually needs it.

const cache = new Map(); // url -> Promise

export const DETAILS = [
  {id: '110m', label: 'Low (110m) — whole world', note: '0.1 MB'},
  {id: '50m', label: 'Medium (50m) — continents', note: '1.2 MB'},
  {id: '10m', label: 'High (10m) — countries and regions', note: '8.3 MB'},
];

let onProgress = () => {};
export function setProgressHandler(fn) {
  onProgress = fn || (() => {});
}

function json(file) {
  const url = new URL(`../data/${file}`, import.meta.url).href;
  if (!cache.has(url)) {
    onProgress(`loading ${file}`);
    cache.set(
      url,
      fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error(`${r.status} ${r.statusText} for ${file}`);
          return r.json();
        })
        .then((data) => {
          onProgress(null);
          return data;
        })
        .catch((err) => {
          cache.delete(url);
          onProgress(null);
          throw err;
        })
    );
  }
  return cache.get(url);
}

const prepared = new Map(); // key -> resolved layer data

async function base(detail) {
  const key = `base:${detail}`;
  if (!prepared.has(key)) {
    const topo = await json(`base-${detail}.json`);
    const topojson = globalThis.topojson;
    prepared.set(key, {
      land: topojson.feature(topo, topo.objects.land),
      borders: topojson.mesh(topo, topo.objects.countries, (a, b) => a !== b),
    });
  }
  return prepared.get(key);
}

async function simple(detail, name) {
  const key = `${name}:${detail}`;
  if (!prepared.has(key)) {
    const topo = await json(`${name}-${detail}.json`);
    prepared.set(key, globalThis.topojson.feature(topo, topo.objects[name]));
  }
  return prepared.get(key);
}

async function cities() {
  const key = 'cities';
  if (!prepared.has(key)) {
    const raw = await json('cities.json');
    prepared.set(
      key,
      raw.rows.map(([name, country, lon, lat, pop, capital, rank]) => ({
        name,
        country,
        lonlat: [lon, lat],
        pop,
        capital: !!capital,
        rank,
      }))
    );
  }
  return prepared.get(key);
}

/**
 * Resolves everything the requested layers need at the requested detail.
 * Repeat calls are served from cache, so re-rendering costs no network.
 */
export async function load(detail, needs) {
  const out = {};
  const jobs = [];
  if (needs.base) jobs.push(base(detail).then((v) => Object.assign(out, v)));
  if (needs.rivers) jobs.push(simple(detail, 'rivers').then((v) => (out.rivers = v)));
  if (needs.lakes) jobs.push(simple(detail, 'lakes').then((v) => (out.lakes = v)));
  if (needs.cities) jobs.push(cities().then((v) => (out.cities = v)));
  await Promise.all(jobs);
  return out;
}
