// SVG and PNG export. The rendered SVG is already self contained (presentation
// attributes only, no external references), so export is a serialise and save.

const MM_PER_INCH = 25.4;

/** Copy of the map without the interface furniture (section drag handles). */
function cleanClone(svg) {
  const clone = svg.cloneNode(true);
  for (const node of clone.querySelectorAll('[data-ui]')) node.remove();
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  return clone;
}

function serialise(svg) {
  return new XMLSerializer().serializeToString(cleanClone(svg));
}

function save(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function svgSource(svg) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + serialise(svg);
}

export function exportSVG(svg, filename) {
  save(new Blob([svgSource(svg)], {type: 'image/svg+xml;charset=utf-8'}), filename);
}

/**
 * Rasterises the SVG at a print resolution. Page size comes from the viewBox,
 * which is in millimetres.
 */
export async function exportPNG(svg, {dpi = 300, filename = 'map.png', background = '#ffffff'} = {}) {
  const [, , wMm, hMm] = svg.getAttribute('viewBox').split(/[\s,]+/).map(Number);
  const pxWidth = Math.round((wMm / MM_PER_INCH) * dpi);
  const pxHeight = Math.round((hMm / MM_PER_INCH) * dpi);
  // Browser canvas limits: 16384 px per side and roughly 250 megapixels.
  if (pxWidth > 16000 || pxHeight > 16000 || pxWidth * pxHeight > 250e6) {
    throw new Error(`${pxWidth}×${pxHeight} px is past what the browser can rasterise; lower the resolution or the page size (SVG has no such limit)`);
  }

  const clone = cleanClone(svg);
  clone.setAttribute('width', pxWidth);
  clone.setAttribute('height', pxHeight);
  const source = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([source], {type: 'image/svg+xml;charset=utf-8'}));

  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('the browser could not rasterise the map'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = pxWidth;
    canvas.height = pxHeight;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, pxWidth, pxHeight);
    ctx.drawImage(image, 0, 0, pxWidth, pxHeight);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('PNG encoding failed');
    save(blob, filename);
    return {pxWidth, pxHeight};
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function stamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}
