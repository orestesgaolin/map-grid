// Control panel: fills the selects, binds inputs to state paths and applies the
// conditional visibility rules declared in the markup.
//
// Markup contract
//   data-bind="a.b.c"        two-way binding to a state path
//   data-scale="log"         range input mapped logarithmically between
//                            data-min and data-max
//   data-steps               select filled with the graticule step ladder
//   data-show="path:a|b"     element is shown when the value matches
//   data-show-truthy="path"  element is shown when the value is truthy
//   data-show-projection="parallels"  shown when the projection takes it
//   data-disable-if="path"   input is disabled when the value is truthy
//   data-action="name"       reported through onAction

import {get, set, PAGE_SIZES} from './state.js';
import {projections, projectionDef} from './projections.js';
import {THEMES, FONTS, COLOUR_KEYS} from './style.js';
import {DETAILS} from './datasets.js';
import {PRESETS, REGIONS} from './presets.js';
import {LANGUAGES, language, t, tf} from './i18n.js';

/** Number of steps on a logarithmic slider track. */
const LOG_TRACK = 1000;

const STEP_LADDER = [
  90, 60, 45, 30, 20, 15, 10, 5, 2, 1, 0.5, 0.25, 1 / 6, 0.1, 1 / 12, 0.05, 1 / 30, 0.02, 1 / 60, 1 / 120, 1 / 300,
];

export function stepLabel(v) {
  if (v >= 1) return `${Number(v.toFixed(4))}°`;
  const min = v * 60;
  if (min >= 1) return `${Number(min.toFixed(3))}′`;
  return `${Number((v * 3600).toFixed(2))}″`;
}

function option(value, label, selected) {
  const o = document.createElement('option');
  o.value = String(value);
  o.textContent = label;
  if (selected) o.selected = true;
  return o;
}

function roundSignificant(v, digits = 3) {
  if (!v) return v;
  const mag = Math.pow(10, digits - 1 - Math.floor(Math.log10(Math.abs(v))));
  return Math.round(v * mag) / mag;
}

function fill(select, entries) {
  if (!select) return;
  select.replaceChildren(...entries.map(([value, label]) => option(value, label)));
}

/** Fills every select that has fixed contents. */
export function buildControls(root) {
  const projectionSelect = root.querySelector('[data-bind="projection.id"]');
  if (projectionSelect) {
    projectionSelect.replaceChildren();
    const groups = new Map();
    for (const def of projections()) {
      if (def.tiltOnly) continue;
      if (!groups.has(def.group)) {
        const g = document.createElement('optgroup');
        g.label = tf(`group.${def.group}`, def.group);
        groups.set(def.group, g);
        projectionSelect.appendChild(g);
      }
      groups.get(def.group).appendChild(option(def.id, tf(`proj.${def.id}`, def.label)));
    }
  }

  fill(
    root.querySelector('[data-bind="style.theme"]'),
    Object.entries(THEMES).map(([id, theme]) => [id, tf(`theme.${id}`, theme.label)])
  );
  fill(
    root.querySelector('[data-bind="style.font"]'),
    Object.entries(FONTS).map(([id, f]) => [id, tf(`font.${id}`, f.label)])
  );
  fill(
    root.querySelector('[data-bind="detail"]'),
    DETAILS.map((d) => [d.id, `${tf(`detail.${d.id}`, d.label)} · ${d.note}`])
  );
  fill(
    root.querySelector('[data-bind="page.size"]'),
    Object.keys(PAGE_SIZES).map((k) => [
      k,
      k === 'Custom' ? t('page.custom') : k === 'Square' ? t('page.square') : k,
    ])
  );
  fill(root.querySelector('[data-action="preset"]'), [
    ['', t('field.presetPick')],
    ...PRESETS.map((p) => [p.id, tf(`preset.${p.id}`, p.label)]),
  ]);
  fill(root.querySelector('[data-action="region"]'), [
    ['', t('field.regionPick')],
    ...REGIONS.map((r) => [r.id, tf(`region.${r.id}`, r.label)]),
  ]);
  const langSelect = root.querySelector('[data-action="language"]');
  if (langSelect) {
    fill(
      langSelect,
      LANGUAGES.map((l) => [l.id, l.label])
    );
    langSelect.value = language();
  }

  // Logarithmic sliders run over a fixed 0…1000 track, set here so the markup
  // cannot disagree with readValue()/writeValue(). Without it the browser falls
  // back to its own 0…100 default and the top of the range is unreachable.
  for (const input of root.querySelectorAll('input[type="range"][data-scale="log"]')) {
    input.min = '0';
    input.max = String(LOG_TRACK);
    input.step = '1';
  }

  for (const select of root.querySelectorAll('select[data-steps]')) {
    fill(
      select,
      STEP_LADDER.map((v) => [v, stepLabel(v)])
    );
  }

  // Swatch first, then the name: the row reads as the colour it sets.
  const colours = root.querySelector('#colours');
  if (colours) {
    colours.replaceChildren(
      ...COLOUR_KEYS.map((key) => {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'color';
        input.dataset.bind = `style.${key}`;
        const name = document.createElement('span');
        name.textContent = t(`colour.${key}`);
        label.append(input, name);
        return label;
      })
    );
  }
}

