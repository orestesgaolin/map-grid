// Colour themes, fonts and line widths. Widths are millimetres on the page and
// are all multiplied by style.lineScale before use.

export const THEMES = {
  print: {
    label: 'Print',
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
  mono: {
    label: 'Line art',
    paper: '#ffffff',
    ocean: '#ffffff',
    land: '#ffffff',
    coast: '#000000',
    border: '#666666',
    water: '#ffffff',
    waterLine: '#000000',
    river: '#000000',
    gridMajor: '#000000',
    gridMinor: '#9a9a9a',
    frame: '#000000',
    text: '#000000',
    city: '#000000',
    cityText: '#000000',
  },
  atlas: {
    label: 'Atlas',
    paper: '#fbf8f1',
    ocean: '#cfe3ee',
    land: '#efe6d2',
    coast: '#7b6a55',
    border: '#b09a7a',
    water: '#a8cde2',
    waterLine: '#5d90b0',
    river: '#5d90b0',
    gridMajor: '#93866f',
    gridMinor: '#c9bda6',
    frame: '#3d3428',
    text: '#3d3428',
    city: '#a33c2a',
    cityText: '#3d3428',
  },
  blueprint: {
    label: 'Blueprint',
    paper: '#0d2b45',
    ocean: '#0d2b45',
    land: '#123a5c',
    coast: '#8ecae6',
    border: '#3f6f92',
    water: '#17466e',
    waterLine: '#8ecae6',
    river: '#6aa9cf',
    gridMajor: '#7fb6d6',
    gridMinor: '#31597a',
    frame: '#cfe8f6',
    text: '#e8f4fb',
    city: '#ffd166',
    cityText: '#e8f4fb',
  },
  night: {
    label: 'Night',
    paper: '#14161a',
    ocean: '#1b2028',
    land: '#2a2f38',
    coast: '#7d8794',
    border: '#4a525d',
    water: '#243244',
    waterLine: '#5b7f9c',
    river: '#5b7f9c',
    gridMajor: '#6c7684',
    gridMinor: '#333a44',
    frame: '#d7dce2',
    text: '#e6eaee',
    city: '#f2a65a',
    cityText: '#e6eaee',
  },
};

export const COLOUR_KEYS = Object.keys(THEMES.print).filter((k) => k !== 'label');

export const FONTS = {
  sans: {label: 'Sans', family: '"Helvetica Neue", Helvetica, Arial, sans-serif'},
  serif: {label: 'Serif', family: 'Georgia, "Times New Roman", Times, serif'},
  mono: {label: 'Monospace', family: '"SF Mono", Menlo, Consolas, monospace'},
};

export const WIDTHS = {
  coast: 0.25,
  border: 0.16,
  river: 0.16,
  waterLine: 0.12,
  gridMajor: 0.14,
  gridMinor: 0.07,
  frame: 0.3,
  frameInner: 0.12,
  tick: 0.22,
  sphere: 0.3,
  scalebar: 0.25,
};

/**
 * Colours in use: whatever the state holds, with the selected theme as the
 * fallback for anything missing. Picking a theme in the UI copies its values
 * into the state, so individual colours stay editable afterwards.
 */
export function tokens(style) {
  const theme = THEMES[style.theme] || THEMES.print;
  const out = {};
  for (const key of COLOUR_KEYS) out[key] = style[key] || theme[key];
  return out;
}

/** The colour set of a theme, ready to be merged into state.style. */
export function themeColours(name) {
  const theme = THEMES[name] || THEMES.print;
  const out = {};
  for (const key of COLOUR_KEYS) out[key] = theme[key];
  return out;
}

export function widths(style) {
  const k = Math.max(0.2, Math.min(4, style.lineScale || 1));
  const out = {};
  for (const [key, value] of Object.entries(WIDTHS)) out[key] = value * k;
  return out;
}

export function fontFamily(style) {
  return (FONTS[style.font] || FONTS.sans).family;
}
