import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { CATEGORY_KEYS } from './consts';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string().default(''),
      date: z.coerce.date(),
      updated: z.coerce.date().optional(),
      category: z.enum(CATEGORY_KEYS).default('misc'),
      tags: z.array(z.string()).default([]),
      cover: image().optional(),
      photoDir: z.string().optional(), // src/assets/posts/<photoDir>/（省略時は slug → 日付）
      draft: z.boolean().default(false),
      // アクティビティ記録（GPXから自動生成）
      activity: z
        .object({
          location: z.string().optional(),
          distanceKm: z.number().optional(),
          elevationGainM: z.number().optional(),
          elevationLossM: z.number().optional(),
          maxElevationM: z.number().optional(),
          movingTime: z.string().optional(),
          elapsedTime: z.string().optional(),
          pace: z.string().optional(),
          route: z.string().optional(), // /routes/xxx.json
        })
        .optional(),
      // ボルダリング記録
      climbing: z
        .object({
          place: z.string().optional(),
          sends: z.array(z.object({ name: z.string().optional(), grade: z.string(), status: z.string().default('完登') })).default([]),
        })
        .optional(),
    }),
});

const notes = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/notes' }),
  schema: z.object({
    date: z.coerce.date(),
    tags: z.array(z.string()).default([]),
  }),
});

const photos = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/photos' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      date: z.coerce.date(),
      image: image(),
      category: z.enum(CATEGORY_KEYS).default('misc'),
      caption: z.string().optional(),
    }),
});

export const collections = { posts, notes, photos };
