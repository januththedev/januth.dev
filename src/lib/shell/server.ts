import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Sandbox, type NetworkPolicy } from '@vercel/sandbox';
import { SEED_VERSION, seedFiles } from './seed';

/**
 * The real Linux behind the website's terminal — server side only.
 *
 *   jn-base-<seed>   one persistent machine, seeded once with the site's files
 *                    and the custom commands. Persistent sandboxes snapshot on
 *                    stop and auto-resume, so the base is never rebuilt unless
 *                    the seeded content changes.
 *   jn-v-<random>    each visitor's own fork of the base: boots with every file
 *                    already in place, isolated from everyone else, kept alive
 *                    by the terminal's heartbeat, reaped when it goes quiet.
 *
 * The browser only ever holds a signed token naming its fork. Every command
 * runs through `bash -lc` with the visitor's working directory and exported
 * variables restored, so separate requests feel like one continuous shell.
 */

// ---------------- config ----------------

const BASE = `jn-base-${SEED_VERSION}`;
const SESSION_MS = 12 * 60_000; // a fork lives this long without a heartbeat
const HEARTBEAT_EXTEND_MS = 6 * 60_000;
const MAX_SESSION_MS = 40 * 60_000; // hard cap per fork, regardless of heartbeats
const COMMAND_TIMEOUT_MS = 20_000;
const MAX_OUTPUT = 64 * 1024;
const MAX_COMMAND = 2_000;
const MAX_PER_VISITOR = 2; // live forks per visitor (by hashed IP)
const MAX_LIVE = 25; // live forks overall — the bill has a ceiling

/**
 * Outbound network: package registries and git hosts only. Enough to `pip
 * install`, `npm i` or `git clone`, not enough to be useful to abuse.
 */
const NETWORK: NetworkPolicy = {
  allow: [
    'registry.npmjs.org',
    'pypi.org',
    'files.pythonhosted.org',
    'github.com',
    'codeload.github.com',
    'objects.githubusercontent.com',
    'raw.githubusercontent.com',
    'api.github.com',
  ],
};

/** full-screen / REPL programs need a TTY; say so instead of hanging for 20s */
const INTERACTIVE = new Set([
  'vim', 'vi', 'nvim', 'nano', 'emacs', 'pico', 'top', 'htop', 'btop', 'less', 'more', 'man',
  'ssh', 'tmux', 'screen', 'watch', 'ftp', 'telnet', 'mysql', 'psql', 'sqlite3', 'irb',
]);
const REPLS = new Set(['python', 'python3', 'node', 'bash', 'sh', 'zsh', 'ipython']);

// ---------------- tokens ----------------

export class ShellError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

function secret(): string {
  const s = import.meta.env.SHELL_SECRET ?? process.env.SHELL_SECRET;
  if (!s || s.length < 24) throw new ShellError(503, 'not_configured', 'the Linux shell is not configured on this deployment');
  return s;
}

const b64 = (s: string) => Buffer.from(s).toString('base64url');
const sign = (payload: string) => createHmac('sha256', secret()).update(payload).digest('base64url');

interface TokenData {
  name: string;
  /** when the fork was created (ms) — enforces MAX_SESSION_MS */
  born: number;
}

export function issueToken(data: TokenData): string {
  const payload = b64(JSON.stringify(data));
  return `${payload}.${sign(payload)}`;
}

export function readToken(token: unknown): TokenData | null {
  if (typeof token !== 'string' || token.length > 400) return null;
  const [payload, mac] = token.split('.');
  if (!payload || !mac) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as TokenData;
    if (typeof data.name !== 'string' || !data.name.startsWith('jn-v-') || typeof data.born !== 'number') return null;
    if (Date.now() - data.born > MAX_SESSION_MS) return null;
    return data;
  } catch {
    return null;
  }
}

export const visitorId = (ip: string) =>
  createHash('sha256').update(`${ip}:${secret()}`).digest('hex').slice(0, 16);

// ---------------- the base machine ----------------

let baseReady: Promise<void> | null = null;

async function seed(sbx: Sandbox): Promise<void> {
  const home = (await (await sbx.runCommand('bash', ['-lc', 'printf %s "$HOME"'])).stdout()).trim() || '/home/vercel-sandbox';
  const files = seedFiles();
  const dirs = [...new Set(files.map((f) => f.path.split('/').slice(0, -1).join('/')).filter(Boolean))];
  await sbx.runCommand('bash', ['-lc', `cd ~ && mkdir -p ${dirs.map((d) => `'${d}'`).join(' ')}`]);
  await sbx.writeFiles(files.map((f) => ({ path: `${home}/${f.path}`, content: f.content, mode: f.mode })));
  // make the custom commands win over anything with the same name
  await sbx.runCommand('bash', [
    '-lc',
    `grep -q jn-shell ~/.bashrc 2>/dev/null || printf '\\n# jn-shell\\nexport PATH="$HOME/.local/bin:$PATH"\\n' >> ~/.bashrc`,
  ]);
}

