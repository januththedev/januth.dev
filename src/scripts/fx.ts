import { $, $$, isCoarsePointer, prefersReducedMotion } from './lib/dom';
import { Scramble } from './scramble';

/**
 * The motion layer: everything that makes the site feel alive, kept off the
 * critical path. Every effect here is decoration over content that already
 * works — each one bails out under reduced motion, and the pointer-driven
 * ones bail out on touch devices.
 *
 *   initFxGlobal()  once: delegated pointer effects (survive router swaps)
 *   initFxPage()    per page: effects bound to that page's own elements
 */

/* ---------------- scroll progress hairline ---------------- */

export function updateScrollProgress(): void {
  const bar = $('#scroll-progress');
  if (!bar) return;
  const max = document.documentElement.scrollHeight - innerHeight;
  bar.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 0})`;
}

/* ---------------- headline word reveal ---------------- */

/**
 * Wraps each word of a heading in a clipping mask so it can rise into place.
 * Text nodes are split in place, so nested markup (the accent <span>s) and the
 * accessible name of the heading are untouched.
 */
function splitWords(el: HTMLElement): void {
  if (el.dataset.split === 'done') return;
  el.dataset.split = 'done';
  let index = 0;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  while (walker.nextNode()) texts.push(walker.currentNode as Text);
  for (const node of texts) {
    const parts = (node.nodeValue ?? '').split(/(\s+)/);
    if (parts.every((p) => !p.trim())) continue;
    const frag = document.createDocumentFragment();
    for (const part of parts) {
      if (!part) continue;
      if (!part.trim()) {
        frag.append(document.createTextNode(part));
        continue;
      }
      const mask = document.createElement('span');
      mask.className = 'w';
      const inner = document.createElement('span');
      inner.className = 'wi';
      inner.style.setProperty('--w', String(index++));
      inner.textContent = part;
      mask.append(inner);
      frag.append(mask);
    }
    node.replaceWith(frag);
  }
}

/* ---------------- work showcase: cursor-following preview ---------------- */

function initShowcase(): void {
  const list = $('#work-list');
  const preview = $('#work-preview');
  if (!list || !preview || list.dataset.wired) return;
  list.dataset.wired = '1';
  if (isCoarsePointer() || prefersReducedMotion()) return; // touch gets inline thumbnails

  const panes = $$('.wp-pane', preview);
  let x = 0;
  let y = 0;
  let tx = 0;
  let ty = 0;
  let raf = 0;
  let shown = false;

  const GAP = 36; // the card rides beside the cursor, never on top of what you're reading
  let side = 1; // 1 = right of the cursor, -1 = left

  const loop = () => {
    raf = 0;
    x += (tx - x) * 0.14;
    y += (ty - y) * 0.14;
    const pw = preview.offsetWidth;
    const ph = preview.offsetHeight;
    // flip to the other side when there is no room; hysteresis stops it flickering
    if (side === 1 && tx + GAP + pw > list.clientWidth) side = -1;
    else if (side === -1 && tx + GAP + pw < list.clientWidth - 80) side = 1;
    const px = side === 1 ? x + GAP : x - GAP - pw;
    // lean into the direction of travel, like a card being dragged
    const tilt = Math.max(-7, Math.min(7, (tx - x) * 0.05));
    preview.style.transform = `translate3d(${px}px, ${y - ph * 0.42}px, 0) rotate(${tilt}deg)`;
    if (shown && Math.abs(tx - x) + Math.abs(ty - y) > 0.2) raf = requestAnimationFrame(loop);
  };

  const activate = (row: HTMLElement | null) => {
    for (const r of $$('.work-row', list)) r.classList.toggle('is-active', r === row);
    const idx = row?.dataset.index;
    for (const p of panes) p.classList.toggle('on', p.dataset.index === idx);
    shown = !!row;
    preview.classList.toggle('show', shown);
    list.classList.toggle('has-active', shown);
  };

  list.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const row = (e.target as Element | null)?.closest?.('.work-row');
    const rect = list.getBoundingClientRect();
    tx = e.clientX - rect.left;
    ty = e.clientY - rect.top;
    if (!shown && row) {
      x = tx;
      y = ty;
    }
    activate(row instanceof HTMLElement ? row : null);
    if (!raf) raf = requestAnimationFrame(loop);
  });
  list.addEventListener('pointerleave', () => activate(null));
  // keyboard users get the same highlight (the preview stays put for them)
  list.addEventListener('focusin', (e) => {
    const row = (e.target as Element | null)?.closest?.('.work-row');
    for (const r of $$('.work-row', list)) r.classList.toggle('is-active', r === row);
  });
}

/* ---------------- marquee: scroll adds momentum ---------------- */

function initMarquee(): void {
  const track = $('#marquee-track');
  if (!track || track.dataset.wired || prefersReducedMotion()) return;
  track.dataset.wired = '1';

  let offset = 0;
  let lastY = scrollY;
  let boost = 0;
  let last = performance.now();
  let visible = false;
  let raf = 0;
  // the track holds the list twice; one copy's width is the loop length
  const loopWidth = () => track.scrollWidth / 2;

  const step = (now: number) => {
    raf = 0;
    if (!document.body.contains(track)) return;
    const dt = Math.min(64, now - last);
    last = now;
    const dy = scrollY - lastY;
    lastY = scrollY;
    boost += (dy * 0.9 - boost) * 0.12; // scrolling pushes the band along
    offset += (0.05 + Math.abs(boost) * 0.02) * dt * (boost < -1 ? -1 : 1);
    const w = loopWidth();
    if (w > 0) offset = ((offset % w) + w) % w;
    track.style.transform = `translate3d(${-offset}px, 0, 0) skewX(${Math.max(-10, Math.min(10, -boost * 0.25))}deg)`;
    if (visible) raf = requestAnimationFrame(step);
  };

  new IntersectionObserver((entries) => {
    visible = entries[entries.length - 1].isIntersecting;
    if (visible && !raf) {
      last = performance.now();
      lastY = scrollY;
      raf = requestAnimationFrame(step);
    }
  }).observe(track);
}

/* ---------------- global, delegated pointer effects ---------------- */

export function initFxGlobal(): void {
  if (prefersReducedMotion() || isCoarsePointer()) return;

  // magnetic buttons: the button leans toward the cursor while hovered
  let magnet: HTMLElement | null = null;
  const release = () => {
    if (!magnet) return;
    magnet.style.removeProperty('--mag-x');
    magnet.style.removeProperty('--mag-y');
    magnet = null;
  };
  document.addEventListener(
    'pointermove',
    (e) => {
      const el = (e.target as Element | null)?.closest?.('.cybtn, [data-magnetic]');
      if (!(el instanceof HTMLElement)) {
        release();
        return;
      }
      if (magnet && magnet !== el) release();
      magnet = el;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mag-x', `${((e.clientX - (r.left + r.width / 2)) * 0.22).toFixed(1)}px`);
      el.style.setProperty('--mag-y', `${((e.clientY - (r.top + r.height / 2)) * 0.3).toFixed(1)}px`);
    },
    { passive: true }
  );
  document.addEventListener('pointerleave', release);

  // ambient spotlight that trails the cursor behind the content
  let sx = 0;
  let sy = 0;
  let sRaf = 0;
  addEventListener(
    'pointermove',
    (e) => {
      sx = e.clientX;
      sy = e.clientY;
      if (sRaf) return;
      sRaf = requestAnimationFrame(() => {
        sRaf = 0;
        const root = document.documentElement.style;
        root.setProperty('--spot-x', `${sx}px`);
        root.setProperty('--spot-y', `${sy}px`);
      });
    },
    { passive: true }
  );

  // nav links decode themselves on hover
  const scramblers = new WeakMap<HTMLElement, Scramble>();
  document.addEventListener(
    'mouseover',
    (e) => {
      const link = (e.target as Element | null)?.closest?.('[data-scramble]');
      if (!(link instanceof HTMLElement)) return;
      if (link.contains(e.relatedTarget as Node | null)) return; // moving within the link
      const label = (link.dataset.scramble ||= link.textContent ?? '');
      let s = scramblers.get(link);
      if (!s) scramblers.set(link, (s = new Scramble(link)));
      void s.setText(label);
    },
    { passive: true }
  );
}

/* ---------------- per page ---------------- */

export function initFxPage(): void {
  updateScrollProgress();
  if (!prefersReducedMotion()) {
    for (const el of $$('[data-split]')) splitWords(el);
  }
  initShowcase();
  initMarquee();
}
