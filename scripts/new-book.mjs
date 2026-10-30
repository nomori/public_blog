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
import { lookupBook, downloadCover, slugify } from './lib/books.mjs';

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
    const info = await lookupBook(isbnClean);
    if (info) {
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