/** make sure the seeded, snapshotted base exists (idempotent, once per instance) */
function ensureBase(): Promise<void> {
  return (baseReady ??= (async () => {
    try {
      await Sandbox.get({ name: BASE });
      return; // exists — persistent, auto-resumes when forked
    } catch {
      /* not found: build it */
    }
    try {
      const base = await Sandbox.create({
        name: BASE,
        persistent: true,
        timeout: 10 * 60_000,
        networkPolicy: NETWORK,
        tags: { app: 'jn', role: 'base' },
      });
      await seed(base);
      await base.stop(); // snapshot: every fork starts from exactly this
    } catch (e) {
      // another instance may have won the race — that's fine if it exists now
      await Sandbox.get({ name: BASE }).catch(() => {
        baseReady = null;
        throw e;
      });
    }
  })());
}

// ---------------- visitor forks ----------------

const cache = new Map<string, Sandbox>();

async function liveForks(tag: Record<string, string>): Promise<{ name: string; createdAt: number }[]> {
  const page = await Sandbox.list({ tags: tag });
  const all = await page.toArray();
  return all
    .filter((s) => s.status === 'running' || s.status === 'pending')
    .map((s) => ({ name: s.name, createdAt: s.createdAt }));
}

export interface BootResult {
  token: string;
  name: string;
  system: string;
  cwd: string;
  resumed: boolean;
}

/** reuse the visitor's machine if it's alive, otherwise fork a fresh one */
export async function boot(existing: unknown, visitor: string): Promise<BootResult> {
  const prior = readToken(existing);
  if (prior) {
    const sbx = await getFork(prior.name).catch(() => null);
    if (sbx && sbx.status === 'running') {
      return { token: issueToken(prior), name: prior.name, system: await describe(sbx), cwd: '~', resumed: true };
    }
  }

  await ensureBase();

  const mine = await liveForks({ visitor });
  if (mine.length >= MAX_PER_VISITOR) {
    // hand back the newest one this visitor already has instead of forking more
    const newest = mine.sort((a, b) => b.createdAt - a.createdAt)[0];
    const sbx = await getFork(newest.name);
    const data = { name: newest.name, born: newest.createdAt };
    return { token: issueToken(data), name: newest.name, system: await describe(sbx), cwd: '~', resumed: true };
  }
  if ((await liveForks({ role: 'visitor' })).length >= MAX_LIVE) {
    throw new ShellError(503, 'busy', 'every machine is busy right now — try again in a few minutes');
  }

  const name = `jn-v-${randomBytes(6).toString('hex')}`;
  const sbx = await Sandbox.fork({
    sourceSandbox: BASE,
    name,
    persistent: false,
    timeout: SESSION_MS,
    networkPolicy: NETWORK,
    tags: { app: 'jn', role: 'visitor', visitor },
  });
  cache.set(name, sbx);
  return { token: issueToken({ name, born: Date.now() }), name, system: await describe(sbx), cwd: '~', resumed: false };
}

async function getFork(name: string): Promise<Sandbox> {
  const hit = cache.get(name);
  if (hit && hit.status === 'running') return hit;
  const sbx = await Sandbox.get({ name });
  cache.set(name, sbx);
  return sbx;
}

async function describe(sbx: Sandbox): Promise<string> {
  const r = await sbx.runCommand('bash', [
    '-lc',
    `. /etc/os-release 2>/dev/null; printf '%s · %s · %s cpu · %s MB' "$(uname -sr)" "\${PRETTY_NAME:-linux}" "$(nproc)" "$(free -m 2>/dev/null | awk '/Mem/{print $2}')"`,
  ]);
  return (await r.stdout()).trim();
}

async function session(token: unknown): Promise<Sandbox> {
  const data = readToken(token);
  if (!data) throw new ShellError(401, 'expired', 'session expired');
  try {
    const sbx = await getFork(data.name);
    if (sbx.status !== 'running') throw new Error('stopped');
    return sbx;
  } catch {
    cache.delete(data.name);
    throw new ShellError(410, 'gone', 'this machine was recycled');
  }
}

// ---------------- commands ----------------

const clip = (s: string) =>
  s.length > MAX_OUTPUT ? `${s.slice(0, MAX_OUTPUT)}\n… output truncated (${Math.round(s.length / 1024)} KB total)` : s;

