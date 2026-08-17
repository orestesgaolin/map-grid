// Builds the whole map as a fresh SVG element, in millimetre user units.
// Every visual property is written as a presentation attribute so that the
// exported file stands on its own, with no stylesheet.

import {pageBox} from './state.js';
import {buildProjection, mapScale, horizonRadiusKm, sectionBox} from './projections.js';
import {
  graticuleSpec,
  graticuleLines,
  makeTracer,
  subpathsToPath,
  lineTicks,
  dedupeTicks,
  formatCoord,
  projectPoint,
  scaleBar,
  roundPath,
  dotsAlong,
} from './geo.js';
import {tokens, widths, fontFamily} from './style.js';

const SVGNS = 'http://www.w3.org/2000/svg';

function el(name, attrs = {}, children = []) {
  const node = document.createElementNS(SVGNS, name);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    node.setAttribute(k, String(v));
  }
  for (const c of [].concat(children)) if (c) node.appendChild(c);
  return node;
}

function text(str, attrs) {
  const node = el('text', attrs);
  node.textContent = str;
  return node;
}

function num(v, digits = 2) {
  return Number(v.toFixed(digits));
}

/**
 * Renders the map.
 * @param {object} state  full application state
 * @param {object} data   layers from datasets.load()
 * @returns {{svg: SVGSVGElement, info: object}}
 */
