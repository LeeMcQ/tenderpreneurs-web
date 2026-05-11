import { defineCollection, z } from 'astro:content';

const blogCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string().max(100),
    description: z.string().max(200),
    publishedDate: z.date(),
    modifiedDate: z.date().optional(),
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

const pfmaCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string().max(100),
    description: z.string().max(200),
    publishedDate: z.date(),
    modifiedDate: z.date().optional(),
    order: z.number().default(99),
    relatedTopics: z.array(z.string()).default([]),
    faqs: z
      .array(
        z.object({
          question: z.string(),
          answer: z.string(),
        })
      )
      .default([]),
    ogImage: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = {
  blog: blogCollection,
  pfma: pfmaCollection,
};
