/**
 * src/content/config.ts
 *
 * Fixes applied:
 *  1. z.date()  →  z.coerce.date()  for both collections
 *  2. pfma publishedDate is OPTIONAL (pfma MDX files don't have it → was breaking build)
 *  3. All pfma non-title fields are optional (they are reference docs, not blog posts)
 */

import { defineCollection, z } from 'astro:content';

// ---------------------------------------------------------------------------
// Blog — publishedDate is required
// ---------------------------------------------------------------------------
const blogCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string().max(100),
    description: z.string().max(200),
    publishedDate: z.coerce.date(),
    modifiedDate: z.coerce.date().optional(),
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
// PFMA — all fields except title are optional
// ---------------------------------------------------------------------------
const pfmaCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    publishedDate: z.coerce.date().optional(),   // ← was Required, broke build
    modifiedDate: z.coerce.date().optional(),
    category: z.string().default('PFMA'),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    section: z.string().optional(),
    applicableTo: z.array(z.string()).default([]),
    effectiveDate: z.coerce.date().optional(),
    repealedDate: z.coerce.date().optional(),
    sourceUrl: z.string().url().optional(),
  }),
});

export const collections = {
  blog: blogCollection,
  pfma: pfmaCollection,
};