export function render(state, data = {}) {
  const d3 = globalThis.d3;
  const page = pageBox(state.page);
  const W = page.width;
  const H = page.height;
  const C = tokens(state.style);
  const w = widths(state.style);
  const family = fontFamily(state.style);

  const titleSpace = state.title.show ? state.grid.labelSize * 2 + 5 : 0;
  const creditSpace = state.title.credit ? 4 : 0;
  const margin = Math.max(2, Math.min(state.page.margin, Math.min(W, H) / 2 - 10));
  const rect = {
    x0: margin,
    y0: margin + titleSpace,
    x1: W - margin,
    y1: H - margin - creditSpace,
  };

  // Kept for the title block and the footer, which follow the page margin even
  // when the neatline is pulled in around the map.
  const pageRect = {...rect};

  const {projection, def, centre, clipAngle, target} = buildProjection(state, rect);
  const path = d3.geoPath(projection);

  // A whole-world frame rarely has the same shape as the page. Pull the neatline
  // in to the drawn map so that the graticule really meets it — that is what
  // makes border ticks, labels and the chequered band work.
  if (state.grid.tightFrame) {
    const b = path.bounds(target);
    const tight = {
      x0: Math.max(rect.x0, b[0][0]),
      y0: Math.max(rect.y0, b[0][1]),
      x1: Math.min(rect.x1, b[1][0]),
      y1: Math.min(rect.y1, b[1][1]),
    };
    if (
      Number.isFinite(tight.x0 + tight.y0 + tight.x1 + tight.y1) &&
      tight.x1 - tight.x0 > 10 &&
      tight.y1 - tight.y0 > 10
    ) {
      Object.assign(rect, tight);
      projection.clipExtent([
        [rect.x0, rect.y0],
        [rect.x1, rect.y1],
      ]);
    }
  }

  const trace = makeTracer(projection);
  const spec = graticuleSpec(state, def, {centre, clipAngle, projection, rect});
  const lines = graticuleLines(spec);

  const svg = el('svg', {
    xmlns: SVGNS,
    'xmlns:xlink': 'http://www.w3.org/1999/xlink',
    version: '1.1',
    width: `${num(W, 3)}mm`,
    height: `${num(H, 3)}mm`,
    viewBox: `0 0 ${num(W, 3)} ${num(H, 3)}`,
    'shape-rendering': 'geometricPrecision',
  });

  const clipId = 'map-clip';
  svg.appendChild(
    el('defs', {}, [
      el('clipPath', {id: clipId}, [
        el('rect', {x: num(rect.x0), y: num(rect.y0), width: num(rect.x1 - rect.x0), height: num(rect.y1 - rect.y0)}),
      ]),
    ])
  );

  svg.appendChild(el('rect', {id: 'paper', x: 0, y: 0, width: num(W, 3), height: num(H, 3), fill: C.paper}));

  const map = el('g', {id: 'map', 'clip-path': `url(#${clipId})`});
  svg.appendChild(map);

  const addPath = (parent, id, geometry, attrs) => {
    if (!geometry) return null;
    const d = roundPath(path(geometry));
    if (!d) return null;
    const node = el('path', {id, d, ...attrs});
    parent.appendChild(node);
    return node;
  };

  // Sea and land.
  //
  // With seaCutout the coastline rings are appended to the sea path and the
  // even-odd rule subtracts them, so the sea is a real difference shape: one
  // editable outline with the land as holes, correct under a transparent land
  // fill and in a plotter or cutter. The land colour then comes from the sphere
  // painted underneath, which keeps the coastline geometry in the file exactly
  // once — no more than the plain fill needs.
  //
  // Without it, the sea is a solid sphere and the land is painted over it.
  const cutSea = state.layers.ocean && state.layers.seaCutout && !!data.land;
  const sphere = state.layers.ocean || cutSea ? roundPath(path({type: 'Sphere'})) : '';

  if (cutSea) {
    // No land in view — an open ocean section — leaves nothing to subtract.
    const holes = roundPath(path(data.land)) || '';
    if (state.layers.land && holes) {
      map.appendChild(el('path', {id: 'land-base', d: sphere, fill: C.land, stroke: 'none'}));
    }
    map.appendChild(
      el('path', {
        id: 'ocean',
        d: sphere + holes,
        fill: C.ocean,
        'fill-rule': holes ? 'evenodd' : null,
        stroke: 'none',
      })
    );
  } else {
    if (state.layers.ocean && sphere) {
      map.appendChild(el('path', {id: 'ocean', d: sphere, fill: C.ocean, stroke: 'none'}));
    }
    if (state.layers.land && data.land) {
      addPath(map, 'land', data.land, {fill: C.land, stroke: 'none'});
    }
  }
  if (state.layers.lakes && data.lakes) {
    addPath(map, 'lakes', data.lakes, {
      fill: C.water,
      stroke: C.waterLine,
      'stroke-width': num(w.waterLine, 3),
      'stroke-linejoin': 'round',
    });
  }
  if (state.layers.rivers && data.rivers) {
    addPath(map, 'rivers', data.rivers, {
      fill: 'none',
      stroke: C.river,
      'stroke-width': num(w.river, 3),
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    });
  }
  if (state.layers.borders && data.borders) {
    addPath(map, 'borders', data.borders, {
      fill: 'none',
      stroke: C.border,
      'stroke-width': num(w.border, 3),
      'stroke-dasharray': `${num(w.border * 6, 3)} ${num(w.border * 4, 3)}`,
      'stroke-linejoin': 'round',
    });
  }
  if (state.layers.coast && data.land) {
    addPath(map, 'coast', data.land, {
      fill: 'none',
      stroke: C.coast,
      'stroke-width': num(w.coast, 3),
      'stroke-linejoin': 'round',
    });
  }

  // --- graticule -------------------------------------------------------------

  const traced = {major: [], minor: []};
  const ticks = {major: [], minor: []};

  for (const kind of ['minor', 'major']) {
    if (kind === 'minor' && !state.grid.minor) continue;
    const group = el('g', {
      id: `graticule-${kind}`,
      fill: 'none',
      stroke: kind === 'major' ? C.gridMajor : C.gridMinor,
      'stroke-width': num(kind === 'major' ? w.gridMajor : w.gridMinor, 3),
      'stroke-linejoin': 'round',
    });
    for (const line of lines[kind]) {
      const subs = trace({type: 'LineString', coordinates: line.coordinates});
      if (!subs.length) continue;
      traced[kind].push({line, subs});
      for (const t of lineTicks(subs, rect, line)) ticks[kind].push(t);
      const d = subpathsToPath(subs);
      if (d) group.appendChild(el('path', {d, 'data-axis': line.axis, 'data-value': num(line.value, 6)}));
    }
    map.appendChild(group);
  }
  ticks.major = dedupeTicks(ticks.major);
  ticks.minor = dedupeTicks(ticks.minor);

  if (state.layers.sphere) {
    addPath(map, 'sphere', {type: 'Sphere'}, {
      fill: 'none',
      stroke: C.frame,
      'stroke-width': num(w.sphere, 3),
    });
  }

  // --- connect the dots ------------------------------------------------------

  let dotCount = null;
  if (state.layers.dots && data.land) {
    const spacing = Math.max(0.5, state.dots.spacing);
    const dots = dotsAlong(trace(data.land), spacing, {
      minLength: spacing * state.dots.minIsland,
      border: rect,
    });
    dotCount = dots.total;
    const group = el('g', {id: 'dots', fill: C.coast, stroke: 'none'});
    const numbers = state.dots.numbers
      ? el('g', {
          id: 'dot-numbers',
          'font-family': family,
          'font-size': num(state.dots.labelSize, 3),
          fill: C.text,
          'text-anchor': 'middle',
        })
      : null;
    const r = Math.max(0.1, state.dots.size / 2);
    for (const ring of dots.rings) {
      for (const dot of ring) {
        group.appendChild(el('circle', {cx: num(dot.x), cy: num(dot.y), r: num(r, 3)}));
        if (numbers) {
          numbers.appendChild(
            text(String(dot.n), {
              x: num(dot.x),
              y: num(dot.y - r - state.dots.labelSize * 0.3),
            })
          );
        }
      }
    }
    map.appendChild(group);
    if (numbers) map.appendChild(numbers);
  }

  // --- cities ----------------------------------------------------------------
  // Drawn after the graticule labels are placed, so the grid keeps its labels
  // and city names give way. Painting order is unaffected: this group goes into
  // the map group, which sits below the frame and the labels.

  const boxes = [];
  const place = (x, y, str, size, anchor) => {
    const width = str.length * size * 0.58;
    const box = {
      x0: anchor === 'end' ? x - width : anchor === 'middle' ? x - width / 2 : x,
      y0: y - size * 0.82,
      x1: 0,
      y1: y + size * 0.28,
    };
    box.x1 = box.x0 + width;
    if (boxes.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)) return false;
    boxes.push(box);
    return true;
  };

  // The scale bar is drawn last but claims its corner now, so that no label is
  // placed underneath it.
  const scale = mapScale(projection, rect);
  const bar = state.layers.scalebar && scale ? scaleBar(scale.kmPerMm, (rect.x1 - rect.x0) * 0.28) : null;
  if (bar) {
    const size = state.grid.labelSize * 0.9;
    boxes.push({
      x0: rect.x1 - 4 - bar.mm,
      y0: rect.y1 - 4 - size - 2,
      x1: rect.x1,
      y1: rect.y1,
    });
  }

  const renderCities = () => {
    if (!state.layers.cities || !data.cities) return;
    const group = el('g', {id: 'cities'});
    const labels = el('g', {
      id: 'city-labels',
      'font-family': family,
      'font-size': num(state.grid.labelSize * 0.95, 3),
      fill: C.cityText,
      stroke: C.paper,
      'stroke-width': num(state.grid.labelSize * 0.22, 3),
      'stroke-linejoin': 'round',
      'paint-order': 'stroke',
    });
    const fontSize = state.grid.labelSize * 0.95;
    let count = 0;
    for (const city of data.cities) {
      if (count >= state.cities.max) break;
      if (city.pop < state.cities.minPop) continue;
      if (state.cities.capitalsOnly && !city.capital) continue;
      const p = projectPoint(city.lonlat, projection, rect, centre, clipAngle);
      if (!p) continue;
      count++;
      const r = (state.cities.dot / 2) * (city.pop >= 1e7 ? 1.45 : city.pop >= 2e6 ? 1.15 : 0.9);
      // Capitals get a square, other places a circle — the usual atlas signs.
      group.appendChild(
        city.capital
          ? el('rect', {
              x: num(p[0] - r),
              y: num(p[1] - r),
              width: num(r * 2, 3),
              height: num(r * 2, 3),
              fill: C.city,
              stroke: C.paper,
              'stroke-width': num(w.coast * 0.6, 3),
            })
          : el('circle', {
              cx: num(p[0]),
              cy: num(p[1]),
              r: num(r, 3),
              fill: C.city,
              stroke: C.paper,
              'stroke-width': num(w.coast * 0.6, 3),
            })
      );
      if (!state.cities.labels) continue;
      const x = p[0] + r + 0.6;
      const y = p[1] + fontSize * 0.35;
      if (x + city.name.length * fontSize * 0.58 > rect.x1 - 0.5) continue;
      if (!place(x, y, city.name, fontSize, 'start')) continue;
      labels.appendChild(text(city.name, {x: num(x), y: num(y), 'text-anchor': 'start'}));
    }
    map.appendChild(group);
    map.appendChild(labels);
  };

  // --- graticule labels inside the map --------------------------------------

  if (state.grid.labels === 'inline' || state.grid.labels === 'both') {
    const group = el('g', {
      id: 'graticule-labels-inline',
      'font-family': family,
      'font-size': num(state.grid.labelSize, 3),
      fill: C.text,
      stroke: C.paper,
      'stroke-width': num(state.grid.labelSize * 0.25, 3),
      'stroke-linejoin': 'round',
      'paint-order': 'stroke',
      'text-anchor': 'middle',
    });
    for (const {line, subs} of traced.major) {
      const best = subs.reduce((a, b) => (pathLength(b) > pathLength(a) ? b : a), subs[0]);
      if (!best || pathLength(best) < 15) continue;
      const at = best[Math.floor(best.length / 2)];
      const label = formatCoord(line.value, line.axis, state.grid.format, state.grid.hemisphere);
      const y = at[1] - state.grid.labelSize * 0.35;
      if (!place(at[0], y, label, state.grid.labelSize, 'middle')) continue;
      group.appendChild(text(label, {x: num(at[0]), y: num(y)}));
    }
    map.appendChild(group);
  }

  // --- frame -----------------------------------------------------------------

  // A chequered band needs crossings to alternate on, along every edge. Curved
  // frames — Robinson, a globe, a tilted view — have edges the graticule never
  // reaches, so the border degrades to tick marks instead of turning into a
  // solid black bar.
  const divisions = state.grid.minor ? ticks.major.concat(ticks.minor) : ticks.major;
  const perEdge = (edge) => divisions.filter((t) => t.edge === edge).length;
  const checkerOk = ['top', 'bottom', 'left', 'right'].every((edge) => perEdge(edge) >= 2);
  const frameStyle = state.grid.frameStyle === 'checker' && !checkerOk ? 'ticks' : state.grid.frameStyle;

  const bandWidth = frameStyle === 'checker' ? Math.max(0.4, state.grid.band) : 0;
  const outer = {
    x0: rect.x0 - bandWidth,
    y0: rect.y0 - bandWidth,
    x1: rect.x1 + bandWidth,
    y1: rect.y1 + bandWidth,
  };

  if (state.layers.frame) {
    const frame = el('g', {id: 'frame'});
    if (frameStyle === 'checker') {
      const band = el('g', {id: 'frame-band', stroke: 'none'});
      for (const edge of ['top', 'bottom', 'left', 'right']) {
        const horizontal = edge === 'top' || edge === 'bottom';
        const from = horizontal ? rect.x0 : rect.y0;
        const to = horizontal ? rect.x1 : rect.y1;
        const cuts = divisions
          .filter((t) => t.edge === edge)
          .map((t) => (horizontal ? t.x : t.y))
          .filter((v) => v > from + 1e-6 && v < to - 1e-6)
          .sort((a, b) => a - b);
        const stops = [from, ...cuts, to];
        for (let i = 0; i < stops.length - 1; i++) {
          const a = stops[i];
          const b = stops[i + 1];
          if (b - a < 1e-6) continue;
          const fill = i % 2 === 0 ? C.frame : C.paper;
          const attrs = horizontal
            ? {
                x: num(a),
                y: num(edge === 'top' ? rect.y0 - bandWidth : rect.y1),
                width: num(b - a),
                height: num(bandWidth),
              }
            : {
                x: num(edge === 'left' ? rect.x0 - bandWidth : rect.x1),
                y: num(a),
                width: num(bandWidth),
                height: num(b - a),
              };
          band.appendChild(el('rect', {...attrs, fill}));
        }
      }
      // Corner squares, so the band closes cleanly.
      for (const [cx, cy] of [
        [outer.x0, outer.y0],
        [rect.x1, outer.y0],
        [outer.x0, rect.y1],
        [rect.x1, rect.y1],
      ]) {
        band.appendChild(
          el('rect', {x: num(cx), y: num(cy), width: num(bandWidth), height: num(bandWidth), fill: C.frame})
        );
      }
      frame.appendChild(band);
      frame.appendChild(
        el('rect', {
          x: num(outer.x0),
          y: num(outer.y0),
          width: num(outer.x1 - outer.x0),
          height: num(outer.y1 - outer.y0),
          fill: 'none',
          stroke: C.frame,
          'stroke-width': num(w.frame, 3),
        })
      );
      frame.appendChild(
        el('rect', {
          x: num(rect.x0),
          y: num(rect.y0),
          width: num(rect.x1 - rect.x0),
          height: num(rect.y1 - rect.y0),
          fill: 'none',
          stroke: C.frame,
          'stroke-width': num(w.frameInner, 3),
        })
      );
    } else {
      frame.appendChild(
        el('rect', {
          x: num(rect.x0),
          y: num(rect.y0),
          width: num(rect.x1 - rect.x0),
          height: num(rect.y1 - rect.y0),
          fill: 'none',
          stroke: C.frame,
          'stroke-width': num(w.frame, 3),
        })
      );
      if (frameStyle === 'ticks') {
        const marks = el('g', {
          id: 'frame-ticks',
          stroke: C.frame,
          'stroke-width': num(w.tick, 3),
          fill: 'none',
        });
        const draw = (t, length) => {
          const [dx, dy] =
            t.edge === 'top' ? [0, -1] : t.edge === 'bottom' ? [0, 1] : t.edge === 'left' ? [-1, 0] : [1, 0];
          marks.appendChild(
            el('line', {
              x1: num(t.x),
              y1: num(t.y),
              x2: num(t.x + dx * length),
              y2: num(t.y + dy * length),
            })
          );
        };
        for (const t of ticks.major) draw(t, state.grid.tick);
        if (state.grid.minor) for (const t of ticks.minor) draw(t, state.grid.tick * 0.5);
        frame.appendChild(marks);
      }
    }
    svg.appendChild(frame);
  }

  // --- graticule labels on the frame ----------------------------------------

  if (state.grid.labels === 'frame' || state.grid.labels === 'both') {
    const size = state.grid.labelSize;
    const off =
      (frameStyle === 'checker' ? bandWidth : frameStyle === 'ticks' ? state.grid.tick : 0) +
      state.grid.labelGap;
    const group = el('g', {
      id: 'graticule-labels',
      'font-family': family,
      'font-size': num(size, 3),
      fill: C.text,
    });
    // In order along each edge, so that a grid too fine to label completely
    // keeps an even selection rather than a random one.
    const ordered = [...ticks.major].sort((a, b) =>
      a.edge === b.edge
        ? (a.edge === 'top' || a.edge === 'bottom' ? a.x - b.x : a.y - b.y)
        : a.edge.localeCompare(b.edge)
    );
    const labelled = new Set();
    const key = (axis, value) => `${axis}:${value.toFixed(6)}`;
    for (const t of ordered) {
      const label = formatCoord(t.value, t.axis, state.grid.format, state.grid.hemisphere);
      let x;
      let y;
      let anchor;
      if (t.edge === 'top') [x, y, anchor] = [t.x, rect.y0 - off, 'middle'];
      else if (t.edge === 'bottom') [x, y, anchor] = [t.x, rect.y1 + off + size * 0.8, 'middle'];
      else if (t.edge === 'left') [x, y, anchor] = [rect.x0 - off, t.y + size * 0.35, 'end'];
      else [x, y, anchor] = [rect.x1 + off, t.y + size * 0.35, 'start'];
      if (!place(x, y, label, size, anchor)) continue;
      group.appendChild(text(label, {x: num(x), y: num(y), 'text-anchor': anchor}));
      labelled.add(key(t.axis, t.value));
    }
    svg.appendChild(group);

    // Lines with no label yet — they never reached the frame (a globe, a
    // Robinson oval, a tilted view), or all their crossings landed on the same
    // spot, as the meridians of a Mollweide do at its pole. They are labelled on
    // the map instead: at the open end of the line where that end is clear of
    // the poles, otherwise where the line crosses a parallel or meridian well
    // inside the view.
    const missing = traced.major.filter((m) => !labelled.has(key(m.line.axis, m.line.value)));
    if (missing.length) {
      // Only a pole that projects to a single point makes meridian labels
      // collide there. Robinson, Miller and the like map each pole to a line,
      // so their meridians can be labelled at their own ends.
      const poles = [90, -90].map((lat) => convergencePoint(lat, projection, centre, clipAngle)).filter(Boolean);
      const inner = el('g', {
        id: 'graticule-labels-outline',
        'font-family': family,
        'font-size': num(size, 3),
        fill: C.text,
        stroke: C.paper,
        'stroke-width': num(size * 0.25, 3),
        'stroke-linejoin': 'round',
        'paint-order': 'stroke',
      });
      // Where a line has to be labelled on the map, try the central parallel or
      // meridian first, then rows either side of it. Without that spread, every
      // meridian of a Mollweide or azimuthal world map wants the same spot on
      // the equator and all but a few labels are dropped.
      const rows = (lo, hi) => {
        const base = pick(lo, hi);
        const step = (hi - lo) / 6;
        const out = [base];
        for (let k = 1; k <= 3; k++) {
          for (const v of [base + k * step, base - k * step]) if (v > lo && v < hi) out.push(v);
        }
        return out;
      };
      const latRows = rows(spec.range.south, spec.range.north);
      const lonRows = rows(spec.range.west, spec.range.east);
      for (const {line, subs} of missing) {
        const label = formatCoord(line.value, line.axis, state.grid.format, state.grid.hemisphere);
        const end = bestEnd(subs, poles);
        if (end && end.clearance > 4) {
          const attrs = tangentAttrs(end, size, state.grid.labelGap + 0.5);
          if (place(Number(attrs.x), Number(attrs.y), label, size, attrs['text-anchor'])) {
            inner.appendChild(text(label, attrs));
            continue;
          }
        }
        for (const along of line.axis === 'lon' ? latRows : lonRows) {
          const at =
            line.axis === 'lon'
              ? projectPoint([line.value, along], projection, rect, centre, clipAngle)
              : projectPoint([along, line.value], projection, rect, centre, clipAngle);
          if (!at) continue;
          const y = at[1] + (line.axis === 'lon' ? size * 1.15 : -size * 0.4);
          if (!place(at[0], y, label, size, 'middle')) continue;
          inner.appendChild(text(label, {x: num(at[0]), y: num(y), 'text-anchor': 'middle'}));
          break;
        }
      }
      if (inner.childNodes.length) svg.appendChild(inner);
    }
  }

  renderCities();

  // --- scale bar, title, credit ---------------------------------------------

  if (bar) {
    const pad = 2.2;
    const size = state.grid.labelSize * 0.9;
    const height = 1.1;
    const x = rect.x1 - pad - bar.mm;
    const y = rect.y1 - pad - height;
    const group = el('g', {id: 'scalebar'});
    group.appendChild(
      el('rect', {
        x: num(x - 1.6),
        y: num(y - size - 1.4),
        width: num(bar.mm + 3.2),
        height: num(height + size + 2.8),
        fill: C.paper,
        'fill-opacity': 0.78,
        stroke: 'none',
      })
    );
    for (let i = 0; i < 4; i++) {
      group.appendChild(
        el('rect', {
          x: num(x + (bar.mm / 4) * i),
          y: num(y),
          width: num(bar.mm / 4),
          height: num(height),
          fill: i % 2 ? C.paper : C.frame,
          stroke: C.frame,
          'stroke-width': num(w.scalebar * 0.5, 3),
        })
      );
    }
    group.appendChild(
      text(bar.label, {
        x: num(x + bar.mm),
        y: num(y - 1),
        'text-anchor': 'end',
        'font-family': family,
        'font-size': num(size, 3),
        fill: C.text,
      })
    );
    group.appendChild(
      text('0', {
        x: num(x),
        y: num(y - 1),
        'text-anchor': 'start',
        'font-family': family,
        'font-size': num(size, 3),
        fill: C.text,
      })
    );
    svg.appendChild(group);
  }

  if (state.title.show) {
    const group = el('g', {id: 'title', 'font-family': family, fill: C.text});
    const size = state.grid.labelSize * 1.9;
    group.appendChild(
      text(state.title.text || '', {
        x: num(pageRect.x0),
        y: num(margin + size * 0.85),
        'font-size': num(size, 3),
        'font-weight': 600,
      })
    );
    if (state.title.subtitle) {
      group.appendChild(
        text(state.title.subtitle, {
          x: num(pageRect.x1),
          y: num(margin + size * 0.85),
          'font-size': num(state.grid.labelSize, 3),
          'text-anchor': 'end',
        })
      );
    }
    svg.appendChild(group);
  }

  if (state.title.credit) {
    const parts = [def.label];
    if (scale) parts.push(`1:${formatScale(scale.denominator)}`);
    if (state.view.mode === 'tilt') {
      parts.push(`${Math.round(state.view.heightKm)} km above ground, tilt ${Math.round(state.view.tilt)}°`);
    }
    parts.push('Natural Earth data');
    svg.appendChild(
      text(parts.join(' · '), {
        x: num(pageRect.x0),
        y: num(H - margin * 0.35),
        'font-family': family,
        'font-size': num(state.grid.labelSize * 0.8, 3),
        fill: C.text,
        'fill-opacity': 0.75,
      })
    );
  }

  const view = {projection, rect, page: {width: W, height: H}};
  if (state.view.mode === 'section') svg.appendChild(sectionOverlay(view, sectionBox(state.view)));

  return {
    svg,
    info: {
      ...view,
      def,
      centre,
      clipAngle,
      spec,
      scale,
      ticks: ticks.major.length,
      dots: dotCount,
      horizonKm: state.view.mode === 'tilt' ? horizonRadiusKm(state.view.heightKm) : null,
    },
  };
}

