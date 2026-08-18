# mapgrid

A static site that generates printable grids of parallels and meridians for any part of the
world — in a choice of common projections, or in a tilted 3D view like an oblique satellite
photograph — and exports them as SVG or PNG.

**[Open the app](https://orestesgaolin.github.io/map-grid/)** ·
[source](https://github.com/orestesgaolin/map-grid) ·
[MIT licence](LICENSE)

![](docs/main.png)

<!-- Table with images -->

<table>
<tr>
<td><img src="docs/world.png" width="300"></td>
<td><img src="docs/earth-3d.png" width="300"></td>
<td><img src="docs/usa.png" width="300"></td>
</tr>
<tr>
<td><img src="docs/3d-sphere.png" width="300"></td>
<td><img src="docs/blueprint.png" width="300"></td>
<td><img src="docs/conic.png" width="300"></td>
</tr>
<tr>
<td><img src="docs/connect-the-dots.png" width="300"></td>
<td><img src="docs/stereographic.png" width="300"></td>
<td><img src="docs/north-sea.png" width="300"></td>
</tr>
</table>

## What it does

- **Graticule** — labelled meridians and parallels plus a finer subdivision, spaced automatically
  or by hand from 90° down to 12″. Lines are traced through the projection, so they curve correctly
  in every frame.
- **Border marks** — ticks and coordinate labels (`45°30′ N`, `45.5° N`, `+45.5°`) where the
  graticule meets the neatline, with the classic chequered band on every edge the graticule
  reaches. Lines that never reach the frame are labelled on the map instead.
- **Three frames** — the whole world or a hemisphere, a longitude/latitude section fitted to the
  page, or a tilted 3D view from 30 km to 60 000 km up.
- **26 projections** — Mercator, transverse Mercator, Robinson, Winkel tripel, Natural Earth,
  Mollweide, Lambert conformal conic, Albers, orthographic, azimuthal equidistant, gnomonic, the
  tilted satellite perspective and more, from d3-geo and d3-geo-projection.
- **Layers** — land, coastline, sea, rivers, lakes, country borders, cities by population, globe
  outline, neatline, scale bar, title block and footer. Coastline detail at 110m, 50m or 10m,
  loaded on demand.
- **Connect the dots** — the coast, and the borders too, as evenly spaced dots: numbered, or with a
  different marker per piece. A puzzle sheet of any coastline.
- **Sea as a real difference** — the sea is one even-odd outline with the land as holes, so it holds
  up under a transparent fill, a plotter or a cutter.
- **Print-ready** — A5 to A2, Letter, Tabloid, square or a custom size in millimetres; five colour
  themes with every colour editable. SVG carries real millimetres and stays editable in Illustrator
  or Inkscape; PNG rasterises up to 600 dpi.
- **Five languages** — English, Polish, German, French, Spanish, including the map's own footer and
  hemisphere letters, which are not the same everywhere (East and West print as O in German, French
  and Spanish).
- **Direct manipulation** — drag to rotate or pan, scroll to zoom, eight crop handles to resize a
  section. Zooming into a world map hands the view over to a section, so it can then be moved in
  any direction. The whole state lives in the URL.

## Running it locally

Any static file server will do — the data is loaded with `fetch`, so `file://` will not work:

```sh
npm run serve      # python3 -m http.server 8080
open http://localhost:8080
```

## How it is built

No build step: `index.html` loads plain ES modules from `js/` plus the vendored d3 and TopoJSON
bundles in `js/vendor/`, so the repository *is* the site. `js/render.js` is a pure function of state
and data — `render(state, data) -> {svg, info}` — and the SVG on screen is byte-for-byte what gets
exported. `config.js` holds the repository link, the footer site label and the analytics switch.

## Regenerating the data

Only needed when you want different sources or resolutions:

```sh
npm install        # tooling only, not needed to serve the site
npm run build      # vendor bundles + data payload
```

`tools/build-data.mjs` builds `data/` from [world-atlas](https://github.com/topojson/world-atlas)
and [Natural Earth](https://www.naturalearthdata.com/) via
[natural-earth-geojson](https://github.com/martynafford/natural-earth-geojson), caching downloads in
`.cache/`. It rewinds polygon rings whose spherical area covers more than half the globe and then
checks that land measures about 3.6 steradians — without that, the three inverted rings in the 10m
source make d3 fill the sea instead of the land as soon as the map is clipped to a circle.

## Analytics

Off by default: a plain checkout makes no third-party request. GitHub Pages reports nothing about
visitors — its Insights → Traffic panel counts views of the *repository page* and clones, not hits
on the published site — so measuring visits needs a script.

Name a cookieless provider in `config.js` and it is loaded; leave `provider: 'none'` and
`js/analytics.js` does nothing.

```js
// config.js — goatcounter (free for personal use), plausible or umami
analytics: {provider: 'goatcounter', site: 'yourcode', host: '', respectPrivacySignals: true, allowLocalhost: false},
```

Beyond the automatic page view it sends `export/svg`, `export/png` and `preset`, with the
projection, frame type and resolution as properties — never map content, coordinates or an
identifier. Nothing is sent for visitors signalling Do Not Track or Global Privacy Control, or on
localhost. Google Analytics is deliberately not wired in: GA4 writes `_ga` cookies by default, and
its cookieless mode gives up most of what it is for.

## Limits worth knowing

- Natural Earth 10m comes from roughly 1:10 000 000 source material. Sections finer than about
  1:1 000 000 still work, but the coastline turns visibly angular.
- A strongly tilted 3D view at low altitude narrows the field of view. That is the perspective
  geometry — the ground beyond the vanishing line cannot be drawn — not a clipping bug.
- PNG export is bounded by the browser canvas (16 384 px per side, about 250 megapixels). Use SVG
  for anything larger.
- Fonts are named generically, so exported files render anywhere; none is embedded.

## Licence

[MIT](LICENSE) © Dominik Roszkowski.

Natural Earth data is in the public domain. d3 and TopoJSON are ISC/BSD licensed; their notices are
inside the bundles in `js/vendor/`.
