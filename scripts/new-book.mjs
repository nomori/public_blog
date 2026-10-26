#!/usr/bin/env node
/**
 * ISBN から本の情報を自動取得して読書ログ Markdown を生成
 *
 * 使い方:
 *   npm run book -- 9784167651022
 *   npm run book -- 9784167651022 --status reading
 *   npm run book -- "タイトル" --manual
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const BOOKS_DIR = path.join(ROOT, 'src/content/books');
const ASSETS_BOOKS_DIR = path.join(ROOT, 'src/assets/books');

const argv = process.argv.slice(2);
const rawInput = argv.find((a) => !a.startsWith('--'));
const statusIdx = argv.indexOf('--status');
const status = statusIdx >= 0 ? argv[statusIdx + 1] : 'read'; // read | reading | want
const isManual = argv.includes('--manual');

if (!rawInput) {
  console.log(`使い方:
  npm run book -- <ISBN> [--status read|reading|want]
  例: npm run book -- 9784167651022
      npm run book -- 9784140814147 --status reading
`);
  process.exit(1);
}

const isbnClean = rawInput.replace(/[^0-9X]/gi, '');

async function fetchFromOpenBD(isbn) {
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

async function fetchFromGoogleBooks(isbn) {
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

async function downloadCover(url, destPath) {
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

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^\w\d\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'book';
}

async function run() {
  let bookData = {
    title: rawInput,
    author: '',
    publisher: '',
    isbn: isbnClean.length >= 10 ? isbnClean : '',
    pages: undefined,
    coverUrl: '',
    description: '',
  };

  if (!isManual && isbnClean.length >= 10) {
    process.stdout.write(`🔍 ISBN ${isbnClean} を検索中 (openBD)... `);
    let info = await fetchFromOpenBD(isbnClean);
    if (!info || !info.title) {
      process.stdout.write(`Google Books を検索中... `);
      info = await fetchFromGoogleBooks(isbnClean);
    }
    if (info && info.title) {
      console.log(`ヒット: 『${info.title}』`);
      bookData = { ...bookData, ...info };
    } else {
      console.log(`見つかりませんでした（手動入力の雛形を作成します）。`);
    }
  }

  const now = new Date();
  const ymd = now.toISOString().slice(0, 10);
  const slug = `${ymd}-${slugify(bookData.title)}`;

  let coverRel = '';
  if (bookData.coverUrl) {
    const coverFile = path.join(ASSETS_BOOKS_DIR, `${slug}.jpg`);
    const ok = await downloadCover(bookData.coverUrl, coverFile);
    if (ok) {
      coverRel = `../../assets/books/${slug}.jpg`;
      console.log(`📷 書影をダウンロードしました: src/assets/books/${slug}.jpg`);
    }
  }

  const fm = [
    '---',
    `title: ${JSON.stringify(bookData.title)}`,
    `author: ${JSON.stringify(bookData.author)}`,
  ];
  if (bookData.publisher) fm.push(`publisher: ${JSON.stringify(bookData.publisher)}`);
  if (bookData.isbn) fm.push(`isbn: ${JSON.stringify(bookData.isbn)}`);
  if (bookData.pages) fm.push(`pages: ${bookData.pages}`);
  if (coverRel) fm.push(`cover: ${coverRel}`);
  fm.push(`status: ${status}`);

  if (status === 'reading') {
    fm.push(`started: ${ymd}`);
  } else if (status === 'read') {
    fm.push(`started: ${ymd}`);
    fm.push(`finished: ${ymd}`);
    fm.push(`rating: 4`);
  }
  fm.push(`tags: []`);
  fm.push(`quote: ""`);
  fm.push('---', '');

  const body = [
    bookData.description ? `<!-- ${bookData.description.replace(/\n+/g, ' ')} -->\n` : '',
    '## 感想・読書メモ',
    '',
    '',
  ].join('\n');

  fs.mkdirSync(BOOKS_DIR, { recursive: true });
  const outFile = path.join(BOOKS_DIR, `${slug}.md`);
  fs.writeFileSync(outFile, fm.join('\n') + body);

  console.log(`✨ 読書ログを作成しました: src/content/books/${slug}.md`);
}

run();
