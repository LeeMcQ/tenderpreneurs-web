import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

// Inline the organisation data so this file has zero external dependencies
// that could cause build failures if a data file is missing or renamed.
const SITE_URL = import.meta.env.PUBLIC_SITE_URL || 'https://tenderpreneurs.co.za';
const SITE_TITLE = 'Tenderpreneurs';
const SITE_DESCRIPTION =
  'South African government tender insights, guides, and procurement news.';

export async function GET(context) {
  let posts = [];

  try {
    const all = await getCollection('blog', ({ data }) => !data.draft);
    posts = all.sort(
      (a, b) =>
        new Date(b.data.publishedDate).getTime() -
        new Date(a.data.publishedDate).getTime()
    );
  } catch (err) {
    // If the collection is empty or fails validation, return a valid but empty feed
    // rather than breaking the build.
    console.warn('[rss.xml] Could not load blog collection:', err?.message ?? err);
  }

  return rss({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    site: context.site ?? SITE_URL,
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: new Date(post.data.publishedDate),
      description: post.data.description,
      link: `/blog/${post.slug}/`,
      categories: [post.data.category, ...(post.data.tags ?? [])].filter(Boolean),
      author: post.data.author ?? 'Tenderpreneurs Editorial',
    })),
    customData: `<language>en-za</language>`,
    stylesheet: false,
  });
}
