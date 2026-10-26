#!/usr/bin/env node
/**
 * X (Twitter) のアーカイブ (tweets.js / tweets.json) からつぶやきを取り込み
 *
 * 使い方:
 *   node scripts/import-tweets.mjs --file /path/to/tweets.js [--tag "#山,#ラン"] [--user your_x_id]
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const NOTES_DIR = path.join(ROOT, 'src/content/notes');
const IMAGES_DIR = path.join(ROOT, 'public/images/notes');

const argv = process.argv.slice(2);
const fileIdx = argv.indexOf('--file');
const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : null;

const tagIdx = argv.indexOf('--tag');
const filterTags = tagIdx >= 0 ? argv[tagIdx + 1].split(',').map((t) => t.trim().toLowerCase()) : [];

const userIdx = argv.indexOf('--user');
const username = userIdx >= 0 ? argv[userIdx + 1] : 'i';

const includeReplies = argv.includes('--with-replies');
const includeRetweets = argv.includes('--with-retweets');

if (!filePath || !fs.existsSync(filePath)) {
  console.log(`使い方:
  node scripts/import-tweets.mjs --file <tweets.jsのパス> [オプション]

オプション:
  --tag "#山,#ラン,#登山"   特定のハッシュタグやキーワードを含む投稿のみ抽出
  --user <ユーザー名>        元ポストのURL生成用（デフォルト: i）
  --with-replies            リプライも含める（デフォルト: 除外）
  --with-retweets           リツイートも含める（デフォルト: 除外）

例:
  node scripts/import-tweets.mjs --file ./tweets.js --tag "#山,#ラン" --user myname
`);
  process.exit(1);
}

let raw = fs.readFileSync(filePath, 'utf8');
if (raw.startsWith('window.YTD.tweets.part0 =')) {
  raw = raw.replace(/^window\.YTD\.tweets\.part0\s*=\s*/, '');
}

let items = [];
try {
  items = JSON.parse(raw);
} catch (e) {
  console.error('tweets.js の JSON パースに失敗しました:', e.message);
  process.exit(1);
}

fs.mkdirSync(NOTES_DIR, { recursive: true });
fs.mkdirSync(IMAGES_DIR, { recursive: true });

let imported = 0;

for (const entry of items) {
  const t = entry.tweet || entry;
  const fullText = t.full_text || t.text || '';
  const id = t.id_str || t.id;
  const createdAt = new Date(t.created_at);

  if (!includeRetweets && (fullText.startsWith('RT @') || t.retweeted_status)) continue;
  if (!includeReplies && (t.in_reply_to_status_id_str || fullText.startsWith('@'))) continue;

  if (filterTags.length > 0) {
    const textLower = fullText.toLowerCase();
    const hit = filterTags.some((tag) => textLower.includes(tag));
    if (!hit) continue;
  }

  // ハッシュタグ抽出
  const hashMatches = fullText.match(/#[^\s#]+/g) || [];
  const tags = [...new Set(hashMatches.map((h) => h.replace(/^#/, '')))];

  // 本文からハッシュタグやt.coリンクの整理（末尾のURL等）
  let cleanText = fullText.replace(/https:\/\/t\.co\/\w+/g, '').trim();

  const ymd = createdAt.toISOString().slice(0, 10);
  const stamp = `${ymd}-${String(createdAt.getHours()).padStart(2, '0')}${String(createdAt.getMinutes()).padStart(2, '0')}`;
  const slug = `${stamp}-${id}`;
  const outFile = path.join(NOTES_DIR, `${slug}.md`);

  if (fs.existsSync(outFile)) continue;

  const fm = [
    '---',
    `date: ${createdAt.toISOString()}`,
    `tags: ${JSON.stringify(tags)}`,
    `source: x`,
    `url: "https://x.com/${username}/status/${id}"`,
    '---',
    '',
    cleanText,
  ];

  fs.writeFileSync(outFile, fm.join('\n') + '\n');
  imported++;
}

console.log(`✨ ${imported} 件のツイートを取り込みました！`);