function readValue(input, state) {
  const path = input.dataset.bind;
  if (input.type === 'checkbox') return input.checked;
  if (input.dataset.scale === 'log') {
    const min = Number(input.dataset.min);
    const max = Number(input.dataset.max);
    const frac = Number(input.value) / LOG_TRACK;
    return roundSignificant(Math.exp(Math.log(min) + frac * (Math.log(max) - Math.log(min))), 3);
  }
  if (input.type === 'number' || input.type === 'range' || input.dataset.steps !== undefined) {
    const n = Number(input.value);
    return Number.isFinite(n) ? n : get(state, path);
  }
  return input.value;
}

function writeValue(input, value) {
  if (input.type === 'checkbox') {
    input.checked = !!value;
    return;
  }
  if (input.dataset.scale === 'log') {
    const min = Number(input.dataset.min);
    const max = Number(input.dataset.max);
    const v = Math.min(Math.max(Number(value) || min, min), max);
    input.value = String(
      Math.round((LOG_TRACK * (Math.log(v) - Math.log(min))) / (Math.log(max) - Math.log(min)))
    );
    return;
  }
  if (input.tagName === 'SELECT' && input.dataset.steps !== undefined) {
    // Pick the closest step on the ladder, so imported values still match.
    let best = input.options[0];
    let bestErr = Infinity;
    for (const o of input.options) {
      const err = Math.abs(Number(o.value) - Number(value));
      if (err < bestErr) {
        bestErr = err;
        best = o;
      }
    }
    input.value = best.value;
    return;
  }
  const next = String(value ?? '');
  if (input.value !== next) input.value = next;
}

/** Two-way binding. `onChange(path)` fires after the state is updated. */
export function bindControls(root, state, {onChange, onAction}) {
  root.addEventListener('input', (event) => {
    const input = event.target;
    if (input.dataset?.bind) {
      set(state, input.dataset.bind, readValue(input, state));
      onChange(input.dataset.bind);
    }
    // A control may carry both: the theme select binds a value and also asks
    // for the theme colours to be copied into the state.
    if (input.dataset?.action) onAction(input.dataset.action, input.value, input);
  });

  root.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (button) onAction(button.dataset.action, button.value, button);
  });
}

/** Pushes the state into every bound control and applies visibility rules. */
export function refreshControls(root, state) {
  const active = document.activeElement;
  for (const input of root.querySelectorAll('[data-bind]')) {
    if (input === active && (input.type === 'number' || input.type === 'text')) continue;
    writeValue(input, get(state, input.dataset.bind));
  }

  for (const node of root.querySelectorAll('[data-show]')) {
    const [path, values] = node.dataset.show.split(':');
    const current = String(get(state, path));
    node.hidden = !values.split('|').includes(current);
  }
  for (const node of root.querySelectorAll('[data-show-truthy]')) {
    node.hidden = !get(state, node.dataset.showTruthy);
  }
  // Standard parallels are only asked for in world mode; a section derives them
  // from its own box and the tilted view does not use them at all.
  const def = state.view.mode === 'world' ? projectionDef(state.projection.id) : {};
  for (const node of root.querySelectorAll('[data-show-projection]')) {
    node.hidden = !def[node.dataset.showProjection];
  }
  for (const node of root.querySelectorAll('[data-disable-if]')) {
    const off = !!get(state, node.dataset.disableIf);
    node.disabled = off;
    for (const input of node.querySelectorAll?.('input, select') || []) input.disabled = off;
  }
}

export function toast(message, ms = 2600) {
  const node = document.getElementById('toast');
  if (!node) return;
  node.textContent = message;
  node.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    node.hidden = true;
  }, ms);
}
