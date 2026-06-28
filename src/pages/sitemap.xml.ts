/**
 * src/pages/sitemap.xml.ts
 *
 * Manual sitemap — replaces @astrojs/sitemap which crashes in SSR+Cloudflare mode.
 * This is a server-rendered endpoint so it always reflects the current content.
 * Prerendered so it gets written as a static file at build time.
 */
export const prerender = true;

import { getCollection } from 'astro:content';
import type { APIRoute } from 'astro';

const SITE = 'https://tenderpreneurs.co.za';

function url(path: string, lastmod?: string, priority = '0.7', changefreq = 'weekly') {
  return `
  <url>
    <loc>${SITE}${path}</loc>
    ${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`.trim();
}

export const GET: APIRoute = async () => {
  const today = new Date().toISOString().split('T')[0];

  // Static pages
  const staticUrls = [
    url('/',          today, '1.0', 'daily'),
    url('/tenders',   today, '1.0', 'hourly'),
    url('/pricing',   today, '0.8', 'monthly'),
    url('/about',     today, '0.6', 'monthly'),
    url('/blog',      today, '0.9', 'daily'),
    url('/pfma',      today, '0.8', 'weekly'),
    url('/privacy',   today, '0.3', 'yearly'),
    url('/terms',     today, '0.3', 'yearly'),
    url('/cookies',   today, '0.3', 'yearly'),
  ];

  // Blog posts
  let blogUrls: string[] = [];
  try {
    const posts = await getCollection('blog', ({ data }) => !data.draft);
    blogUrls = posts.map((p) => {
      const lastmod = p.data.modifiedDate
        ? new Date(p.data.modifiedDate).toISOString().split('T')[0]
        : new Date(p.data.publishedDate).toISOString().split('T')[0];
      return url(`/blog/${p.slug}`, lastmod, '0.8', 'monthly');
    });
  } catch (e) {
    console.warn('[sitemap] Could not load blog collection:', e);
  }

  // PFMA pages
  let pfmaUrls: string[] = [];
  try {
    const docs = await getCollection('pfma', ({ data }) => !data.draft);
    pfmaUrls = docs.map((d) => {
      const lastmod = d.data.modifiedDate
        ? new Date(d.data.modifiedDate).toISOString().split('T')[0]
        : today;
      return url(`/pfma/${d.slug}`, lastmod, '0.7', 'monthly');
    });
  } catch (e) {
    console.warn('[sitemap] Could not load pfma collection:', e);
  }

  // Province + sector landing pages (these static routes exist under /tenders/*)
  const PROVINCES = ['eastern-cape','free-state','gauteng','kwazulu-natal','limpopo','mpumalanga','north-west','northern-cape','western-cape'];
  const SECTORS = ['agriculture','catering','cleaning','construction','consulting','education','energy','health','ict','legal','security','transport'];
  const landingUrls = [...PROVINCES, ...SECTORS].map((slug) => url(`/tenders/${slug}`, today, '0.8', 'daily'));

  const allUrls = [...staticUrls, ...landingUrls, ...blogUrls, ...pfmaUrls].join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
