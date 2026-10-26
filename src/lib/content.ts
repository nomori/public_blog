import { getCollection, type CollectionEntry } from 'astro:content';
import type { KindKey } from '../consts';

export type Post = CollectionEntry<'posts'>;
export type Note = CollectionEntry<'notes'>;
export type Book = CollectionEntry<'books'>;

export async function getPosts() {
  const posts = await getCollection('posts', ({ data }) => import.meta.env.DEV || !data.draft);
  return posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

/** 種別（明示が無ければ activity/climbing の有無で判定） */
export function kindOf(post: Post): KindKey {
  return post.data.kind ?? (post.data.activity || post.data.climbing ? 'log' : 'article');
}

export async function getLogs() {
  return (await getPosts()).filter((p) => kindOf(p) === 'log');
}

export async function getArticles() {
  return (await getPosts()).filter((p) => kindOf(p) === 'article');
}

export async function getNotes() {
  const notes = await getCollection('notes', ({ data }) => !data.hidden);
  return notes.sort((a, b) => Number(b.data.pinned) - Number(a.data.pinned) || b.data.date.valueOf() - a.data.date.valueOf());
}

export async function getBooks() {
  const books = await getCollection('books');
  const key = (b: Book) => (b.data.finished ?? b.data.started ?? new Date(0)).valueOf();
  return books.sort((a, b) => key(b) - key(a));
}

/* ---------- 日付（ビルド環境のTZに依存しないよう JST 固定） ---------- */

const JST_OFFSET = 9 * 3600 * 1000;
/** JST の年・月(1-12)・日・曜日(0=日) */
export function jst(d: Date) {
  const t = new Date(d.getTime() + JST_OFFSET);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), w: t.getUTCDay(), h: t.getUTCHours(), min: t.getUTCMinutes() };
}
const p2 = (n: number) => String(n).padStart(2, '0');

export function fmtDate(d: Date) {
  const j = jst(d);
  return `${j.y}.${p2(j.m)}.${p2(j.d)}`;
}
export function fmtTime(d: Date) {
  const j = jst(d);
  return `${p2(j.h)}:${p2(j.min)}`;
}
/** 'YYYY-MM' */
export function monthKey(d: Date) {
  const j = jst(d);
  return `${j.y}-${p2(j.m)}`;
}
/** 'YYYY-MM-DD' */
export function dayKey(d: Date) {
  const j = jst(d);
  return `${j.y}-${p2(j.m)}-${p2(j.d)}`;
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