// --- section handles ---------------------------------------------------------
// Interface furniture, not part of the map: the group is marked data-ui so that
// export strips it and @media print hides it.

/** Handle id, then its position as a fraction of the box in lon and lat. */
const HANDLES = [
  ['nw', 0, 1],
  ['n', 0.5, 1],
  ['ne', 1, 1],
  ['e', 1, 0.5],
  ['se', 1, 0],
  ['s', 0.5, 0],
  ['sw', 0, 0],
  ['w', 0, 0.5],
];

const HANDLE_COLOUR = '#2b6f9e';

function boxPerimeter(box, steps = 24) {
  const out = [];
  const at = (fx, fy) => [box.west + (box.east - box.west) * fx, box.south + (box.north - box.south) * fy];
  for (let i = 0; i <= steps; i++) out.push(at(i / steps, 1));
  for (let i = 1; i <= steps; i++) out.push(at(1, 1 - i / steps));
  for (let i = 1; i <= steps; i++) out.push(at(1 - i / steps, 0));
  for (let i = 1; i <= steps; i++) out.push(at(0, i / steps));
  return out;
}

/**
 * Outline of a section box with eight drag handles, in page millimetres.
 * Drawn over the whole page rather than clipped to the map, so that a box being
 * dragged larger than the current view is still visible.
 */
