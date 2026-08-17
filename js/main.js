// Wiring: state in, SVG out, plus mouse interaction and export.

import {defaultState, merge, fromHash, toHash, pageBox} from './state.js';
import {load, setProgressHandler} from './datasets.js';
import {render, formatScale, sectionOverlay} from './render.js';
import {buildControls, bindControls, refreshControls, toast} from './ui.js';
import {presetPatch, regionPatch} from './presets.js';
import {exportPNG, exportSVG, stamp} from './exporter.js';
import {themeColours} from './style.js';
import {horizonRadiusKm, HEIGHT_LIMITS, sectionBox} from './projections.js';
import {initAnalytics, track} from './analytics.js';

const panel = document.getElementById('panel');
const stage = document.getElementById('stage');
const statusNode = document.getElementById('status');
const readout = document.getElementById('readout');

let state = merge(defaultState(), fromHash(location.hash) || {});
let currentSVG = null;
let currentInfo = null;
let drawToken = 0;
let scheduled = false;
let interactive = false; // true while dragging: draw the low detail data
let loading = 0;

function status(kind, message) {
  statusNode.textContent = message;
  statusNode.className = `status ${kind}`;
}

setProgressHandler((message) => {
  loading += message ? 1 : -1;
  if (loading > 0) status('busy', 'loading map data…');
  else status('', 'ready');
});

function needs() {
  return {
    // The sea cutout needs the coastline even when the land fill itself is off.
    base:
      state.layers.land ||
      state.layers.coast ||
      state.layers.borders ||
      state.layers.dots ||
      (state.layers.ocean && state.layers.seaCutout),
    rivers: state.layers.rivers,
    lakes: state.layers.lakes,
    cities: state.layers.cities,
  };
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    draw();
  });
}

async function draw() {
  const token = ++drawToken;
  const detail = interactive && state.detail === '10m' ? '50m' : state.detail;
  let data = {};
  try {
    data = await load(detail, needs());
  } catch (err) {
    status('error', err.message);
  }
  if (token !== drawToken) return;

  let out;
  try {
    out = render(state, data);
  } catch (err) {
    console.error(err);
    status('error', `cannot draw this view: ${err.message}`);
    return;
  }

  currentSVG = out.svg;
  currentInfo = out.info;
  attachInteraction(out.svg);
  stage.replaceChildren(out.svg);
  if (loading === 0 && !statusNode.classList.contains('error')) status('', 'ready');
  updateReadout();
  refreshControls(panel, state);
  updateHints();
  syncHash();
}

// --- readout and hints -------------------------------------------------------

function dpi() {
  return Number(document.getElementById('dpi').value) || 300;
}

function pixelSize() {
  const page = pageBox(state.page);
  return [Math.round((page.width / 25.4) * dpi()), Math.round((page.height / 25.4) * dpi())];
}

function updateReadout() {
  const page = pageBox(state.page);
  const [pw, ph] = pixelSize();
  const parts = [
    currentInfo?.def?.label,
    `${Number(page.width.toFixed(1))}×${Number(page.height.toFixed(1))} mm`,
    currentInfo?.scale ? `1:${formatScale(currentInfo.scale.denominator)} at the centre` : null,
    `${currentInfo?.ticks ?? 0} border ticks`,
    currentInfo?.dots != null ? `${currentInfo.dots} dots` : null,
    `${pw}×${ph} px at ${dpi()} dpi`,
  ].filter(Boolean);
  readout.textContent = parts.join('  ·  ');
  document.getElementById('px-size').textContent = `${pw} × ${ph} px`;
}

