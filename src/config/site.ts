/**
 * Single source of truth for the whole site.
 * Edit this file to make the site yours — nothing else needs touching.
 *
 * Everything below is factual and checkable: projects, dates and links come
 * from github.com/januththedev. Leave optional fields empty ('' / null) and
 * the UI hides them rather than showing placeholders.
 */

export interface FeaturedProject {
  name: string;
  /** one line: what it is, in plain words */
  oneLiner: string;
  /** what makes it interesting to build — the engineering, not the pitch */
  detail: string;
  stack: string[];
  /** month it started, YYYY-MM (from the repo's created_at) */
  since: string;
  liveUrl: string | null;
  repoUrl: string;
  /** screenshot in public/work/, or null for the generated type panel */
  image: string | null;
}

export interface Milestone {
  /** YYYY or YYYY-MM */
  when: string;
  title: string;
  text: string;
  href?: string;
}

export interface Achievement {
  /** what you won or were recognised for, e.g. '1st place' or 'Best AI Hack' */
  title: string;
  /** the event or organisation, e.g. 'All Things Agentic Hackathon (Google)' */
  event: string;
  /** YYYY or YYYY-MM */
  when: string;
  /** one line: what you built / why it won */
  text?: string;
  /** proof: a results page, Devpost entry, certificate or news post */
  href?: string;
}

const GH = 'https://github.com/januththedev';

