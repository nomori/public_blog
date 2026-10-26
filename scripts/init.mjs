#!/usr/bin/env node
/**
 * ブログ初期化・セットアップウィザード
 *
 * 使い方:
 *   npm run init
 *   npm run setup
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const CONSTS_FILE = path.join(ROOT, 'src/consts.ts');
const ASTRO_CONFIG = path.join(ROOT, 'astro.config.mjs');

const rl = readline.createInterface({ input, output });

async function ask(query, def) {
  const answer = (await rl.question(`${query} ${def ? `[${def}] ` : ''}: `)).trim();
  return answer || def || '';
}

const THEME_OPTIONS = [
  { key: 'forest', name: 'Forest', desc: '山道と深い森のモスグリーン（自然・落ち着き）' },
  { key: 'ocean', name: 'Ocean', desc: '稜線の空と海を思わせるディープブルー（爽快感）' },
  { key: 'sunset', name: 'Sunset', desc: '夕焼けと岩肌を彩るテラコッタ（温かみ・情熱）' },
  { key: 'granite', name: 'Granite', desc: '花崗岩を思わせるミニマル・モノトーン（洗練）' },
  { key: 'plum', name: 'Plum', desc: '山桜やワインを思わせるダスティプラム（和モダン）' },
];

async function main() {
  console.log(`
==================================================
  🏔️  Trail & Chalk ブログ初期設定ウィザード
==================================================
Enterキーを押すと [ ] 内のデフォルト値が適用されます。
`);

  // 1. 基本情報
  const title = await ask('1. サイトのタイトル', 'Trail & Chalk');
  const tagline = await ask('2. キャッチコピー (タグライン)', '山道とチョークの記録');
  const description = await ask('3. サイトの説明文', '登山・ランニング・トレイルランニング・ボルダリング、そして日々の雑記。');
  const author = await ask('4. 作者のお名前', 'Your Name');

  // 2. テーマ選択
  console.log('\n--- 5. カラーテーマを選択してください ---');
  THEME_OPTIONS.forEach((t, i) => {
    console.log(`  ${i + 1}) ${t.name.padEnd(8)} : ${t.desc}`);
  });
  const themeNum = await ask('テーマ番号 (1-5)', '1');
  const selectedTheme = THEME_OPTIONS[parseInt(themeNum, 10) - 1]?.key || 'forest';

  // 3. デプロイ先の予定
  console.log('\n--- 6. デプロイ先の予定を選択してください ---');
  console.log('  1) Cloudflare Pages (ルート直下 / で公開・推奨)');
  console.log('  2) さくらのレンタルサーバ (/blog サブディレクトリで公開)');
  console.log('  3) その他 / 未定');
  const deployNum = await ask('デプロイ先 (1-3)', '1');

  // 4. サンプル記事のクリア確認
  console.log('\n--- 7. サンプルデータの取り扱い ---');
  console.log('  既存のサンプル山行記録や読書ログを残しますか？');
  console.log('  ・残す (N): 実際の画面構成を見ながら少しずつ置き換えられます（推奨）');
  console.log('  ・クリア (y): サンプルを削除し、最小限のテンプレート1件のみにします');
  const cleanAns = await ask('サンプルデータをクリアしますか？ (y/N)', 'N');
  const doClean = cleanAns.toLowerCase() === 'y';

  rl.close();

  console.log('\n⚙️ 設定を適用中...');

  // consts.ts の更新
  let constsContent = fs.readFileSync(CONSTS_FILE, 'utf8');
  constsContent = constsContent.replace(
    /export const SITE_TITLE = '.*?';/,
    `export const SITE_TITLE = ${JSON.stringify(title)};`
  );
  constsContent = constsContent.replace(
    /export const SITE_TAGLINE = '.*?';/,
    `export const SITE_TAGLINE = ${JSON.stringify(tagline)};`
  );
  constsContent = constsContent.replace(
    /export const SITE_DESCRIPTION =\s*'[\s\S]*?';/,
    `export const SITE_DESCRIPTION =\n  ${JSON.stringify(description)};`
  );
  constsContent = constsContent.replace(
    /export const AUTHOR = '.*?';/,
    `export const AUTHOR = ${JSON.stringify(author)};`
  );
  constsContent = constsContent.replace(
    /export const SITE_THEME: ThemeKey = '.*?';/,
    `export const SITE_THEME: ThemeKey = '${selectedTheme}';`
  );
  fs.writeFileSync(CONSTS_FILE, constsContent);
  console.log('✔ src/consts.ts を更新しました');

  // astro.config.mjs の base 調整
  if (deployNum === '1') {
    // Cloudflare Pages ルート推奨
    let astroContent = fs.readFileSync(ASTRO_CONFIG, 'utf8');
    astroContent = astroContent.replace(
      /const base = process\.env\.ASTRO_BASE \?\? \(process\.env\.CF_PAGES \? '\/' : '.*?'\);/,
      `const base = process.env.ASTRO_BASE ?? (process.env.CF_PAGES ? '/' : '/');`
    );
    fs.writeFileSync(ASTRO_CONFIG, astroContent);
    console.log('✔ astro.config.mjs (ルートパス) を更新しました');
  }

  // サンプルデータのクリーンアップ処理
  if (doClean) {
    cleanSamples();
  }

  console.log(`
==================================================
  ✨ 初期設定が完了しました！
==================================================
サイト名 : ${title}
作者     : ${author}
テーマ   : ${selectedTheme} (${THEMES_LABEL(selectedTheme)})

次のステップ:
  1. npm run dev       # ローカル開発サーバを起動 (http://localhost:4321)
  2. npm run new       # 新しい記事や記録を作成
  3. npm run book      # ISBNから読書ログを作成

いつでも 'src/consts.ts' を編集するか、再び 'npm run init' を実行することで設定を変更できます。
`);
}

function THEMES_LABEL(k) {
  return THEME_OPTIONS.find((t) => t.key === k)?.name || k;
}

function cleanSamples() {
  const postsDir = path.join(ROOT, 'src/content/posts');
  const notesDir = path.join(ROOT, 'src/content/notes');
  const booksDir = path.join(ROOT, 'src/content/books');

  // posts の整理（1件のウェルカム記事だけ残す）
  if (fs.existsSync(postsDir)) {
    for (const f of fs.readdirSync(postsDir)) {
      fs.rmSync(path.join(postsDir, f), { recursive: true, force: true });
    }
    const welcome = `---
title: "最初の記事へようこそ"
description: "ブログの開設記念記事です。"
date: ${new Date().toISOString()}
category: misc
kind: article
tags: ["はじめに"]
---

ブログを新しく立ち上げました！

山行やランニングの記録は \`npm run compose\` や \`npm run new -- log\` で、読書メモは \`npm run book -- <ISBN>\` で簡単に追加できます。
`;
    fs.writeFileSync(path.join(postsDir, 'welcome.md'), welcome);
    console.log('✔ src/content/posts/ を初期化しました (welcome.md を作成)');
  }

  // notes の整理
  if (fs.existsSync(notesDir)) {
    for (const f of fs.readdirSync(notesDir)) {
      fs.rmSync(path.join(notesDir, f), { recursive: true, force: true });
    }
    const firstNote = `---
date: ${new Date().toISOString()}
tags: ["memo"]
source: local
---

ブログをセットアップした！
`;
    fs.writeFileSync(path.join(notesDir, 'first-note.md'), firstNote);
    console.log('✔ src/content/notes/ を初期化しました');
  }

  // books の整理
  if (fs.existsSync(booksDir)) {
    for (const f of fs.readdirSync(booksDir)) {
      fs.rmSync(path.join(booksDir, f), { recursive: true, force: true });
    }
    const firstBook = `---
title: "サンプルの本"
author: "著者名"
status: want
tags: ["読みたい"]
---

気になる本を \`npm run book -- <ISBN>\` で登録できます。
`;
    fs.writeFileSync(path.join(booksDir, 'sample-book.md'), firstBook);
    console.log('✔ src/content/books/ を初期化しました');
  }
}

main().catch((err) => {
  console.error('エラーが発生しました:', err);
  process.exit(1);
});
