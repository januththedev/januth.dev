import { createHash } from 'node:crypto';
import { site, formatWhen } from '../../config/site';

/**
 * Everything written onto the base Linux machine: the site as files in the
 * home directory, and the custom commands as real executables in
 * ~/.local/bin. Visitors' machines are forks of that base, so they boot with
 * all of it already there.
 *
 * Commands that act on the browser (theme, open, intro…) print an OSC escape
 * sequence; the web terminal recognises it and performs the action — the same
 * trick real terminals use for hyperlinks and window titles.
 */

const sh = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
/** OSC 7331 ; jn ; <action> ; <arg> BEL — swallowed and acted on by the web terminal */
const osc = (action: string, arg = '') => `printf '\\033]7331;jn;%s;%s\\007' ${sh(action)} "${arg}"`;

function bin(name: string, body: string): { path: string; content: string } {
  return { path: `.local/bin/${name}`, content: `#!/usr/bin/env bash\n# part of januth.dev's shell\n${body}\n` };
}

export interface SeedFile {
  /** relative to $HOME */
  path: string;
  content: string;
  mode?: number;
}

export function seedFiles(): SeedFile[] {
  const files: SeedFile[] = [
    {
      path: 'README.md',
      content: `# ${site.name}

You are on a real Linux machine — your own, forked for this visit.
Break it if you like; nobody else will notice.

  cat about.md           who I am
  ls projects            what I've shipped
  januth                 the business card
  hire-me                open an email to me
  theme paper            reskin the website from here
  open projects          navigate the website
  help                   everything the web shell adds on top

Standard tools are all here: ls, grep, curl, git, python3, node…
`,
    },
    {
      path: 'about.md',
      content: `${site.name} — ${site.role}, ${site.location}.

I build AI products, developer tools and interactive web experiences —
most of them under the Orin name (https://orinai.org).

${site.milestones.map((m) => `  ${formatWhen(m.when).padEnd(10)}${m.title} — ${m.text}`).join('\n')}
`,
    },
    {
      path: 'achievements.md',
      content: `# achievements\n\n${site.achievements
        .map((a) => `- ${formatWhen(a.when).padEnd(12)}${a.title} — ${a.event}${a.text ? `\n${' '.repeat(16)}${a.text}` : ''}${a.href ? `\n${' '.repeat(16)}${a.href}` : ''}`)
        .join('\n')}\n`,
    },
    {
      path: 'skills.txt',
      content: site.skills.map((s) => `${s.group.padEnd(18)}${s.items.join(' · ')}`).join('\n') + '\n',
    },
    {
      path: 'contact.txt',
      content: [`email     ${site.email}`, ...site.socials.map((s) => `${s.label.padEnd(10)}${s.url}`), '', site.availability].join('\n') + '\n',
    },
    ...site.featured.map((p) => ({
      path: `projects/${p.name.toLowerCase().replace(/\s+/g, '-')}.md`,
      content: `# ${p.name}

${p.oneLiner}

${p.detail}

stack   ${p.stack.join(', ')}
since   ${formatWhen(p.since)}
${p.liveUrl ? `live    ${p.liveUrl}\n` : ''}code    ${p.repoUrl}
`,
    })),
    {
      path: '.secret/flag.txt',
      content: 'you found it. ↑ ↑ ↓ ↓ ← → ← → B A works on the website too.\n',
    },
    bin(
      'januth',
      `cat <<'CARD'

   ██╗███╗   ██╗   ${site.name}
   ██║████╗  ██║   ${site.role} · ${site.location}
   ██║██╔██╗ ██║
██╗██║██║╚██╗██║   ${site.email}
╚████╔╝██║ ╚████║   ${site.socials.map((s) => s.url.replace(/^https?:\/\//, '')).join('  ·  ')}
 ╚═══╝ ╚═╝  ╚═══╝   ${site.availability}

CARD`
    ),
    bin('hire-me', `echo "excellent decision — opening a hiring channel…"\n${osc('mail', '')}`),
    bin(
      'theme',
      `case "$1" in
  dark|paper|matrix|vaporwave) ${osc('theme', '$1')}; echo "theme → $1" ;;
  "") echo "usage: theme <dark|paper>   (two more are hidden)"; exit 1 ;;
  *) echo "theme: no such theme: $1" >&2; exit 1 ;;
esac`
    ),
    bin(
      'open',
      `case "$1" in
  home|projects|about|github) ${osc('open', '$1')}; echo "opening → $1" ;;
  http://*|https://*) ${osc('open', '$1')}; echo "opening $1 ↗" ;;
  "") echo "usage: open <home|projects|about|github|url>" >&2; exit 1 ;;
  *) echo "open: unknown destination: $1" >&2; exit 1 ;;
esac`
    ),
    bin('intro', `echo "replaying the intro…"\n${osc('intro', '')}`),
    {
      path: '.jn_motd',
      content: `Welcome. Type \`cat README.md\` to start, or \`help\` for the web shell's extras.\n`,
    },
  ];
  return files.map((f) => ({ ...f, mode: f.path.startsWith('.local/bin/') ? 0o755 : 0o644 }));
}

/** changes whenever the seeded content changes → a fresh base machine is built */
export const SEED_VERSION = createHash('sha256')
  .update(JSON.stringify(seedFiles()))
  .digest('hex')
  .slice(0, 10);