/** restores cwd + exported vars, runs the line, then records cwd + exit code */
const WRAPPER = `
cd -- "$JN_CWD" 2>/dev/null || cd ~
. ~/.jn_env 2>/dev/null
case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) export PATH="$HOME/.local/bin:$PATH" ;; esac
eval "$JN_CMD"
__jn_ec=$?
export -p | grep -v -e ' JN_' -e ' __jn' -e ' BASHOPTS=' -e ' SHELLOPTS=' -e ' PWD=' -e ' OLDPWD=' > ~/.jn_env 2>/dev/null
printf '\\036%s\\036%s' "$__jn_ec" "$PWD"
`;

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  cwd: string;
}

function guard(cmd: string): string | null {
  const first = cmd.trim().split(/\s+/)[0]?.replace(/^.*\//, '') ?? '';
  const argc = cmd.trim().split(/\s+/).length;
  if (INTERACTIVE.has(first)) {
    return `${first}: needs a full-screen terminal, and this one runs a command at a time. try \`cat\`, \`head\` or \`grep\` instead.`;
  }
  if (REPLS.has(first) && argc === 1) {
    return `${first}: an interactive REPL needs a TTY. run a one-liner instead, e.g. ${first === 'node' ? "node -e 'console.log(1+1)'" : first.startsWith('python') ? `${first} -c 'print(1+1)'` : `${first} -c 'echo hi'`}`;
  }
  return null;
}

export async function run(token: unknown, cmd: unknown, cwd: unknown): Promise<RunResult> {
  if (typeof cmd !== 'string' || !cmd.trim()) throw new ShellError(400, 'bad_request', 'empty command');
  if (cmd.length > MAX_COMMAND) throw new ShellError(413, 'too_long', 'command too long');
  const blocked = guard(cmd);
  const workdir = typeof cwd === 'string' && cwd.length < 512 ? cwd : '~';
  if (blocked) return { stdout: '', stderr: blocked, exitCode: 1, cwd: workdir };

  const sbx = await session(token);
  const abort = AbortSignal.timeout(COMMAND_TIMEOUT_MS);
  let result;
  try {
    result = await sbx.runCommand({
      cmd: 'bash',
      args: ['-lc', WRAPPER],
      env: { JN_CMD: cmd, JN_CWD: workdir === '~' ? '' : workdir, TERM: 'xterm-256color', COLUMNS: '100' },
      signal: abort,
    });
  } catch (e) {
    if (abort.aborted) {
      return { stdout: '', stderr: `timed out after ${COMMAND_TIMEOUT_MS / 1000}s — long-running commands aren't supported here`, exitCode: 124, cwd: workdir };
    }
    throw e;
  }
  const [out, err] = await Promise.all([result.stdout(), result.stderr()]);
  const m = /\u001e(\d+)\u001e([^\u001e]*)$/.exec(out);
  return {
    stdout: clip(m ? out.slice(0, m.index) : out),
    stderr: clip(err),
    exitCode: m ? Number(m[1]) : result.exitCode,
    cwd: m ? m[2] : workdir,
  };
}

/** real tab completion: bash's own compgen, in the visitor's cwd */
export async function complete(token: unknown, word: unknown, cwd: unknown, command: unknown): Promise<string[]> {
  if (typeof word !== 'string' || word.length > 200) return [];
  const sbx = await session(token);
  const mode = command ? '-c' : '-f';
  const r = await sbx.runCommand({
    cmd: 'bash',
    args: ['-lc', `cd -- "$JN_CWD" 2>/dev/null || cd ~; export PATH="$HOME/.local/bin:$PATH"; compgen ${mode} -- "$JN_WORD" | sort -u | head -60; true`],
    env: { JN_WORD: word, JN_CWD: typeof cwd === 'string' && cwd !== '~' ? cwd : '' },
    signal: AbortSignal.timeout(5_000),
  });
  // mark directories so completion can keep going
  const names = (await r.stdout()).split('\n').filter(Boolean);
  if (command) return names;
  const dirs = await sbx.runCommand({
    cmd: 'bash',
    args: ['-lc', `cd -- "$JN_CWD" 2>/dev/null || cd ~; for f in "$@"; do [ -d "$f" ] && echo "$f"; done; true`, '_', ...names],
    env: { JN_CWD: typeof cwd === 'string' && cwd !== '~' ? cwd : '' },
    signal: AbortSignal.timeout(5_000),
  });
  const isDir = new Set((await dirs.stdout()).split('\n').filter(Boolean));
  return names.map((n) => (isDir.has(n) ? `${n}/` : n));
}

/** keep the machine booted while the terminal is open */
export async function heartbeat(token: unknown): Promise<{ ok: true }> {
  const data = readToken(token);
  if (!data) throw new ShellError(401, 'expired', 'session expired');
  const sbx = await session(token);
  const left = MAX_SESSION_MS - (Date.now() - data.born);
  if (left > 60_000) await sbx.extendTimeout(Math.min(HEARTBEAT_EXTEND_MS, left));
  return { ok: true };
}
