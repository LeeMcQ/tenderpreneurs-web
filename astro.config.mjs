import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';

export default defineConfig({
  site: 'https://tenderpreneur.co.za',
  output: 'hybrid',
  adapter: cloudflare({
    platformProxy: {
      enabled: true,
    },
  }),
  integrations: [
    tailwind({
      applyBaseStyles: false,
    }),
    sitemap({
      changefreq: 'weekly',
      priority: 0.7,
      lastmod: new Date(),
      customPages: [
        'https://tenderpreneur.co.za/pfma/pfma-overview',
        'https://tenderpreneur.co.za/pfma/80-20-system',
        'https://tenderpreneur.co.za/pfma/b-bbee',
        'https://tenderpreneur.co.za/pfma/scm-regulations',
        'https://tenderpreneur.co.za/pfma/csd',
        'https://tenderpreneur.co.za/pfma/cidb',
        'https://tenderpreneur.co.za/pfma/appeals',
        'https://tenderpreneur.co.za/pfma/irregular-expenditure',
        'https://tenderpreneur.co.za/pfma/thresholds',
        'https://tenderpreneur.co.za/pfma/sbd-forms',
        'https://tenderpreneur.co.za/pfma/mfma',
      ],
    }),
    mdx(),
  ],
  markdown: {
    shikiConfig: {
      theme: 'github-dark',
    },
  },
  image: {
    service: {
      entrypoint: 'astro/assets/services/sharp',
    },
  },
  vite: {
    build: {
      cssCodeSplit: true,
      minify: 'esbuild',
    },
    ssr: {
      external: ['node:path', 'node:fs', 'node:url'],
    },
  },
});
