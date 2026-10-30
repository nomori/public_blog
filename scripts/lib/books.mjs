/**
 * 書誌情報の取得・書影ダウンロード（new-book.mjs / issue-handler.mjs 共通）
 */
import fs from 'node:fs';
import path from 'node:path';

export async function fetchFromOpenBD(isbn) {
  try {
    const res = await fetch(`https://api.openbd.jp/v1/get?isbn=${isbn}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !data[0]) return null;
    const b = data[0];
    const s = b.summary || {};
    const o = b.onix || {};
    const desc = b.onix?.CollateralDetail?.TextContent?.[0]?.Text || '';
    const pages = Number(o?.DescriptiveDetail?.Extent?.[0]?.ExtentValue) || undefined;
    return {
      title: s.title || '',
      author: s.author || '',
      publisher: s.publisher || '',
      isbn: s.isbn || isbn,
      coverUrl: s.cover || '',
      pages,
      description: desc,
    };
  } catch (e) {
    return null;
  }
}

export async function fetchFromGoogleBooks(isbn) {
  try {
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.items || !data.items[0]) return null;
    const vi = data.items[0].volumeInfo || {};
    const img = vi.imageLinks?.thumbnail || vi.imageLinks?.smallThumbnail || '';
    return {
      title: vi.title || '',
      author: (vi.authors || []).join(', '),
      publisher: vi.publisher || '',
      isbn,
      coverUrl: img.replace(/^http:/, 'https:'),
      pages: vi.pageCount || undefined,
      description: vi.description || '',
    };
  } catch (e) {
    return null;
  }
}

/** openBD → Google Books の順に検索。見つからなければ null */
export async function lookupBook(isbn, log = (s) => process.stdout.write(s)) {
  log(`🔍 ISBN ${isbn} を検索中 (openBD)... `);
  let info = await fetchFromOpenBD(isbn);
  if (!info || !info.title) {
    log(`Google Books を検索中... `);
    info = await fetchFromGoogleBooks(isbn);
  }
  return info && info.title ? info : null;
}

export async function downloadCover(url, destPath) {
  if (!url) return false;
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const arrayBuffer = await res.arrayBuffer();
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, Buffer.from(arrayBuffer));
    return true;
  } catch (e) {
    return false;
  }
}

export function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^\w\d\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'book';
}
