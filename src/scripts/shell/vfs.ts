import { site } from '../../config/site';
import { getRepos, type Repo } from '../github';

/**
 * Virtual filesystem that mirrors the site's content — the JN shell operates
 * on this. Directories whose names start with '.' (and the '.secret' dir)
 * are hidden from plain `ls` and need `ls -a`.
 */

export interface VDir {
  type: 'dir';
  hidden?: boolean;
  children: Record<string, VNode>;
}
export interface VFile {
  type: 'file';
  hidden?: boolean;
  content: string;
}
export type VNode = VDir | VFile;

const dir = (children: Record<string, VNode>, hidden = false): VDir => ({ type: 'dir', children, hidden });
const file = (content: string, hidden = false): VFile => ({ type: 'file', content, hidden });

function reposToText(repos: Repo[]): string {
  return repos
    .map((r) => `${r.name}\n  ${r.description}\n  ${r.language ?? 'code'} · ★${r.stargazers_count} · ${r.html_url}`)
    .join('\n\n');
}

function reposToJson(repos: Repo[]): string {
  return JSON.stringify(repos, null, 2);
}

export async function buildFs(): Promise<VDir> {
  let repoBlock = '(loading…)';
  let repoJson = '[]';
  try {
    const { repos } = await getRepos();
    repoBlock = reposToText(repos);
    repoJson = reposToJson(repos);
  } catch {
    repoBlock = 'github unreachable. even the virtual fs has outages.';
  }

  return dir({
    'README.md': file(
      `# ${site.name}\n\nwelcome to the jn filesystem.\neverything you can read here is also on the site —\nthis is just the same place with fewer pixels.\n\ntry: ls -a · cat about.md · open projects · theme paper`
    ),
    'about.md': file(
      `${site.name} — full-stack developer, creative coder, tinkerer.\n\ni think software should feel alive. by day: clean APIs,\nsane data models, interfaces that don't fight back.\nby night: particle systems, in-browser shells, games\nhidden behind 404s.\n\nfull story: open about`
    ),
    'skills.txt': file(
      'languages     typescript javascript python sql (+rust soon)\nfrontend      astro react three.js css wizardry canvas\nbackend       node.js rest apis linux docker basics\nexploring     shaders game dev systems design'
    ),
    'contact.txt': file([...site.socials.map((s) => `${s.label}: ${s.url}`), `email: ${site.email}`].join('\n')),
    projects: dir({
      'repos.txt': file(repoBlock),
      'repos.json': file(repoJson),
    }),
    themes: dir({
      'dark.theme': file('the house style. deep space + cyan/violet. (default)'),
      'paper.theme': file('light, editorial, ink on cream. try: theme paper'),
      'matrix.theme': file('hidden. some doors only open from the inside.'),
    }),
    '.secret': dir(
      {
        'flag.txt': file('you actually looked. konami works everywhere. ↑↑↓↓←→←→BA'),
        'hint.txt': file('the shell knows more verbs than help admits. neofetch? matrix?'),
      },
      true
    ),
  });
}

/** normalize a path against cwd; returns absolute path or null when malformed */
export function resolvePath(cwd: string, input?: string): string | null {
  const raw = input && input.length ? input : '.';
  const base = raw.startsWith('/') ? [] : cwd.split('/').filter(Boolean);
  const parts = raw.startsWith('/') ? raw.slice(1).split('/') : raw.split('/');
  const stack = [...base];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') stack.pop();
    else if (part === '~') {
      stack.length = 0;
    } else stack.push(part);
  }
  return '/' + stack.join('/');
}

export function getNode(root: VDir, path: string): VNode | null {
  if (path === '/' || path === '') return root;
  let node: VNode = root;
  for (const part of path.split('/').filter(Boolean)) {
    if (node.type !== 'dir') return null;
    const next: VNode | undefined = node.children[part];
    if (!next) return null;
    node = next;
  }
  return node;
}

/** list entries for completion: all direct children of a directory path */
export function listDir(root: VDir, path: string): { name: string; isDir: boolean }[] {
  const node = getNode(root, path);
  if (!node || node.type !== 'dir') return [];
  return Object.entries(node.children).map(([name, child]) => ({
    name,
    isDir: child.type === 'dir',
  }));
}
