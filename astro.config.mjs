// astro.config.mjs
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwind from '@astrojs/tailwind';

// NOTE: @vite-pwa/astro is intentionally omitted here.
// It conflicts with @astrojs/cloudflare's directory output mode and causes
// build failures on Cloudflare Pages. PWA manifest/service-worker can be
// added manually if needed later.

const SITE_URL =
  process.env.PUBLIC_SITE_URL || 'https://tenderpreneurs.co.za';

export default defineConfig({
  site: SITE_URL,

  output: 'server',

  adapter: cloudflare({
    mode: 'directory',
    // Prevent Node.js built-ins (like node-cron) from being bundled into
    // the Worker. node-cron is only used in local dev / GitHub Actions.
    platformProxy: {
      enabled: true,
    },
  }),

  integrations: [
    mdx(),
    tailwind(),
    sitemap({
      // Only include static / publicly cacheable pages in the sitemap.
      // Dynamic tender detail pages are excluded to keep the sitemap manageable.
      filter: (page) => {
        if (page.includes('/api/')) return false;
        if (page.includes('/auth/')) return false;
        if (page.includes('/tenders/t/')) return false; // dynamic tender detail pages
        return true;
      },
    }),
  ],

  vite: {
    // Prevent server-only packages from being accidentally bundled into
    // client-side code or the Worker bundle.
    ssr: {
      external: [
        'node-cron',
        '@sentry/node',
      ],
      noExternal: [],
    },
    optimizeDeps: {
      exclude: ['node-cron', '@sentry/node'],
    },
    build: {
      // Increase the chunk size warning threshold — the app has large
      // adapter modules (OCDS JSON mappings, DeepSeek calls) that are fine.
      chunkSizeWarningLimit: 1000,
    },
  },

  // Markdown / MDX options
  markdown: {
    shikiConfig: {
      theme: 'github-dark',
      wrap: true,
    },
  },
});
