// Copies the browser bundles of the runtime dependencies into js/vendor/.
// The site itself has no build step; it loads these files directly.
import {copyFile, mkdir} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'js/vendor');

const bundles = [
  ['node_modules/d3/dist/d3.min.js', 'd3.min.js'],
  ['node_modules/d3-geo-projection/dist/d3-geo-projection.min.js', 'd3-geo-projection.min.js'],
  ['node_modules/topojson-client/dist/topojson-client.min.js', 'topojson-client.min.js'],
];

await mkdir(out, {recursive: true});
for (const [from, to] of bundles) {
  await copyFile(resolve(root, from), resolve(out, to));
  console.log('vendor', to);
}
