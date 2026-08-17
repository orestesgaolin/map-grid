# mapgrid

A static site that generates printable grids of parallels and meridians for any part of the
world — in a choice of common projections, or in a tilted 3D view like an oblique satellite
photograph — and exports them as SVG or PNG.

No build step, no server code, no external requests at run time. Open `index.html` over HTTP
and it works; push the repository to GitHub Pages and it works there.

## What it does

**Graticule.** Meridians and parallels at a labelled step plus a finer subdivision step, chosen
automatically from the size of the section or set by hand from 90° down to 12″. Lines are traced
through the projection and clipped, so they curve correctly in every frame.

**Border marks.** Where a graticule line meets the neatline, the tool places a tick and a
coordinate label (`45°30′ N`, `45.5° N` or `+45.5°`), and it can draw the classic chequered
border band, alternating at the subdivision step. Lines that never reach the frame — a globe, a
Robinson oval, a tilted view — are labelled on the map instead: at the open end of the line, or
along a parallel or meridian inside the view. Labels that would overlap are dropped rather than
piled up.

**Frames.**

| Frame | What it fits |
| --- | --- |
| Whole world / hemisphere | the full sphere in the chosen projection |
| Section | a longitude/latitude box, fitted to the page |
| 3D tilted view | a satellite camera at a chosen height and tilt |

**Projections.** 26 of them, from d3-geo and d3-geo-projection: equirectangular, Mercator,
transverse Mercator, Miller, cylindrical equal area, Robinson, Winkel tripel, Natural Earth,
Equal Earth, Mollweide, Hammer, Aitoff, Eckert IV, sinusoidal, Van der Grinten, Lambert
conformal conic, Albers equal area conic, equidistant conic, Bonne, polyconic, orthographic,
stereographic, azimuthal equidistant, azimuthal equal area, gnomonic, and the tilted satellite
perspective.

**3D view.** Height above ground from 30 km to 60 000 km, tilt 0–60°, plus how much of the
horizon to use. A tilted perspective has a vanishing line beyond which the ground projects to
infinity; the field of view is limited automatically to stay in front of it, so a low, strongly
tilted view covers less ground. The panel reports how far the view reaches.

**Layers.** Land silhouette, coastline, sea fill, rivers and lake centre lines, lakes, country
borders, populated places (filtered by population, capitals marked with a square), globe
outline, neatline, scale bar, title block and a footer with the projection, scale and data
credit. Three levels of coastline detail: 110m, 50m and 10m.

**Connect the dots.** A layer that replaces the coastline with evenly spaced dots, optionally
numbered, one sequence per island — a connect-the-dots puzzle of any coast. The spacing slider is
the quality control: closer dots follow the coast more faithfully, wider dots make an easier
puzzle. Small islands can be dropped by setting how many dot spacings a coast must be worth to
qualify. Where the frame cuts a coastline, the clipped edge along the frame is split out rather
than dotted, so no row of dots marches down the neatline.

**Sea as a difference.** *Sea cut around land* (on by default) appends the coastline rings to the
sea path and fills it with the even-odd rule, so the sea is one real outline with the land as
holes rather than a rectangle hidden behind the land. It stays correct under a transparent land
fill, prints and plots as a single shape, and — with the land layer switched off — leaves the
land as bare paper. The land colour then comes from the sphere painted underneath, so the
coastline geometry is still stored only once.

**Page and style.** A5 to A2, Letter, Tabloid, square or a custom size in millimetres, either
orientation, adjustable margin. Five colour themes (print, line art, atlas, blueprint, night),
every colour editable, three type families, one line-weight control.

**Export.** SVG carries the page size in millimetres, so it prints at the size shown and stays
editable in Illustrator or Inkscape — presentation attributes only, no stylesheet, no external
references. PNG is rasterised at 96, 150, 300 or 600 dpi.

**Interaction.** Drag to rotate the globe or move the section, scroll to zoom (in the 3D view,
scrolling changes the height). In a section, eight handles on the box edges and corners resize it
like a crop tool: the map holds still while a dashed outline follows the pointer — a live refit
would move the ground under the cursor and the gesture would fight itself — and the new box is
applied on release. The handles are interface furniture marked `data-ui`, so export removes them
and printing hides them. The full state lives in the URL, so any map can be shared or bookmarked
with the *Copy link* button.

## Running it locally

Any static file server will do — the data is loaded with `fetch`, so `file://` will not work:

```sh
npm run serve      # python3 -m http.server 8080
open http://localhost:8080
```

## Publishing on GitHub Pages

The repository is the site. `data/` and `js/vendor/` are generated but **must be committed**,
because Pages does not run a build:

```sh
git init && git add -A && git commit -m "feat: mapgrid"
git remote add origin git@github.com:<user>/mapgrid.git
git push -u origin main
```

Then in the repository settings, under Pages, serve from the `main` branch, root folder. The site
appears at `https://<user>.github.io/mapgrid/`. All paths are relative, so a project subpath is
fine.

## Regenerating the data

Only needed when you want different sources or resolutions:

```sh
npm install        # tooling only, not needed to serve the site
npm run build      # vendor bundles + data payload
```

- `tools/build-vendor.mjs` copies `d3`, `d3-geo-projection` and `topojson-client` into
  `js/vendor/`.
- `tools/build-data.mjs` builds `data/`: land and country borders from
  [world-atlas](https://github.com/topojson/world-atlas), rivers, lakes and populated places
  from [Natural Earth](https://www.naturalearthdata.com/) via
  [natural-earth-geojson](https://github.com/martynafford/natural-earth-geojson). Downloads are
  cached in `.cache/`.

The build rewinds polygon rings whose spherical area covers more than half the globe and then
checks that land measures about 3.6 steradians. Without that, the three inverted rings in the
10m source make d3 fill the sea instead of the land as soon as the map is clipped to a circle.

## Layout

```
index.html            markup and the whole control panel
css/app.css           interface only; nothing inside the map SVG depends on it
js/state.js           defaults, dotted-path access, URL hash
js/projections.js     projection registry, aiming, fitting, clipping, tilt limits
js/geo.js             graticule construction, tracing, border ticks, label formats
js/render.js          builds the SVG
js/datasets.js        lazy data loading
js/style.js           themes, fonts, line widths
js/ui.js              control binding and conditional visibility
js/exporter.js        SVG and PNG download
js/presets.js         starting points and named regions
data/                 generated Natural Earth payload (10 MB, loaded on demand)
tools/                data and vendor build scripts
```

The renderer is a pure function of state plus data: `render(state, data) -> {svg, info}`. Nothing
is mutated in place, and the SVG that goes on screen is byte-for-byte what gets exported.

## Limits worth knowing

- Natural Earth 10m is drawn from roughly 1:10 000 000 source material. Sections finer than
  about 1:1 000 000 still work, but the coastline turns visibly angular.
- A strongly tilted 3D view at low altitude narrows the field of view; that is the perspective
  geometry, not a clipping bug.
- PNG export is bounded by the browser canvas (16 384 px per side, about 250 megapixels). Use
  SVG for anything larger.
- Fonts are named generically (Helvetica/Arial, Georgia/Times, system monospace) so exported
  files render anywhere; no font is embedded.

## Data licence

Natural Earth data is in the public domain. d3 and TopoJSON are ISC/BSD licensed; their notices
are inside the bundles in `js/vendor/`.
