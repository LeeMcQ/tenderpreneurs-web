// astro.config.mjs
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwind from '@astrojs/tailwind';

const SITE_URL = process.env.PUBLIC_SITE_URL || 'https://tenderpreneurs.co.za';

export default defineConfig({
  site: SITE_URL,
  output: 'server',

  adapter: cloudflare({
    mode: 'directory',
    platformProxy: { enabled: true },
  }),

  integrations: [
    mdx(),
    tailwind(),

    // Sitemap: in SSR mode @astrojs/sitemap can't auto-discover dynamic routes.
    // We must provide the URL list manually, otherwise it crashes with
    // "Cannot read properties of undefined (reading 'reduce')" at build:done.
    sitemap({
      customPages: [
        // Static pages
        `${SITE_URL}/`,
        `${SITE_URL}/tenders`,
        `${SITE_URL}/pricing`,
        `${SITE_URL}/about`,
        `${SITE_URL}/blog`,
        `${SITE_URL}/pfma`,
        `${SITE_URL}/privacy`,
        `${SITE_URL}/terms`,
        `${SITE_URL}/cookies`,
        // Blog posts (prerendered)
        `${SITE_URL}/blog/central-supplier-database-registration`,
        `${SITE_URL}/blog/common-reasons-bids-disqualified`,
        `${SITE_URL}/blog/construction-tenders-sa-2026`,
        `${SITE_URL}/blog/gauteng-government-tenders-guide`,
        `${SITE_URL}/blog/how-to-find-tenders-on-etenders`,
        `${SITE_URL}/blog/how-to-win-your-first-government-tender`,
        `${SITE_URL}/blog/how-win-probability-is-calculated`,
        `${SITE_URL}/blog/ict-tenders-for-smmes`,
        `${SITE_URL}/blog/kzn-procurement-deadlines`,
        `${SITE_URL}/blog/sbd-forms-checklist`,
        `${SITE_URL}/blog/understanding-bbbee-requirements`,
        `${SITE_URL}/blog/understanding-the-80-20-pppfa-rule`,
        `${SITE_URL}/blog/western-cape-tender-opportunities-2026`,
        `${SITE_URL}/blog/what-is-pfma-compliance`,
        `${SITE_URL}/blog/what-makes-a-tender-non-responsive`,
        // PFMA pages (prerendered)
        `${SITE_URL}/pfma/80-20-system`,
        `${SITE_URL}/pfma/appeals`,
        `${SITE_URL}/pfma/b-bbee`,
        `${SITE_URL}/pfma/cidb`,
        `${SITE_URL}/pfma/csd`,
        `${SITE_URL}/pfma/irregular-expenditure`,
        `${SITE_URL}/pfma/mfma`,
        `${SITE_URL}/pfma/pfma-overview`,
        `${SITE_URL}/pfma/sbd-forms`,
        `${SITE_URL}/pfma/scm-regulations`,
        `${SITE_URL}/pfma/thresholds`,
      ],
      // Exclude API routes and auth pages from the sitemap
      filter: (page) =>
        !page.includes('/api/') &&
        !page.includes('/auth/') &&
        !page.includes('/tenders/t/'),
    }),
  ],

  vite: {
    ssr: {
      external: ['node-cron', '@sentry/node'],
    },
    optimizeDeps: {
      exclude: ['node-cron', '@sentry/node'],
    },
    build: {
      chunkSizeWarningLimit: 1000,
    },
  },

  markdown: {
    shikiConfig: {
      theme: 'github-dark',
      wrap: true,
    },
  },
});
