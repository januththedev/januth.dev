import { site } from '../../config/site';
import { softNavigate } from '../lib/dom';
import type { VDir, VFile } from './vfs';
import { getNode, resolvePath } from './vfs';

/**
 * Command registry for the JN shell.
 *
 * Commands return a string (printed by the UI) or undefined when they handle
 * their own output/side effects. Piped commands receive the previous stage's
 * stdout via ctx.pipeIn. Hidden commands don't appear in `help`.
 */

export interface ShellCtx {
  cwd: () => string;
  setCwd: (path: string) => void;
  getFs: () => VDir;
  /** stdout of the previous command in a pipeline */
  pipeIn: string | null;
  clear: () => void;
  history: () => readonly string[];
}

export interface Command {
  desc: string;
  usage?: string;
  hidden?: boolean;
  run(args: string[], ctx: ShellCtx): Promise<string | void> | string | void;
}

const err = (msg: string): string => `\u0000ERR${msg}`;

function readTarget(ctx: ShellCtx, pathArg?: string): { node: VFile | VDir; path: string } | string {
  const path = resolvePath(ctx.cwd(), pathArg);
  if (!path) return err(`no such file or directory: ${pathArg ?? ''}`);
  const node = getNode(ctx.getFs(), path);
  if (!node) return err(`no such file or directory: ${pathArg ?? path}`);
  return { node, path };
}

const pad = (s: string, n: number): string => s + ' '.repeat(Math.max(0, n - s.length));

