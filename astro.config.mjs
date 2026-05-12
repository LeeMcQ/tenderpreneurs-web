cat > astro.config.mjs << 'EOF'
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://tenderpreneurs.co.za',
  output: 'hybrid',
  adapter: cloudflare(),
  integrations: [
    tailwind(),
    sitemap(),
  ],
});
EOF