function updateHints() {
  const heightHint = document.getElementById('height-hint');
  if (heightHint) {
    const horizon = horizonRadiusKm(state.view.heightKm);
    // With tilt, the view is cut before the horizon to keep the perspective
    // finite; report what is really covered.
    const shown = currentInfo?.clipAngle != null ? (currentInfo.clipAngle / 180) * Math.PI * 6371.0088 : horizon;
    const km = Math.round(Math.min(shown, horizon)).toLocaleString('en-US');
    heightHint.textContent = `${km} km to the edge`;
  }
  const frameHint = document.getElementById('frame-hint');
  if (frameHint) {
    // Say so when the chequered band cannot be drawn on this frame.
    const fell = currentInfo?.frameStyleAsked === 'checker' && currentInfo?.frameStyle !== 'checker';
    frameHint.textContent = fell ? 'no graticule on the frame here — using ticks' : '';
  }
  const popHint = document.getElementById('pop-hint');
  if (popHint) popHint.textContent = `${Math.round(state.cities.minPop).toLocaleString('en-US')} people`;
}

let hashTimer = null;
function syncHash() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    const hash = toHash(state);
    history.replaceState(null, '', hash || location.pathname + location.search);
  }, 350);
}

// --- interaction -------------------------------------------------------------

function mmPerPixel(svg) {
  const box = svg.getBoundingClientRect();
  const [, , vw] = svg.getAttribute('viewBox').split(/[\s,]+/).map(Number);
  return box.width > 0 ? vw / box.width : 1;
}

function clampLon(v) {
  return ((((v + 180) % 360) + 360) % 360) - 180;
}

/** Pointer position in page millimetres. */
function pointInPage(svg, event) {
  const box = svg.getBoundingClientRect();
  const factor = mmPerPixel(svg);
  return [(event.clientX - box.left) * factor, (event.clientY - box.top) * factor];
}

const MIN_SPAN = 0.02; // degrees

/**
 * Resizing a section by its handles. The map is left alone for the duration of
 * the drag and only the overlay is redrawn: the projection is refitted to every
 * new box, so a live redraw would move the ground under the pointer and the
 * gesture would fight itself. The new box is committed on release.
 */
function startHandleDrag(svg, event, handle) {
  const info = currentInfo;
  if (!info?.projection?.invert) return;
  const origin = pointInPage(svg, event);
  const from = info.projection.invert(origin);
  if (!from || !Number.isFinite(from[0]) || !Number.isFinite(from[1])) return;

  const box = sectionBox(state.view);
  let pending = box;
  stage.classList.add('dragging');

  const resize = (event2) => {
    const to = info.projection.invert(pointInPage(svg, event2));
    if (!to || !Number.isFinite(to[0]) || !Number.isFinite(to[1])) return;
    let dLon = to[0] - from[0];
    if (dLon > 180) dLon -= 360;
    if (dLon < -180) dLon += 360;
    const dLat = to[1] - from[1];

    const next = {...box};
    if (handle.includes('n')) next.north = Math.min(90, Math.max(box.north + dLat, next.south + MIN_SPAN));
    if (handle.includes('s')) next.south = Math.max(-90, Math.min(box.south + dLat, next.north - MIN_SPAN));
    if (handle.includes('e')) next.east = Math.min(box.west + 360, Math.max(box.east + dLon, next.west + MIN_SPAN));
    if (handle.includes('w')) next.west = Math.max(box.east - 360, Math.min(box.west + dLon, next.east - MIN_SPAN));
    pending = next;

    const overlay = currentSVG?.querySelector('#section-handles');
    if (overlay) overlay.replaceWith(sectionOverlay(info, pending));
    status(
      'busy',
      `section ${(pending.east - pending.west).toFixed(2)}° × ${(pending.north - pending.south).toFixed(2)}°`
    );
  };

  const done = () => {
    window.removeEventListener('pointermove', resize);
    window.removeEventListener('pointerup', done);
    window.removeEventListener('pointercancel', done);
    stage.classList.remove('dragging');
    status('', 'ready');
    const west = clampLon(pending.west);
    state.view.west = Number(west.toFixed(4));
    state.view.east = Number((west + (pending.east - pending.west)).toFixed(4));
    state.view.south = Number(pending.south.toFixed(4));
    state.view.north = Number(pending.north.toFixed(4));
    schedule();
  };
  window.addEventListener('pointermove', resize);
  window.addEventListener('pointerup', done);
  window.addEventListener('pointercancel', done);
}

