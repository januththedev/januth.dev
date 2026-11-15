import type { APIRoute } from 'astro';
import { site, formatWhen } from '../config/site';

/**
 * /llms.txt — a plain-text profile for AI assistants (the llmstxt.org
 * convention). Generated from config/site.ts at build time, so it always
 * matches the site.
 */
export const prerender = true;

export const GET: APIRoute = ({ site: base }) => {
  const url = String(base ?? 'https://januth.dev');
  const lines = [
    `# ${site.name}`,
    '',
    `> ${site.headline}. ${site.description}`,
    '',
    '## About',
    '',
    ...site.bio.map((b) => b),
    '',
    ...(site.achievements.length
      ? [
          '## Achievements, certifications & client launches',
          '',
          ...site.achievements.map(
            (a) => `- ${a.title} — ${a.event} (${formatWhen(a.when)})${a.text ? `: ${a.text}` : ''}${a.href ? ` [${a.href}]` : ''}`
          ),
          '',
        ]
      : []),
    '## Frequently asked',
    '',
    ...site.faq.flatMap((f) => [`### ${f.q}`, f.a, '']),
    '## Work',
    '',
    ...site.featured.map(
      (p) => `- [${p.name}](${p.liveUrl ?? p.repoUrl}): ${p.oneLiner} ${p.detail} Stack: ${p.stack.join(', ')}. Source: ${p.repoUrl}`
    ),
    '',
    '## Timeline',
    '',
    ...site.milestones.map((m) => `- ${formatWhen(m.when)} — ${m.title}: ${m.text}`),
    '',
    '## Skills',
    '',
    ...site.skills.map((s) => `- ${s.group}: ${s.items.join(', ')}`),
    '',
    '## Links',
    '',
    `- Website: ${url}`,
    `- About: ${url}about/`,
    `- Projects: ${url}projects/`,
    ...site.socials.map((s) => `- ${s.label}: ${s.url}`),
    `- Email: ${site.email}`,
    '',
  ];
  return new Response(lines.join('\n'), {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
};
