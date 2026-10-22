#!/usr/bin/env node
/**
 * 記事・メモ・ボルダリング記録のひな形を作成
 *   npm run new -- post "タイトル" [--category misc]
 *   npm run new -- note "今日のひとこと"
 *   npm run new -- boulder "ジム名や岩場"
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const [type = 'post', text = '', ...rest] = process.argv.slice(2);
const catIdx = rest.indexOf('--category');
const category = catIdx >= 0 ? rest[catIdx + 1] : 'misc';
const now = new Date();
const ymd = now.toISOString().slice(0, 10);
const stamp = `${ymd}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;

function write(dir, name, content) {
  const d = path.join(ROOT, 'src/content', dir);
  fs.mkdirSync(d, { recursive: true });
  let file = path.join(d, `${name}.md`), n = 2;
  while (fs.existsSync(file)) file = path.join(d, `${name}-${n++}.md`);
  fs.writeFileSync(file, content);
  console.log('✔', path.relative(ROOT, file));
}

if (type === 'note') {
  write('notes', stamp, `---\ndate: ${now.toISOString()}\ntags: []\n---\n\n${text}\n`);
} else if (type === 'boulder') {
  write('posts', `${ymd}-boulder`, `---
title: ${JSON.stringify(`${text || 'ボルダリング'}セッション`)}
description: ""
date: ${now.toISOString()}
category: boulder
tags: ["ボルダリング"]
draft: true
climbing:
  place: ${JSON.stringify(text)}
  sends:
    - { name: "", grade: "5級", status: "完登" }
    - { name: "", grade: "4級", status: "Flash" }
    - { name: "", grade: "3級", status: "トライ中" }
---

## 今日のセッション

<!-- 体調・混み具合・テーマ -->

## 課題メモ

## 次回やること
`);
} else {
  write('posts', `${ymd}-${category}`, `---
title: ${JSON.stringify(text || '無題')}
description: ""
date: ${now.toISOString()}
category: ${category}
tags: []
draft: true
---

`);
}