export const commands: Record<string, Command> = {
  help: {
    desc: 'list every verb this shell admits',
    usage: 'help [command]',
    run(args) {
      const name = args[0];
      if (name && Object.hasOwn(commands, name) && !commands[name].hidden) {
        const c = commands[name];
        return `${pad(c.usage ?? name, 24)}${c.desc}`;
      }
      const visible = Object.entries(commands).filter(([, c]) => !c.hidden);
      const width = Math.max(...visible.map(([n]) => n.length)) + 3;
      return [
        'jn-shell — a real little shell living in a portfolio',
        '',
        ...visible.map(([n, c]) => `  ${pad(n, width)}${c.desc}`),
        '',
        "some verbs keep themselves hidden. curious fingers win.",
      ].join('\n');
    },
  },

  ls: {
    desc: 'list directory contents (-a reveals secrets)',
    usage: 'ls [-a] [path]',
    run(args, ctx) {
      const showHidden = args.includes('-a');
      const pathArg = args.find((a) => !a.startsWith('-'));
      const res = readTarget(ctx, pathArg);
      if (typeof res === 'string') return res;
      const { node, path } = res;
      if (node.type === 'file') return path.split('/').pop() ?? '';
      const entries = Object.entries(node.children)
        .filter(([name, child]) => showHidden || !(child.hidden || name.startsWith('.')))
        .map(([name, child]) => (child.type === 'dir' ? `${name}/` : name));
      return entries.sort().join('\n') || '(empty)';
    },
  },

  cd: {
    desc: 'change directory',
    usage: 'cd <path>',
    run(args, ctx) {
      const res = readTarget(ctx, args[0] ?? '~');
      if (typeof res === 'string') return res;
      if (res.node.type !== 'dir') return err(`not a directory: ${args[0]}`);
      ctx.setCwd(res.path);
      return;
    },
  },

  pwd: {
    desc: 'print working directory',
    run(_args, ctx) {
      return ctx.cwd();
    },
  },

  cat: {
    desc: 'print a file',
    usage: 'cat <file>',
    run(args, ctx) {
      if (!args.length) return err('usage: cat <file>');
      const res = readTarget(ctx, args[0]);
      if (typeof res === 'string') return res;
      return res.node.type === 'file' ? res.node.content : err(`${args[0]} is a directory`);
    },
  },

  open: {
    desc: 'open a page, file or url',
    usage: 'open <projects|about|home|github|url>',
    run(args) {
      const target = args[0];
      if (!target) return err('usage: open <target> — try: open projects');
      switch (target.toLowerCase()) {
        case 'home':
        case 'index':
          softNavigate('/');
          return `navigating → home`;
        case 'projects':
        case 'repos':
          softNavigate('/projects/');
          return `navigating → projects`;
        case 'about':
          softNavigate('/about/');
          return `navigating → about`;
        case 'github':
          window.open(site.socials[0].url, '_blank', 'noopener');
          return `opening ${site.socials[0].url} ↗`;
        case 'email':
        case 'mail':
          location.href = `mailto:${site.email}`;
          return 'composing…';
        default:
          if (/^https?:\/\//i.test(target)) {
            window.open(target, '_blank', 'noopener');
            return `opening ${target} ↗`;
          }
          return err(
            `unknown destination: ${target} — try home, projects, about, github or a full url`
          );
      }
    },
  },

  whoami: {
    desc: 'who runs this place',
    run() {
      return `${site.name.toLowerCase()} — ${site.role}, ${site.location.toLowerCase()}.\nbuilds AI products, developer tools and sites like this one.`;
    },
  },

  contact: {
    desc: 'ways to reach me',
    run() {
      return [
        `${pad('email', 10)}${site.email}`,
        ...site.socials.map((s) => `${pad(s.label, 10)}${s.url}`),
        ...(site.availability ? ['', site.availability + '. try: sudo hire-me'] : []),
      ].join('\n');
    },
  },

  repos: {
    desc: 'live repo table from github',
    usage: 'repos [--lang <language>]',
    async run(args) {
      const { getRepos } = await import('../github');
      const langIdx = args.indexOf('--lang');
      if (langIdx >= 0 && !args[langIdx + 1]) return err('usage: repos --lang <language>  (e.g. repos --lang ts)');
      const alias: Record<string, string> = { ts: 'typescript', js: 'javascript', py: 'python', rs: 'rust', kt: 'kotlin' };
      const raw = langIdx >= 0 ? args[langIdx + 1].toLowerCase() : null;
      const langFilter = raw ? (Object.hasOwn(alias, raw) ? alias[raw] : raw) : null;
      const { repos, source } = await getRepos();
      if (!repos.length) {
        return source === 'error'
          ? err(`couldn't reach github right now — see ${site.socials[0].url}`)
          : 'no public repos yet.';
      }
      const list = langFilter
        ? repos.filter((r) => (r.language ?? '').toLowerCase() === langFilter)
        : repos;
      if (!list.length) return `no repos matching ${langFilter}.`;
      return [
        pad('REPO', 22) + pad('LANG', 13) + pad('★', 6) + 'DESCRIPTION',
        ...list.map((r) =>
          pad(r.name.slice(0, 20), 22) +
          pad((r.language ?? '—').slice(0, 12), 13) +
          pad(String(r.stargazers_count), 6) +
          (r.description ?? '')
        ),
      ].join('\n');
    },
  },

  theme: {
    desc: 'reskin the whole site',
    usage: 'theme [name]',
    run(args) {
      const known = ['dark', 'paper'];
      if (!args.length) {
        return `available: ${known.join(', ')}\nsome themes are shy. they hide until discovered.`;
      }
      const name = args[0].toLowerCase();
      document.dispatchEvent(new CustomEvent('jn:set-theme', { detail: name }));
      return known.includes(name)
        ? `theme → ${name}`
        : `attempting "${name}"… if nothing happens, it doesn't exist. or does it.`;
    },
  },

  cursor: {
    desc: 'toggle the custom cursor',
    usage: 'cursor <on|off>',
    run(args) {
      const mode = args[0]?.toLowerCase();
      if (mode !== 'on' && mode !== 'off') return err('usage: cursor <on|off>');
      document.dispatchEvent(new CustomEvent(mode === 'off' ? 'jn:disable-cursor' : 'jn:enable-cursor'));
      return mode === 'off' ? 'native cursor restored.' : 'custom cursor back — move the mouse.';
    },
  },

  echo: {
    desc: 'you know what this does',
    usage: 'echo <text>',
    run(args) {
      return args.join(' ');
    },
  },

  date: {
    desc: 'current date & time',
    run() {
      return new Date().toString();
    },
  },

  history: {
    desc: 'recent commands',
    run(_args, ctx) {
      const h = ctx.history();
      return h.length ? h.map((line, i) => `${pad(String(i + 1), 5)}${line}`).join('\n') : '(blank slate)';
    },
  },

  grep: {
    desc: 'filter lines (use in a pipe)',
    usage: '<cmd> | grep [-i] <pattern>',
    run(args, ctx) {
      if (ctx.pipeIn == null) return err('grep needs an upstream pipe — try: cat skills.txt | grep typescript');
      const ignoreCase = args.includes('-i');
      const pattern = args.find((a) => !a.startsWith('-'));
      if (!pattern) return err('usage: … | grep [-i] pattern');
      let re: RegExp;
      try {
        re = new RegExp(pattern, ignoreCase ? 'i' : '');
      } catch {
        return err(`grep: invalid pattern: ${pattern}`);
      }
      return ctx.pipeIn.split('\n').filter((l) => re.test(l)).join('\n') || '(no matches)';
    },
  },

  wc: {
    desc: 'count lines/words/chars (pipe)',
    usage: '<cmd> | wc',
    run(_args, ctx) {
      if (ctx.pipeIn == null) return err('wc needs an upstream pipe');
      const text = ctx.pipeIn;
      return `lines ${text.split('\n').length}\nwords ${text.split(/\s+/).filter(Boolean).length}\nchars ${text.length}`;
    },
  },

  clear: {
    desc: 'wipe the scrollback',
    run(_args, ctx) {
      ctx.clear();
      return;
    },
  },

  exit: {
    desc: 'close the terminal',
    run() {
      document.dispatchEvent(new CustomEvent('jn:close-term'));
      return;
    },
  },

  sudo: {
    desc: 'elevate (results may vary)',
    usage: 'sudo <anything>',
    run(args) {
      const joined = args.join(' ').toLowerCase();
      if (joined.includes('hire-me') || joined.includes('hire me')) {
        location.href = `mailto:${site.email}?subject=let%27s%20build%20something`;
        return 'excellent decision. opening a hiring channel…';
      }
      return "januth is not in the sudoers file. this incident will be reported (to absolutely no one).";
    },
  },

  rm: {
    desc: 'remove (good luck)',
    hidden: true,
    run(args) {
      const joined = args.join(' ');
      if (/-rf?\s+[/~]/.test(joined))
        return 'nice try. this filesystem is imaginary and immortal.';
      return err('rm: permission denied (this fs bites back)');
    },
  },

  neofetch: {
    desc: '',
    hidden: true,
    run() {
      const ua = navigator.userAgent;
      const browser =
        /Edg\//.test(ua) ? 'edge' :
        /Chrome\//.test(ua) ? 'chrome' :
        /Firefox\//.test(ua) ? 'firefox' :
        /Safari\//.test(ua) ? 'safari' : 'something obscure';
      const uptimeS = Math.floor(performance.now() / 1000);
      return [
        '   ██╗███╗   ██╗    jn@portfolio',
        '   ██║████╗  ██║    ---------------',
        '   ██║██╔██╗ ██║    os       your ' + browser + ', obviously',
        '██╗ ██║██║╚██╗██║    shell    jn-shell v1.0 (hand-rolled)',
        '╚████╔╝██║ ╚████║    uptime   ' + uptimeS + 's on this page',
        ' ╚═══╝ ╚═╝  ╚═══╝    themes   dark · paper · ??? · ???',
        '                     ui       zero frameworks were harmed',
      ].join('\n');
    },
  },

  matrix: {
    desc: '',
    hidden: true,
    run() {
      document.dispatchEvent(new CustomEvent('jn:set-theme', { detail: 'matrix' }));
      return 'wake up, visitor… follow the green cursor.';
    },
  },

  vaporwave: {
    desc: '',
    hidden: true,
    run() {
      document.dispatchEvent(new CustomEvent('jn:set-theme', { detail: 'vaporwave' }));
      return 'ａｅｓｔｈｅｔｉｃ unlocked. enjoy the sunset.';
    },
  },

  konami: {
    desc: '',
    hidden: true,
    run() {
      return '↑ ↑ ↓ ↓ ← → ← → B A\nthat is all you need to know.';
    },
  },
};

/** command names for tab-completion and suggestions */
export function commandNames(includeHidden = false): string[] {
  return Object.keys(commands).filter((n) => includeHidden || !commands[n].hidden);
}
