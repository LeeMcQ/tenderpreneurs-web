# Tenderpreneurs — tenderpreneurs.co.za

AI-powered government tender intelligence for South African SMMEs.

## Tech stack

- **Astro 4** (hybrid output: SSG + SSR)
- **Cloudflare Pages** via `@astrojs/cloudflare` adapter
- **Tailwind CSS** with custom design tokens
- **MDX** for PFMA knowledge base and blog content
- **TypeScript** throughout
- **@astrojs/sitemap**, **@astrojs/rss**, **@astrojs/mdx**

## Local development

### Prerequisites

- Node.js ≥ 18.17.1 (LTS recommended)
- npm ≥ 9

### Install dependencies

```bash
npm install
```

### Start dev server

```bash
npm run dev
```

The dev server starts at `http://localhost:4321`.

### Build for production

```bash
npm run build
```

Output is written to `dist/`. The Cloudflare adapter outputs to `dist/_worker.js` for Worker deployment.

### Preview production build locally

```bash
npm run preview
```

Uses Wrangler under the hood to simulate Cloudflare Workers locally.

---

## Project structure

```
tenderpreneurs/
├── public/                  # Static assets (robots.txt, images, fonts)
├── src/
│   ├── components/          # Reusable Astro components
│   │   ├── SEO.astro        # Meta, OG, Twitter Card, Schema.org
│   │   ├── Header.astro     # Site navigation
│   │   ├── Footer.astro     # Site footer
│   │   ├── HeroSection.astro
│   │   ├── FeatureGrid.astro
│   │   └── PricingCard.astro
│   ├── layouts/
│   │   ├── BaseLayout.astro  # Root layout (skip link, head, slots)
│   │   ├── BlogLayout.astro  # Blog post layout with sidebar
│   │   └── PfmaLayout.astro  # PFMA topic layout with nav sidebar
│   ├── pages/
│   │   ├── index.astro       # Homepage
│   │   ├── about.astro
│   │   ├── pricing.astro
│   │   ├── privacy.astro
│   │   ├── terms.astro
│   │   ├── 404.astro
│   │   ├── pfma/
│   │   │   ├── index.astro   # PFMA hub
│   │   │   └── [slug].astro  # Dynamic PFMA topic pages
│   │   ├── blog/
│   │   │   ├── index.astro   # Blog listing
│   │   │   ├── [slug].astro  # Dynamic blog post pages
│   │   │   └── rss.xml.ts    # RSS feed
│   │   └── tenders/
│   │       └── index.astro   # Phase 2 placeholder (SSR)
│   ├── content/
│   │   ├── config.ts         # Zod collection schemas
│   │   ├── blog/             # MDX blog posts
│   │   └── pfma/             # MDX PFMA topic pages
│   └── styles/
│       └── globals.css       # Design tokens + global component classes
├── astro.config.mjs
├── tailwind.config.mjs
├── tsconfig.json
└── package.json
```

---

## Content management

### Adding a blog post

Create a new `.mdx` file in `src/content/blog/` using this frontmatter:

```mdx
---
title: "Your Post Title"
description: "SEO meta description (150–160 characters)"
pubDate: 2025-03-01
author: "Tenderpreneurs Team"
category: "Compliance"   # Optional: Compliance | B-BBEE | Construction | etc.
---

Your content here...
```

The post will automatically appear on `/blog` and in the RSS feed.

### Adding a PFMA topic page

Create a new `.mdx` file in `src/content/pfma/` using this frontmatter:

```mdx
---
title: "Topic Title"
description: "SEO meta description"
pubDate: 2025-03-01
category: "Legislation"
author: "Tenderpreneurs Team"
faq:
  - q: "Question?"
    a: "Answer."
---
```

Then add the topic to the grid in `src/pages/pfma/index.astro`.

---

## Environment variables

Create `.env` (not committed) with:

```bash
# Public site URL (used by Astro for sitemap and canonical URLs)
PUBLIC_SITE_URL=https://tenderpreneurs.co.za

# Resend API key (transactional email)
RESEND_API_KEY=re_...

# PayFast credentials (for subscription handling)
PAYFAST_MERCHANT_ID=...
PAYFAST_MERCHANT_KEY=...
PAYFAST_PASSPHRASE=...
```

For Cloudflare Workers, set these as secrets via:

```bash
wrangler secret put RESEND_API_KEY
```

---

## Deployment (Cloudflare Pages)

### First deploy

1. Push to GitHub
2. Connect repository to Cloudflare Pages
3. Set build command: `npm run build`
4. Set output directory: `dist`
5. Set Node.js version: `18` (environment variable `NODE_VERSION=18`)
6. Add environment variables (see above)

### Subsequent deploys

Push to `main` branch — Cloudflare Pages automatically builds and deploys.

### Custom domain

In Cloudflare Pages → Custom Domains:
- Add `tenderpreneurs.co.za`
- Add `www.tenderpreneurs.co.za` (redirect to apex)

Update DNS at your registrar with the CNAME provided by Cloudflare.

---

## Performance targets

| Metric | Target |
|--------|--------|
| Lighthouse Performance | 95+ |
| Lighthouse SEO | 100 |
| Lighthouse Accessibility | 100 |
| Lighthouse Best Practices | 100 |
| Core Web Vitals (LCP) | < 2.5s |
| Core Web Vitals (FID/INP) | < 100ms |
| Core Web Vitals (CLS) | < 0.1 |

---

## Licence

Copyright © 2025 Tenderpreneurs (Pty) Ltd. All rights reserved.
