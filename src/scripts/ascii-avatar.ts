import { prefersReducedMotion } from './lib/dom';

/**
 * Live ASCII portrait: renders the JN monogram as a character grid sampled
 * from an offscreen canvas, then keeps it alive with flickering edge noise —
 * the house's ASCII-avatar energy without shipping a 3D model.
 */

const DENSITY = ' .:-=+*#%@';
const COLS = 46;
const ROWS = 20;
const FLICKER_MS = 130;

export function initAsciiAvatar(pre: HTMLPreElement): () => void {
  // sample the monogram into a per-cell density mask
  const cv = document.createElement('canvas');
  const cellW = 8;
  const cellH = 16;
  cv.width = COLS * cellW;
  cv.height = ROWS * cellH;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#fff';
  try {
    ctx.font = `700 ${Math.floor(cv.height * 0.82)}px "Audiowide", system-ui, sans-serif`;
  } catch {
    ctx.font = '700 260px sans-serif';
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('JN', cv.width / 2, cv.height / 2 + cv.height * 0.04);
  const img = ctx.getImageData(0, 0, cv.width, cv.height).data;

  const base: string[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const px = img[((r * cellH + Math.floor(cellH / 2)) * cv.width + (c * cellW + Math.floor(cellW / 2))) * 4 + 3];
      base.push(px > 100 ? DENSITY[Math.min(DENSITY.length - 1, 3 + Math.floor((px / 255) * 6))] : ' ');
    }
  }

  let frame = 0;
  const render = () => {
    const out = base.slice();
    if (frame % 7 === 0) {
      // flicker: swap a few glyph cells to neighbouring densities
      for (let i = 0; i < base.length; i++) {
        if (base[i] !== ' ' && Math.random() < 0.045) {
          out[i] = DENSITY[Math.floor(Math.random() * DENSITY.length)];
        }
      }
    }
    if (frame % 29 === 0) {
      // rare glitch row
      const row = Math.floor(Math.random() * ROWS);
      for (let c = 0; c < COLS; c++) {
        const i = row * COLS + c;
        if (Math.random() < 0.5) out[i] = Math.random() < 0.5 ? '#' : DENSITY[1];
      }
    }
    let text = '';
    for (let r = 0; r < ROWS; r++) {
      text += out.slice(r * COLS, (r + 1) * COLS).join('') + '\n';
    }
    pre.textContent = text;
    frame++;
  };

  render();
  if (prefersReducedMotion()) return () => {};
  const timer = window.setInterval(render, FLICKER_MS);
  return () => clearInterval(timer);
}
