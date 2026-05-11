import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const blog = await getCollection('blog');
  const sorted = blog.sort(
    (a, b) => new Date(b.data.pubDate).valueOf() - new Date(a.data.pubDate).valueOf()
  );

  return rss({
    title: 'Tenderpreneur Blog — SA Tender Intelligence & PFMA Guides',
    description:
      'Practical guides on PFMA, B-BBEE, CSD registration, tender pricing, and winning strategies for South African SMMEs.',
    site: context.site ?? 'https://tenderpreneur.co.za',
    items: sorted.map((post) => ({
      title: post.data.title,
      pubDate: new Date(post.data.pubDate),
      description: post.data.description,
      link: `/blog/${post.slug}/`,
      author: post.data.author,
      categories: post.data.category ? [post.data.category] : [],
    })),
    customData: `<language>en-za</language>`,
    stylesheet: '/rss/styles.xsl',
  });
}
