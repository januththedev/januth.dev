import { isCoarsePointer, prefersReducedMotion } from './lib/dom';

/**
 * Custom cursor: instant dot + lerped trailing ring, difference-blended.
 * Auto-disabled on touch devices and reduced motion. Delegated listeners are
 * attached once and survive view transitions.
 *
 * The native cursor is only hidden once the mouse has actually moved, so
 * keyboard-only visitors are never left without one. The loop sleeps when the
 * ring has caught up with the pointer.
 */

let active = false;
let ensure: (() => void) | null = null;

/** router swaps wipe <html> classes and <body> children — put the cursor back */
export function reapplyCursor(): void {
  if (!active) return;
  document.documentElement.classList.add('has-cursor');
  ensure?.();
}

export function initCursor(): void {
  if (isCoarsePointer() || prefersReducedMotion()) return;

  let dot: HTMLDivElement | null = null;
  let ring: HTMLDivElement | null = null;
  let mx = innerWidth / 2;
  let my = innerHeight / 2;
  let rx = mx;
  let ry = my;
  let raf = 0;
  let disabled = false;

  const ensureNodes = () => {
    if (dot && document.body.contains(dot)) return;
    dot?.remove();
    ring?.remove();
    dot = Object.assign(document.createElement('div'), { className: 'cur-dot' });
    ring = Object.assign(document.createElement('div'), { className: 'cur-ring' });
    dot.setAttribute('aria-hidden', 'true');
    ring.setAttribute('aria-hidden', 'true');
    document.body.append(dot, ring);
    paint();
  };

  const paint = () => {
    if (!dot || !ring) return;
    dot.style.transform = `translate(${mx}px, ${my}px) translate(-50%, -50%)`;
    ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%)`;
  };

  const loop = () => {
    raf = 0;
    rx += (mx - rx) * 0.16;
    ry += (my - ry) * 0.16;
    paint();
    // sleep once the ring has converged; mousemove wakes it
    if (Math.abs(mx - rx) + Math.abs(my - ry) > 0.1) raf = requestAnimationFrame(loop);
  };

  addEventListener(
    'mousemove',
    (e) => {
      if (disabled) return;
      mx = e.clientX;
      my = e.clientY;
      if (!active) {
        // first real mouse movement: now it is safe to hide the native cursor
        active = true;
        rx = mx;
        ry = my;
        document.documentElement.classList.add('has-cursor');
      }
      ensureNodes();
      if (!raf) raf = requestAnimationFrame(loop);
    },
    { passive: true }
  );

  document.addEventListener(
    'mouseover',
    (e) => {
      const target = e.target as Element | null;
      ring?.classList.toggle('hovered', !!target?.closest('a, button, input, [data-cursor]'));
    },
    { passive: true }
  );

  // the pointer left the window — don't leave a ghost dot parked on the page
  document.addEventListener('mouseleave', () => {
    dot?.classList.add('away');
    ring?.classList.add('away');
  });
  document.addEventListener('mouseenter', () => {
    dot?.classList.remove('away');
    ring?.classList.remove('away');
  });

  ensure = ensureNodes;

  // `cursor off` / `cursor on` from the shell
  document.addEventListener('jn:disable-cursor', () => {
    disabled = true;
    active = false;
    cancelAnimationFrame(raf);
    raf = 0;
    dot?.remove();
    ring?.remove();
    dot = ring = null;
    document.documentElement.classList.remove('has-cursor');
  });
  document.addEventListener('jn:enable-cursor', () => {
    disabled = false;
  });
}