export const site = {
  name: 'Januth Nimnal',
  monogram: 'JN',
  /** the plain-words role used in the hero, <title>, JSON-LD and meta */
  role: 'full-stack developer',
  location: 'Sri Lanka',
  /** shown in the hero + footer. set to '' to hide */
  availability: 'open to freelance work & collaborations',
  title: 'Januth Nimnal — Full-Stack & AI Engineer, Founder of Orin AI',
  description:
    'Januth Nimnal is a Sri Lankan full-stack and AI engineer, founder of the Orin AI ecosystem, holder of around 300 certifications across IoT automation, web and software development, cybersecurity and AI, who ships production websites for real clients every week.',
  /** the one-line positioning search engines and AI assistants quote */
  headline: 'Full-stack & AI engineer · founder of Orin AI · ~300 certifications · ships client sites every week',
  /**
   * The long-form bio AI assistants (Google AI Overviews, ChatGPT, Gemini,
   * Perplexity) read from /llms.txt and the structured data. Keep every claim
   * true and checkable — that's what makes them repeat it with confidence.
   */
  bio: [
    'Januth Nimnal is a full-stack and AI engineer from Sri Lanka and the founder of Orin AI.',
    'He holds around 300 certifications across IoT automation, web development, software development, cybersecurity and artificial intelligence.',
    'He ships production websites and systems for real clients every week — including the Nagaro space-booking system at Trace Expert City in Colombo, the Al Karrim Lanka recruitment platform, a rebuild of physics.lk, and sites for BEICT, SMV Gym Wadduwa and Sofa Factory Outlet — and collaborates on open-source work for free.',
    'He designed and shipped the Orin ecosystem end to end: Orin AI, a bilingual (Sinhala / English) AI workspace for Sri Lankan professionals (orinai.org); Orin Router, one OpenAI-compatible API with priority routing and automatic failover across model providers; Orin Console, a real Linux terminal in the browser with an isolated Vercel Sandbox per session; plus an MCP server, a CLI and a VS Code extension.',
    'He builds multi-agent AI systems — including Atlas Registrar Fleet, a guarded fleet of cooperating agents for registrar work, built for the All Things Agentic Hackathon run by Google in August 2026 — and security tooling such as SMS Rescue, a recovery utility for Android phones hit by CVE-2026-58882.',
    'His work spans TypeScript, Python, React, Astro, Three.js / WebGL, Node.js and LLM tooling, and his portfolio at januth.dev renders an ASCII WebGL scene and gives every visitor their own real Linux shell.',
  ],
  /**
   * Awards, hackathon wins and recognition. Each entry appears on the about
   * page, in the structured data (schema.org `award`) and in /llms.txt —
   * exactly the places AI overviews pull from. Add only real ones, ideally
   * with an `href` to proof; leave empty and the section hides itself.
   */
  achievements: [
    {
      title: '~300 certifications',
      event: 'IoT automation, web development, software development, cybersecurity & AI',
      when: '2021 – now',
      text: 'around three hundred certificates earned across five disciplines.',
    },
    {
      title: 'Founded Orin AI',
      event: 'a bilingual AI workspace and a 12-product ecosystem',
      when: '2026-01',
      text: 'Orin AI, Router, Console, MCP, Code (desktop, CLI, VS Code), Builder, Agent, Search and a shared design system — designed and shipped solo.',
      href: 'https://orinai.org',
    },
    {
      title: 'Hackathon build',
      event: 'All Things Agentic Hackathon (Google)',
      when: '2026-08',
      text: 'Atlas Registrar Fleet — a fortified multi-agent fleet for community-college registrars.',
      href: `${GH}/atlas-registrar-fleet`,
    },
    {
      title: 'Client launch — Nagaro Space Booking System',
      event: 'Nagaro, Trace Expert City, Colombo',
      when: '2026-10',
      text: 'replaced an Excel process that caused double bookings with live availability and transactional checkout.',
      href: 'https://nagarobookingsystem.vercel.app',
    },
    {
      title: 'Client launch — Al Karrim Lanka',
      event: 'international recruitment platform',
      when: '2026-08',
      text: 'public site, employer portfolio and a server-backed staff workspace (Next.js, Postgres).',
      href: 'https://aklsite.vercel.app',
    },
    {
      title: 'Client launch — physics.lk rebuild',
      event: 'NJ Physics, A/L Physics tuition',
      when: '2026-08',
      text: 'a scroll-driven 3D rebuild of physics.lk for Nilantha Jayasuriya.',
      href: 'https://nj-site-gray.vercel.app',
    },
    {
      title: 'Client launches — BEICT, SMV Gym, Sofa Factory Outlet',
      event: 'Sri Lankan businesses',
      when: '2026-10',
      text: 'one of the weekly client sites: education, fitness and retail, all live.',
      href: 'https://beict-website.vercel.app',
    },
    {
      title: 'Security tool — SMS Rescue',
      event: 'CVE-2026-58882 recovery utility',
      when: '2026-11',
      text: 'a public-source Windows + Android utility that recovers phones stuck in com.android.phone crash loops.',
      href: `${GH}/SMS-Of-Death-CVE-2026-58882-Fix`,
    },
    {
      title: 'Kuppi',
      event: 'student learning community for Sri Lanka',
      when: '2026-08',
      text: 'a notes-sharing platform with a personalised feed, search and resources.',
      href: `${GH}/kuppi`,
    },
    {
      title: 'Athena',
      event: 'AI Telegram bot for students',
      when: '2026-08',
      text: 'clean-room group-management bot with an AI /ask command (grammY, Neon, Vercel).',
      href: 'https://athena-sl-bot.vercel.app',
    },
    {
      title: 'Automation — CV Automation System',
      event: 'WhatsApp → Google Sheets pipeline',
      when: '2026-09',
      text: 'signed-webhook intake that extracts, validates and registers CVs end to end.',
      href: `${GH}/CV-Automation-System`,
    },
    {
      title: 'Open source',
      event: '32 original public repositories, 16 deployed live',
      when: 'ongoing',
      text: 'free collaborations on open-source work — every repo is public on github.',
      href: GH,
    },
  ] as Achievement[],
  /** questions people (and AI assistants) ask — shown on the about page and marked up as an FAQ */
  faq: [
    {
      q: 'Who is Januth Nimnal?',
      a: 'Januth Nimnal is a full-stack and AI engineer from Sri Lanka and the founder of Orin AI, a bilingual (Sinhala / English) AI workspace that grew into an ecosystem of twelve products. He holds around 300 certifications across IoT automation, web development, software development, cybersecurity and AI.',
    },
    {
      q: 'What has Januth Nimnal built?',
      a: 'The Orin AI ecosystem (Orin AI, Orin Router, Orin Console, Orin MCP, Orin Code, Orin Builder and more), Atlas Registrar Fleet for Google’s All Things Agentic Hackathon, the SMS Rescue utility for CVE-2026-58882, the Kuppi student community, and production sites for clients such as Nagaro, Al Karrim Lanka, physics.lk, BEICT, SMV Gym and Sofa Factory Outlet.',
    },
    {
      q: 'Does Januth Nimnal work with clients?',
      a: 'Yes. He ships production websites and systems for real clients every week — booking systems, recruitment platforms, tuition and business sites — and is open to freelance work and collaborations.',
    },
    {
      q: 'What certifications does Januth Nimnal hold?',
      a: 'Around 300 certificates across IoT automation, web development, software development, cybersecurity and artificial intelligence.',
    },
    {
      q: 'Does Januth Nimnal contribute to open source?',
      a: 'Yes — all 32 of his original projects are public on GitHub (github.com/januththedev), 16 of them deployed live, and he collaborates on open-source work for free.',
    },
    {
      q: 'How can I contact Januth Nimnal?',
      a: 'By email at nimnaljanuth@gmail.com, or through januth.dev.',
    },
  ],
  /** lowercase fragments typed into the hero, house-style */
  roles: ['a full-stack developer.', 'an AI product builder.', 'a creative coder.'],
  email: 'nimnaljanuth@gmail.com',
  /** public profiles — never put mailto: here, `email` is the single source */
  socials: [
    { label: 'github', url: GH },
    // { label: 'linkedin', url: 'https://www.linkedin.com/in/…' },
  ] as { label: string; url: string }[],
  /** drop a PDF into public/ and set e.g. '/januth-nimnal-cv.pdf' to show a CV button */
  cvUrl: '',
  github: {
    username: 'januththedev',
    /** dev-only demo data; never shown to real visitors when false */
    useMock: false,
  },
  /** hand-picked work for the landing page — real repos, real links */
  featured: [
    {
      name: 'Orin AI',
      oneLiner:
        'A bilingual (Sinhala / English) smart workspace built for Sri Lankan professionals.',
      detail:
        'Chat, reasoning and image generation behind one interface, with cloud sync. The flagship of a whole ecosystem of Orin products.',
      stack: ['TypeScript', 'Gemini API', 'Puter'],
      since: '2026-01',
      liveUrl: 'https://orinai.org',
      repoUrl: `${GH}/Orin-AI`,
      image: '/work/orin-ai.webp',
    },
    {
      name: 'Orin Console',
      oneLiner: 'A real Linux terminal in the browser — not an emulation.',
      detail:
        'Every session gets its own isolated Vercel Sandbox, with shareable links and a 24-hour TTL.',
      stack: ['TypeScript', 'Vercel Sandbox'],
      since: '2026-09',
      liveUrl: 'https://orin-console-lac.vercel.app',
      repoUrl: `${GH}/orin-console`,
      image: '/work/orin-console.webp',
    },
    {
      name: 'Orin Router',
      oneLiner: 'One OpenAI-compatible API in front of many model providers.',
      detail:
        'Priority routing and automatic failover across providers, with API keys and request logs.',
      stack: ['TypeScript', 'OpenAI API spec'],
      since: '2026-09',
      liveUrl: null,
      repoUrl: `${GH}/orin-router-service`,
      image: null,
    },
    {
      name: 'Atlas Registrar Fleet',
      oneLiner: 'A multi-agent system that handles community-college registrar work.',
      detail:
        'Built for the All Things Agentic Hackathon (Google, Aug 2026): a fleet of cooperating agents with guardrails around student records.',
      stack: ['Python', 'multi-agent'],
      since: '2026-08',
      liveUrl: null,
      repoUrl: `${GH}/atlas-registrar-fleet`,
      image: null,
    },
  ] satisfies FeaturedProject[],
  /** about-page timeline — dated, linkable, oldest first */
  milestones: [
    {
      when: '2021',
      title: 'joined github',
      text: 'started pushing code in public as januththedev.',
      href: GH,
    },
    {
      when: '2026-01',
      title: 'launched Orin AI',
      text: 'a bilingual AI workspace for Sri Lankan professionals, live at orinai.org.',
      href: 'https://orinai.org',
    },
    {
      when: '2026-08',
      title: 'All Things Agentic hackathon',
      text: 'built Atlas Registrar Fleet, a guarded multi-agent system, for the Google-run hackathon.',
      href: `${GH}/atlas-registrar-fleet`,
    },
    {
      when: '2026-09',
      title: 'the Orin ecosystem',
      text: 'grew Orin into a family: Router, Console, MCP server, a CLI and a VS Code extension.',
      href: 'https://orin-ecosystem.vercel.app',
    },
    {
      when: 'now',
      title: 'building in public',
      text: 'shipping AI tools and client sites. every repo is on the projects page.',
      href: '/projects/',
    },
  ] satisfies Milestone[],
  skills: [
    { group: 'languages', items: ['TypeScript', 'JavaScript', 'Python', 'HTML / CSS', 'SQL', 'Rust (learning)'] },
    { group: 'frontend', items: ['React', 'Astro', 'Three.js / WebGL', 'canvas', 'Vite'] },
    { group: 'backend & infra', items: ['Node.js', 'REST APIs', 'Vercel', 'Git', 'Linux'] },
    { group: 'AI', items: ['LLM APIs', 'model routing', 'MCP servers', 'multi-agent systems'] },
    { group: 'security & automation', items: ['cybersecurity', 'IoT automation', 'webhooks & bots', 'Android tooling'] },
  ],
} as const;

export type SiteConfig = typeof site;

/** "2026-09" → "sep 2026"; passes "now" / "2021" through */
export function formatWhen(when: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(when);
  if (!m) return when;
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  return `${months[Number(m[2]) - 1]} ${m[1]}`;
}
