/**
 * Single source of truth for the whole site.
 * Edit this file to make the site yours — nothing else needs touching.
 */

export const site = {
  name: 'Januth Nimnal',
  monogram: 'JN',
  title: 'Januth Nimnal — creative developer',
  description:
    'Januth Nimnal — full-stack developer, creative coder and tinkerer. This portfolio has a real terminal in it. Press ` and type help.',
  /** lowercase fragments cycled with a scramble effect in the hero */
  roles: [
    'a full-stack developer',
    'a creative coder',
    'a tinkerer of pixels & logic',
    'a professional googler',
  ],
  email: 'nimnaljanuth@gmail.com',
  socials: [
    { label: 'github', url: 'https://github.com/januththedev' },
    { label: 'email', url: 'mailto:nimnaljanuth@gmail.com' },
  ],
  /**
   * Live GitHub pulse. Flip useMock to false when you want the projects page
   * to pull your real public repos from the GitHub API.
   */
  github: {
    username: 'januththedev',
    useMock: true,
  },
  /** hand-curated landing-page teasers (GitHub-pulled content intentionally NOT here) */
  curated: [
    {
      kicker: '01',
      title: 'interactive web',
      blurb:
        'Particle fields, shaders, a shell that actually parses — browsers are a playground and I keep breaking in.',
      href: '/projects/',
      cta: 'see experiments',
    },
    {
      kicker: '02',
      title: 'tools & automation',
      blurb:
        'Small, sharp utilities that delete boring work. If I do it twice, it becomes a script.',
      href: '/projects/',
      cta: 'see tools',
    },
    {
      kicker: '03',
      title: 'open source',
      blurb:
        'My commit graph, live from GitHub — stars, languages and whatever I pushed at 2am last night.',
      href: '/projects/',
      cta: 'see the pulse',
    },
  ],
} as const;

export type SiteConfig = typeof site;
