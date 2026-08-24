import { isCoarsePointer, prefersReducedMotion } from './lib/dom';

/**
 * Custom cursor: instant dot + lerped trailing ring, difference-blended.
 * Auto-disabled on touch devices and reduced motion. Delegated listeners are
 * attached once and survive view transitions.
 */
export function initCursor(): void {
  if (isCoarsePointer() || prefersReducedMotion()) return;

  let dot: HTMLDivElement | null = null;
  let ring: HTMLDivElement | null = null;
  let mx = innerWidth / 2;
  let my = innerHeight / 2;
  let rx = mx;
  let ry = my;
  let raf = 0;

  const ensureNodes = () => {
    if (!document.body.contains(dot)) {
      dot?.remove();
      ring?.remove();
      dot = Object.assign(document.createElement('div'), { className: 'cur-dot' });
      ring = Object.assign(document.createElement('div'), { className: 'cur-ring' });
      document.body.append(dot, ring);
    }
  };

  const loop = () => {
    ensureNodes();
    rx += (mx - rx) * 0.16;
    ry += (my - ry) * 0.16;
    if (dot && ring) {
      dot.style.transform = `translate(${mx}px, ${my}px) translate(-50%, -50%)`;
      ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%)`;
    }
    raf = requestAnimationFrame(loop);
  };

  addEventListener('mousemove', (e) => {
    mx = e.clientX;
    my = e.clientY;
  });

  document.addEventListener(
    'mouseover',
    (e) => {
      const target = e.target as Element | null;
      ring?.classList.toggle(
        'hovered',
        !!target?.closest('a, button, input, [data-cursor]')
      );
    },
    { passive: true }
  );

  // `cursor off` escape hatch fired from the shell
  document.addEventListener('jn:disable-cursor', () => {
    cancelAnimationFrame(raf);
    dot?.remove();
    ring?.remove();
    dot = ring = null;
    document.documentElement.classList.remove('has-cursor');
  });

  document.documentElement.classList.add('has-cursor');
  raf = requestAnimationFrame(loop);
}
