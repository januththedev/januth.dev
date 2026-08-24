import { showToast } from './lib/dom';

/**
 * Easter eggs: Konami party mode, logo click glitch, console banner.
 * All listeners are document-delegated and attached once, so they survive
 * Astro view transitions (which replace the body content).
 */

const KONAMI = [
  'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
  'b', 'a',
];

function toggleParty(): void {
  const on = document.body.classList.toggle('party');
  try {
    if (on) sessionStorage.setItem('jn:party', '1');
    else sessionStorage.removeItem('jn:party');
  } catch {}
  showToast(on ? '🎉 PARTY MODE — press the code again to stop' : 'party over. back to work.');
}

export function initEggs(): void {
  // --- konami code ---
  let kIdx = 0;
  document.addEventListener(
    'keydown',
    (e) => {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      kIdx = key === KONAMI[kIdx] ? kIdx + 1 : key === KONAMI[0] ? 1 : 0;
      if (kIdx === KONAMI.length) {
        kIdx = 0;
        toggleParty();
      }
    },
    { capture: true }
  );

  // re-apply party mode after view transitions wipe the body class
  document.addEventListener('astro:after-swap', () => {
    try {
      if (sessionStorage.getItem('jn:party')) document.body.classList.add('party');
    } catch {}
  });

  // --- JN logo ×7 → glitch burst ---
  let clicks = 0;
  let firstClick = 0;
  document.addEventListener('click', (e) => {
    const logo = (e.target as Element | null)?.closest?.('#logo-btn');
    if (!logo) return;
    const now = performance.now();
    if (now - firstClick > 4000) {
      clicks = 0;
      firstClick = now;
    }
    if (++clicks >= 7) {
      clicks = 0;
      document.body.classList.add('glitching');
      showToast('⚠ reality hiccup detected');
      setTimeout(() => document.body.classList.remove('glitching'), 900);
    }
  });

  // --- console banner for the devtools-curious ---
  try {
    console.log(
      '%cJN%c there is more here than meets the eye.\npress ` anywhere and type help.',
      'font-size:28px;font-weight:700;background:linear-gradient(90deg,#22d3ee,#8b5cf6);color:#050508;padding:4px 12px;border-radius:8px;',
      'font-family:monospace;color:#9a9aa8;'
    );
  } catch {}
}
