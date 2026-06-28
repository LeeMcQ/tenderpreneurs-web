// src/pages/blog/rss.xml.ts
// Pure-vanilla RSS 2.0 feed, no @astrojs/rss dependency.
//
// Assumes your blog posts live in src/content/blog/ (Astro content collection)
// OR src/pages/blog/*.md / *.mdx (route-based posts).
//
// If you use a content collection, uncomment the getCollection() branch
// and remove the import.meta.glob() branch (or vice versa). Both work.

import type { APIRoute } from "astro";
import { ORGANISATION } from "../../data/organisation";

// ─── Option A: Content collection (recommended for Astro 4+) ───
// import { getCollection } from "astro:content";
// const posts = await getCollection("blog");

// ─── Option B: File-based blog routes ───
// Uses Astro's import.meta.glob() to find .md/.mdx files in src/pages/blog/
// Adjust the glob path if your blog files live elsewhere.

interface BlogFrontmatter {
  title?: string;
  description?: string;
  pubDate?: string | Date;
  publishDate?: string | Date;
  date?: string | Date;
  author?: string;
  draft?: boolean;
}

interface BlogModule {
  frontmatter: BlogFrontmatter;
  url?: string;
  file?: string;
}

export const GET: APIRoute = async ({ site }) => {
  const siteUrl = site?.toString().replace(/\/$/, "") ?? ORGANISATION.url;

  // Glob blog posts. Change "./*.{md,mdx}" if your structure differs.
  const modules = import.meta.glob<BlogModule>("./*.{md,mdx}", { eager: true });

  const items = Object.values(modules)
    .filter((m) => m && m.frontmatter && !m.frontmatter.draft)
    .map((m) => {
      const f = m.frontmatter;
      const date = f.pubDate ?? f.publishDate ?? f.date ?? new Date();
      return {
        title: f.title ?? "Untitled",
        description: f.description ?? "",
        url: m.url ?? "/blog/",
        pubDate: new Date(date),
        author: f.author ?? ORGANISATION.name,
      };
    })
    .sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(ORGANISATION.name)} — Blog</title>
    <link>${siteUrl}/blog</link>
    <description>PFMA, B-BBEE, CSD, and tender-strategy guides for South African SMMEs.</description>
    <language>en-za</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${siteUrl}/blog/rss.xml" rel="self" type="application/rss+xml" />
${items.map((item) => `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${siteUrl}${item.url}</link>
      <guid isPermaLink="true">${siteUrl}${item.url}</guid>
      <description>${escapeXml(item.description)}</description>
      <pubDate>${item.pubDate.toUTCString()}</pubDate>
      <author>${escapeXml(ORGANISATION.email)} (${escapeXml(item.author)})</author>
    </item>`).join("\n")}
  </channel>
</rss>`;

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};

function escapeXml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