export function sectionOverlay({projection, rect, page}, box) {
  const group = el('g', {id: 'section-handles', 'data-ui': 'true'});
  const saved = projection.clipExtent();
  projection.clipExtent([
    [0, 0],
    [page.width, page.height],
  ]);
  try {
    const subs = makeTracer(projection)({type: 'LineString', coordinates: boxPerimeter(box)});
    const d = subpathsToPath(subs);
    if (d) {
      group.appendChild(
        el('path', {
          d,
          fill: 'none',
          stroke: HANDLE_COLOUR,
          'stroke-width': 0.35,
          'stroke-dasharray': '2 1.4',
          'stroke-linejoin': 'round',
        })
      );
    }
    for (const [id, fx, fy] of HANDLES) {
      const lon = box.west + (box.east - box.west) * fx;
      const lat = box.south + (box.north - box.south) * fy;
      const p = projection([lon, lat]);
      if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
      if (p[0] < 0 || p[0] > page.width || p[1] < 0 || p[1] > page.height) continue;
      const handle = el('g', {'data-handle': id});
      handle.appendChild(
        el('circle', {cx: num(p[0]), cy: num(p[1]), r: 3, fill: '#000', 'fill-opacity': 0, 'pointer-events': 'all'})
      );
      handle.appendChild(
        el('rect', {
          x: num(p[0] - 1.1),
          y: num(p[1] - 1.1),
          width: 2.2,
          height: 2.2,
          fill: '#ffffff',
          stroke: HANDLE_COLOUR,
          'stroke-width': 0.4,
          'pointer-events': 'none',
        })
      );
      group.appendChild(handle);
    }
  } finally {
    projection.clipExtent(saved);
  }
  return group;
}

