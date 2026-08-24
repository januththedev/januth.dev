import { $, clamp, rand } from './lib/dom';

/**
 * 404 mini-game: catch falling particles with a paddle.
 * Mouse / touch / arrow keys. Three lives. Trails via translucent clear.
 */

interface Droplet {
  x: number;
  y: number;
  vy: number;
  r: number;
  hue: number;
}

export function initGame404(): () => void {
  const canvas = $<HTMLCanvasElement>('#game-canvas');
  const scoreEl = $('#game-score');
  const livesEl = $('#game-lives');
  const restartBtn = $('#game-restart');
  if (!canvas) return () => {};

  const ctx = canvas.getContext('2d')!;
  const W = canvas.width;
  const H = canvas.height;

  const PADDLE_W = 96;
  const PADDLE_H = 10;
  const PADDLE_Y = H - 28;

  let paddleX = W / 2;
  let targetX = W / 2;
  let keys = { left: false, right: false };
  let drops: Droplet[] = [];
  let score = 0;
  let lives = 3;
  let playing = false;
  let spawnTimer = 0;
  let lastT = performance.now();
  let rafId = 0;
  let stopped = false;

  const hud = () => {
    if (scoreEl) scoreEl.textContent = String(score);
    if (livesEl) livesEl.textContent = '♥'.repeat(Math.max(0, lives)) + '·'.repeat(3 - Math.max(0, lives));
  };

  const reset = () => {
    drops = [];
    score = 0;
    lives = 3;
    playing = true;
    spawnTimer = 0;
    hud();
  };

  const spawn = () => {
    drops.push({
      x: rand(16, W - 16),
      y: -12,
      vy: rand(90, 150) + score * 1.6,
      r: rand(5, 9),
      hue: rand(170, 280),
    });
  };

  const gameOver = () => {
    playing = false;
    ctx.fillStyle = 'rgba(5,5,8,0.72)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ededf2';
    ctx.font = '700 34px "Space Grotesk", sans-serif';
    ctx.fillText('signal lost', W / 2, H / 2 - 14);
    ctx.font = '13px "JetBrains Mono", monospace';
    ctx.fillStyle = '#9a9aa8';
    ctx.fillText(`score ${score} — click or press space to retry`, W / 2, H / 2 + 18);
  };

  const draw = (dtMs: number) => {
    // translucent clear → motion trails
    ctx.fillStyle = 'rgba(5,5,8,0.3)';
    ctx.fillRect(0, 0, W, H);

    if (keys.left) targetX -= 520 * (dtMs / 1000);
    if (keys.right) targetX += 520 * (dtMs / 1000);
    paddleX += (clamp(targetX, PADDLE_W / 2, W - PADDLE_W / 2) - paddleX) * 0.25;

    if (playing) {
      spawnTimer -= dtMs;
      if (spawnTimer <= 0) {
        spawn();
        spawnTimer = Math.max(260, 700 - score * 4);
      }
    }

    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.y += d.vy * (dtMs / 1000);

      const caught =
        playing &&
        d.y + d.r >= PADDLE_Y &&
        d.y - d.r <= PADDLE_Y + PADDLE_H &&
        d.x >= paddleX - PADDLE_W / 2 - d.r &&
        d.x <= paddleX + PADDLE_W / 2 + d.r;

      if (caught) {
        drops.splice(i, 1);
        score += 10;
        hud();
        continue;
      }
      if (d.y - d.r > H) {
        drops.splice(i, 1);
        if (playing) {
          lives--;
          hud();
          if (lives <= 0) gameOver();
        }
        continue;
      }

      ctx.beginPath();
      ctx.fillStyle = `hsl(${d.hue} 90% 60% / 0.9)`;
      ctx.shadowColor = `hsl(${d.hue} 90% 60%)`;
      ctx.shadowBlur = 14;
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // paddle
    const grad = ctx.createLinearGradient(paddleX - PADDLE_W / 2, 0, paddleX + PADDLE_W / 2, 0);
    grad.addColorStop(0, '#22d3ee');
    grad.addColorStop(1, '#8b5cf6');
    ctx.fillStyle = grad;
    ctx.shadowColor = 'rgba(34,211,238,0.6)';
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.roundRect(paddleX - PADDLE_W / 2, PADDLE_Y, PADDLE_W, PADDLE_H, 6);
    ctx.fill();
    ctx.shadowBlur = 0;

    if (!playing && drops.length === 0 && lives <= 0) {
      /* game-over overlay already painted */
    }
  };

  const loop = (now: number) => {
    if (stopped) return;
    rafId = requestAnimationFrame(loop);
    const dtMs = Math.min(50, now - lastT);
    lastT = now;
    draw(dtMs);
  };

  const pointerPos = (clientX: number): number => {
    const rect = canvas.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * W;
  };

  const onPointerMove = (e: PointerEvent) => {
    targetX = pointerPos(e.clientX);
  };
  const onPointerDown = () => {
    if (!playing && lives <= 0) reset();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') keys.left = true;
    if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') keys.right = true;
    if (e.key === ' ' && !playing && lives <= 0) {
      e.preventDefault();
      reset();
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') keys.left = false;
    if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') keys.right = false;
  };
  const onRestartClick = () => reset();

  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerdown', onPointerDown);
  addEventListener('keydown', onKeyDown);
  addEventListener('keyup', onKeyUp);
  restartBtn?.addEventListener('click', onRestartClick);

  hud();
  rafId = requestAnimationFrame((t) => {
    lastT = t;
    loop(t);
  });

  return () => {
    stopped = true;
    cancelAnimationFrame(rafId);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerdown', onPointerDown);
    removeEventListener('keydown', onKeyDown);
    removeEventListener('keyup', onKeyUp);
    restartBtn?.removeEventListener('click', onRestartClick);
  };
}