function attachInteraction(svg) {
  svg.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.target.closest?.('[data-handle]');
    if (handle && state.view.mode === 'section') {
      startHandleDrag(svg, event, handle.dataset.handle);
      return;
    }
    const factor = mmPerPixel(svg);
    const start = {
      x: event.clientX,
      y: event.clientY,
      view: {...state.view},
      projection: {...state.projection},
      info: currentInfo,
    };
    stage.classList.add('dragging');
    interactive = true;

    const move = (e) => {
      const dx = (e.clientX - start.x) * factor;
      const dy = (e.clientY - start.y) * factor;
      if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) return;
      applyDrag(start, dx, dy);
      schedule();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      stage.classList.remove('dragging');
      interactive = false;
      schedule();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  });

  svg.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.05 : 0.0015));
      const step = Math.min(Math.max(factor, 0.5), 2);
      if (state.view.mode === 'section') {
        zoomSection(step, event, svg);
      } else if (state.view.mode === 'tilt') {
        state.view.heightKm = Math.min(
          Math.max(state.view.heightKm / step, HEIGHT_LIMITS.min),
          HEIGHT_LIMITS.max
        );
      } else {
        state.view.zoom = Math.min(Math.max((state.view.zoom || 1) * step, 0.2), 200);
      }
      schedule();
    },
    {passive: false}
  );
}

function applyDrag(start, dx, dy) {
  if (state.view.mode === 'section') {
    const info = start.info;
    if (!info?.projection?.invert) return;
    const rect = info.rect;
    const cx = (rect.x0 + rect.x1) / 2;
    const cy = (rect.y0 + rect.y1) / 2;
    const a = info.projection.invert([cx, cy]);
    const b = info.projection.invert([cx - dx, cy - dy]);
    if (!a || !b || !Number.isFinite(b[0]) || !Number.isFinite(b[1])) return;
    let dlon = b[0] - a[0];
    if (dlon > 180) dlon -= 360;
    if (dlon < -180) dlon += 360;
    let dlat = b[1] - a[1];
    dlat = Math.max(dlat, -90 - start.view.south);
    dlat = Math.min(dlat, 90 - start.view.north);
    state.view.west = Number((start.view.west + dlon).toFixed(4));
    state.view.east = Number((start.view.east + dlon).toFixed(4));
    state.view.south = Number((start.view.south + dlat).toFixed(4));
    state.view.north = Number((start.view.north + dlat).toFixed(4));
    return;
  }
  // Rotate the globe: one millimetre on the page is one radian divided by the
  // projection scale.
  const scale = start.info?.projection?.scale?.() || 150;
  const perMm = 180 / (Math.PI * scale);
  state.projection.lon0 = Number(clampLon(start.projection.lon0 - dx * perMm).toFixed(3));
  state.projection.lat0 = Number(Math.min(90, Math.max(-90, start.projection.lat0 + dy * perMm)).toFixed(3));
}

function zoomSection(step, event, svg) {
  const info = currentInfo;
  const box = svg.getBoundingClientRect();
  const factor = mmPerPixel(svg);
  let anchor = null;
  if (info?.projection?.invert) {
    const point = [(event.clientX - box.left) * factor, (event.clientY - box.top) * factor];
    const inverted = info.projection.invert(point);
    if (inverted && Number.isFinite(inverted[0]) && Number.isFinite(inverted[1])) anchor = inverted;
  }
  const {west, east, south, north} = state.view;
  const spanLon = (east > west ? east : east + 360) - west;
  const spanTilt = north - south;
  const at = anchor || [west + spanLon / 2, south + spanTilt / 2];
  const nextLon = Math.min(Math.max(spanLon / step, 0.02), 360);
  const nextLat = Math.min(Math.max(spanTilt / step, 0.02), 180);
  const fx = Math.min(Math.max((at[0] - west) / spanLon, 0), 1);
  const fy = Math.min(Math.max((at[1] - south) / spanTilt, 0), 1);
  let newWest = at[0] - fx * nextLon;
  let newSouth = at[1] - fy * nextLat;
  newSouth = Math.min(Math.max(newSouth, -90), 90 - nextLat);
  state.view.west = Number(newWest.toFixed(4));
  state.view.east = Number((newWest + nextLon).toFixed(4));
  state.view.south = Number(newSouth.toFixed(4));
  state.view.north = Number((newSouth + nextLat).toFixed(4));
}

