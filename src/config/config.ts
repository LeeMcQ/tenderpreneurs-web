/**
 * Astro Content Collection Schemas
 *
 * FIX APPLIED: Changed z.date() → z.coerce.date() for publishedDate and modifiedDate.
 *
 * Why: YAML dates like `publishedDate: 2026-03-10` (without quotes) are parsed by
 * the YAML parser as JavaScript Date objects in Node ≥18 but as plain strings in
 * some YAML parsers used by Astro's Vite pipeline. z.date() ONLY accepts Date objects
 * and rejects strings — causing silent Zod validation failures that make Astro report
 * the collection as "empty". z.coerce.date() accepts both Date objects and date strings,
 * solving the issue across all environments.
 */

import { defineCollection, z } from 'astro:content';

// ---------------------------------------------------------------------------
// Blog collection
// ---------------------------------------------------------------------------

const blogCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string().max(100),
    description: z.string().max(200),
    publishedDate: z.coerce.date(),           // ← was z.date() — now accepts YAML date strings
    modifiedDate: z.coerce.date().optional(), // ← same fix
    author: z.string().default('Tenderpreneur Editorial'),
    tags: z.array(z.string()).default([]),
    category: z.string().default('Procurement'),
    ogImage: z.string().optional(),
    readingTime: z.number().optional(),
    featured: z.boolean().default(false),
    relatedSlugs: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

// ---------------------------------------------------------------------------
// PFMA collection (Public Finance Management Act documents)
// ---------------------------------------------------------------------------

const pfmaCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    publishedDate: z.coerce.date(),
    category: z.string().default('PFMA'),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const collections = {
  blog: blogCollection,
  pfma: pfmaCollection,
};
