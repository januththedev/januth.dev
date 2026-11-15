import type { APIRoute } from 'astro';
import { ShellError, boot, complete, heartbeat, run, visitorId } from '../../lib/shell/server';

/**
 * POST /api/shell — the only door to the real Linux machines.
 * Server-rendered (a Vercel function); the rest of the site stays static.
 *
 *   { action: 'boot',      token? }               → { token, system, cwd, resumed }
 *   { action: 'run',       token, cmd, cwd }       → { stdout, stderr, exitCode, cwd }
 *   { action: 'complete',  token, word, cwd, command } → { options }
 *   { action: 'heartbeat', token }                 → { ok }
 */
export const prerender = false;

// a light per-instance limiter in front of everything else
const hits = new Map<string, number[]>();
function limited(key: string, perMinute: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5_000) hits.clear();
  return recent.length > perMinute;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

export const POST: APIRoute = async ({ request, clientAddress }) => {
  // same-origin only: the shell is for this site's terminal, not an open API
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (origin && host && new URL(origin).host !== host) return json({ error: 'forbidden' }, 403);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  const ip = request.headers.get('x-real-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? clientAddress ?? 'unknown';

  try {
    const visitor = visitorId(ip);
    switch (body.action) {
      case 'boot':
        if (limited(`boot:${visitor}`, 6)) return json({ error: 'slow_down', message: 'too many new sessions — wait a minute' }, 429);
        return json(await boot(body.token, visitor));
      case 'run':
        if (limited(`run:${visitor}`, 90)) return json({ error: 'slow_down', message: 'easy there — too many commands per minute' }, 429);
        return json(await run(body.token, body.cmd, body.cwd));
      case 'complete':
        if (limited(`run:${visitor}`, 90)) return json({ options: [] });
        return json({ options: await complete(body.token, body.word, body.cwd, body.command) });
      case 'heartbeat':
        return json(await heartbeat(body.token));
      default:
        return json({ error: 'bad_request' }, 400);
    }
  } catch (e) {
    if (e instanceof ShellError) return json({ error: e.code, message: e.message }, e.status);
    console.error('[api/shell]', e);
    return json({ error: 'internal', message: 'the machine hiccupped — try again' }, 500);
  }
};

export const GET: APIRoute = () => json({ error: 'method_not_allowed' }, 405);