// --- actions -----------------------------------------------------------------

function baseName() {
  const parts = ['mapgrid', currentInfo?.def?.id || state.projection.id, state.view.mode, stamp()];
  return parts.join('-');
}

async function onAction(name, value, element) {
  switch (name) {
    case 'preset': {
      const patch = presetPatch(value);
      if (!patch) return;
      merge(state, patch);
      if (patch.style?.theme) merge(state.style, themeColours(patch.style.theme));
      element.value = '';
      track('preset', {preset: value});
      schedule();
      break;
    }
    case 'region': {
      const patch = regionPatch(value);
      if (!patch) return;
      merge(state, patch);
      element.value = '';
      schedule();
      break;
    }
    case 'theme':
      merge(state.style, themeColours(state.style.theme));
      schedule();
      break;
    case 'reset-grid':
      merge(state.grid, defaultState().grid);
      schedule();
      toast('grid reset');
      break;
    case 'recentre':
      state.view.zoom = 1;
      state.view.panX = 0;
      state.view.panY = 0;
      schedule();
      break;
    case 'reset':
      state = defaultState();
      schedule();
      break;
    case 'svg':
      if (!currentSVG) return;
      exportSVG(currentSVG, `${baseName()}.svg`);
      track('export/svg', {projection: currentInfo?.def?.id, frame: state.view.mode, detail: state.detail});
      toast('SVG saved');
      break;
    case 'png':
      if (!currentSVG) return;
      try {
        status('busy', 'rasterising…');
        const {pxWidth, pxHeight} = await exportPNG(currentSVG, {
          dpi: dpi(),
          filename: `${baseName()}.png`,
          background: state.style.paper,
        });
        status('', 'ready');
        track('export/png', {projection: currentInfo?.def?.id, frame: state.view.mode, dpi: dpi()});
        toast(`PNG saved, ${pxWidth}×${pxHeight} px`);
      } catch (err) {
        status('error', err.message);
        toast(`PNG export failed: ${err.message}`, 5000);
      }
      break;
    case 'link':
      try {
        await navigator.clipboard.writeText(location.href);
        toast('link copied');
      } catch {
        toast('copy failed — the link is in the address bar');
      }
      break;
    default:
      break;
  }
}

// --- start -------------------------------------------------------------------

buildControls(panel);
bindControls(panel, state, {
  onChange: (path) => {
    // Changing the page or the frame invalidates the fitted zoom offsets.
    if (path === 'view.mode') {
      state.view.zoom = 1;
      state.view.panX = 0;
      state.view.panY = 0;
    }
    schedule();
  },
  onAction,
});
for (const link of document.querySelectorAll('#repo-link, #repo-link-foot')) {
  if (globalThis.MAPGRID?.repo) link.href = globalThis.MAPGRID.repo;
}
document.getElementById('dpi').addEventListener('change', updateReadout);
window.addEventListener('resize', () => updateReadout());
window.addEventListener('hashchange', () => {
  const patch = fromHash(location.hash);
  if (patch) {
    state = merge(defaultState(), patch);
    schedule();
  }
});

refreshControls(panel, state);
status('busy', 'loading map data…');
initAnalytics();
schedule();
