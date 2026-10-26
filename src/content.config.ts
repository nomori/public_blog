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
      // 種別: log=記録 / article=記事。省略時は activity・climbing があれば log、なければ article
      kind: z.enum(['log', 'article']).optional(),
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
    // 取り込み元（local=手書き / x=X(Twitter)アーカイブ）
    source: z.enum(['local', 'x', 'bluesky', 'mastodon']).default('local'),
    url: z.string().optional(), // 元投稿へのリンク
    images: z.array(z.string()).default([]), // public/ 配下のパス
    pinned: z.boolean().default(false),
    hidden: z.boolean().default(false), // 取り込んだけど載せたくないもの
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

const books = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/books' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      author: z.string().default(''),
      publisher: z.string().optional(),
      isbn: z.string().optional(),
      pages: z.number().optional(),
      cover: image().optional(),
      status: z.enum(['want', 'reading', 'read']).default('want'),
      started: z.coerce.date().optional(),
      finished: z.coerce.date().optional(),
      rating: z.number().min(0).max(5).optional(),
      tags: z.array(z.string()).default([]),
      quote: z.string().optional(), // 印象に残った一文
    }),
});

export const collections = { posts, notes, photos, books };
