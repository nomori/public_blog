import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'posts'>;

export async function getPosts() {
  const posts = await getCollection('posts', ({ data }) => import.meta.env.DEV || !data.draft);
  return posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export async function getNotes() {
  const notes = await getCollection('notes');
  return notes.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export function fmtDate(d: Date) {
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export function slugifyTag(tag: string) {
  return encodeURIComponent(tag.toLowerCase());
}

/**
 * base パス（例: /blog/）を考慮した URL を生成するヘルパー
 */
export function url(path = '') {
  const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
  const clean = path.replace(/^\//, '');
  if (!clean) return base ? `${base}/` : '/';
  return `${base}/${clean}`;
}