/**
 * Where a pole collapses to a point, or null when it is a line (or hidden).
 * Three meridians are tested; if they land within a millimetre of each other
 * the pole is a convergence point.
 */
function convergencePoint(lat, projection, centre, clipAngle) {
  const points = [0, 90, 180].map((lon) => {
    if (clipAngle != null && globalThis.d3.geoDistance([lon, lat], centre) * (180 / Math.PI) > clipAngle) return null;
    const p = projection([lon, lat]);
    return p && Number.isFinite(p[0]) && Number.isFinite(p[1]) ? p : null;
  });
  if (points.some((p) => !p)) return null;
  const spread = Math.max(
    ...points.map((a) => Math.max(...points.map((b) => Math.hypot(a[0] - b[0], a[1] - b[1]))))
  );
  return spread < 1 ? points[0] : null;
}

/** Reference line for on-map labels: the zero line if it is in range. */
function pick(a, b) {
  const low = Math.min(a, b);
  const high = Math.max(a, b);
  return low <= 0 && high >= 0 ? 0 : (low + high) / 2;
}

/**
 * Open end of a traced line that sits farthest from the projected poles, where
 * meridians converge and labels would pile up.
 */
function bestEnd(subs, poles) {
  let best = null;
  for (const sp of subs) {
    const closed = Math.hypot(sp[0][0] - sp[sp.length - 1][0], sp[0][1] - sp[sp.length - 1][1]) < 0.05;
    if (closed || sp.length < 2) continue;
    for (const [point, prev] of [
      [sp[0], sp[1]],
      [sp[sp.length - 1], sp[sp.length - 2]],
    ]) {
      const clearance = poles.length
        ? Math.min(...poles.map((p) => Math.hypot(p[0] - point[0], p[1] - point[1])))
        : Infinity;
      if (!best || clearance > best.clearance) best = {point, prev, clearance};
    }
  }
  return best;
}

/** Text placement just past the end of a line, along its own direction. */
function tangentAttrs(end, size, gap) {
  const dx = end.point[0] - end.prev[0];
  const dy = end.point[1] - end.prev[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const anchor = ux < -0.3 ? 'end' : ux > 0.3 ? 'start' : 'middle';
  const shift = uy > 0.3 ? size * 0.85 : uy < -0.3 ? -size * 0.2 : size * 0.35;
  return {
    x: num(end.point[0] + ux * gap),
    y: num(end.point[1] + uy * gap + shift),
    'text-anchor': anchor,
  };
}

function pathLength(points) {
  let sum = 0;
  for (let i = 1; i < points.length; i++) {
    sum += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  return sum;
}

export function formatScale(denominator) {
  const rounded =
    denominator > 1e6
      ? Math.round(denominator / 1e5) * 1e5
      : denominator > 1e5
        ? Math.round(denominator / 1e4) * 1e4
        : Math.round(denominator / 1e3) * 1e3;
  return rounded.toLocaleString('en-US').replace(/,/g, ' ');
}
