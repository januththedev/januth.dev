import { safeStorage } from '../lib/dom';

/**
 * Browser side of the real Linux shell (see src/lib/shell/server.ts).
 *
 * Holds the signed session token (sessionStorage, so the same machine follows
 * the visitor across pages), sends commands, and keeps the machine booted with
 * a heartbeat while the terminal is open. If the API is missing, unconfigured
 * or unreachable, `available` goes false and the terminal falls back to its
 * built-in virtual shell.
 */

const TOKEN_KEY = 'jn:linux';
const HEARTBEAT_MS = 2 * 60_000;

export interface RemoteRun {
  stdout: string;
  stderr: string;
  exitCode: number;
  cwd: string;
}

export interface RemoteState {
  status: 'idle' | 'connecting' | 'online' | 'offline';
  system: string;
  cwd: string;
  /** why we're offline, for the one-line notice */
  reason: string;
}

export const remote: RemoteState = { status: 'idle', system: '', cwd: '~', reason: '' };

let token = safeStorage(() => sessionStorage.getItem(TOKEN_KEY), null);
let connecting: Promise<boolean> | null = null;
let beat = 0;

class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

async function call<T>(body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch('/api/shell/', { // trailing slash: the site uses trailingSlash 'always'
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'network', 'network unreachable');
  }
  const type = res.headers.get('content-type') ?? '';
  // a static host answers with a 404 page: there is no API on this deployment
  if (!type.includes('application/json')) throw new ApiError(res.status, 'no_api', 'no shell API on this deployment');
  const data = (await res.json()) as T & { error?: string; message?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'error', data.message ?? `HTTP ${res.status}`);
  return data;
}

function saveToken(t: string | null): void {
  token = t;
  safeStorage(() => (t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY)), undefined);
}

/** boot (or resume) this visitor's machine; resolves true when online */
export function connect(): Promise<boolean> {
  if (remote.status === 'online') return Promise.resolve(true);
  return (connecting ??= (async () => {
    remote.status = 'connecting';
    try {
      const r = await call<{ token: string; system: string; cwd: string }>({ action: 'boot', token });
      saveToken(r.token);
      remote.status = 'online';
      remote.system = r.system;
      remote.cwd = r.cwd || '~';
      return true;
    } catch (e) {
      const err = e as ApiError;
      remote.status = 'offline';
      remote.reason =
        err.code === 'busy' || err.code === 'slow_down' ? err.message
        : err.code === 'not_configured' || err.code === 'no_api' ? 'the Linux machine isn’t enabled on this deployment'
        : 'the Linux machine is unreachable right now';
      return false;
    } finally {
      connecting = null;
    }
  })());
}

/** run one line on the machine; reboots transparently once if the machine was recycled */
export async function exec(line: string, signal?: AbortSignal): Promise<RemoteRun> {
  const attempt = () => call<RemoteRun>({ action: 'run', token, cmd: line, cwd: remote.cwd }, signal);
  try {
    const r = await attempt();
    remote.cwd = r.cwd || remote.cwd;
    return r;
  } catch (e) {
    const err = e as ApiError;
    if (err.code === 'expired' || err.code === 'gone') {
      saveToken(null);
      remote.status = 'idle';
      if (await connect()) {
        const r = await attempt();
        remote.cwd = r.cwd || remote.cwd;
        return { ...r, stderr: `(your machine had gone to sleep — booted a fresh one)\n${r.stderr}`.trimEnd() };
      }
    }
    throw err;
  }
}

export async function completeRemote(word: string, command: boolean): Promise<string[]> {
  if (remote.status !== 'online') return [];
  try {
    const r = await call<{ options: string[] }>({ action: 'complete', token, word, cwd: remote.cwd, command }, AbortSignal.timeout(6000));
    return r.options;
  } catch {
    return [];
  }
}

/** keep the machine booted while the terminal is open */
export function startHeartbeat(): void {
  if (beat) return;
  beat = window.setInterval(() => {
    if (document.hidden || remote.status !== 'online') return;
    call({ action: 'heartbeat', token }).catch((e: ApiError) => {
      if (e.code === 'expired' || e.code === 'gone') {
        saveToken(null);
        remote.status = 'idle';
      }
    });
  }, HEARTBEAT_MS);
}

export function stopHeartbeat(): void {
  clearInterval(beat);
  beat = 0;
}

/* ---------------- output helpers ---------------- */

export interface OscAction {
  action: string;
  arg: string;
}

/** pull out the site's OSC 7331 actions and strip every other escape sequence */
export function cleanOutput(text: string): { text: string; actions: OscAction[] } {
  const actions: OscAction[] = [];
  const withoutJn = text.replace(/\u001b\]7331;jn;([^;\u0007]*);([^\u0007]*)\u0007/g, (_, action: string, arg: string) => {
    actions.push({ action, arg });
    return '';
  });
  const clean = withoutJn
    .replace(/\u001b\][^\u0007\u001b]*(\u0007|\u001b\\)/g, '') // other OSC
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '') // CSI (colours, cursor moves)
    .replace(/\u001b[()][A-Z0-9]/g, '')
    .replace(/\r(?!\n)/g, '');
  return { text: clean, actions };
}
