#!/usr/bin/env node
/**
 * 3. メモから下書き
 *
 * 使い方:
 *   npm run draft:memo -- <slug> "思いついた感想やメモ"
 *   npm run draft:memo -- <slug> --edit   # エディタで直接 memo.md を開く
 */

import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const DRAFTS_DIR = path.join(ROOT, 'drafts');

const argv = process.argv.slice(2);
const slug = argv[0];
const text = argv.slice(1).filter((a) => !a.startsWith('--')).join(' ');
const shouldEdit = argv.includes('--edit');

if (!slug) {
  console.log(`使い方:
  npm run draft:memo -- <slug> "ひとこと感想やギアのメモ"
  npm run draft:memo -- <slug> --edit
`);
  process.exit(1);
}

const draftDir = path.join(DRAFTS_DIR, slug);
fs.mkdirSync(draftDir, { recursive: true });
const memoFile = path.join(draftDir, 'memo.md');

if (!fs.existsSync(memoFile)) {
  fs.writeFileSync(memoFile, `## 振り返り\n\n\n\n## 装備・コンディション\n\n`);
}

if (text) {
  fs.appendFileSync(memoFile, `\n- ${text}\n`);
  console.log(`✔ drafts/${slug}/memo.md にメモを追記しました: "${text}"`);
} else if (shouldEdit || !text) {
  const editor = process.env.EDITOR || (process.platform === 'win32' ? 'notepad' : 'nano');
  console.log(`エディタ (${editor}) で drafts/${slug}/memo.md を開きます...`);
  exec(`${editor} "${memoFile}"`);
}
