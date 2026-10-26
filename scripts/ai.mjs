#!/usr/bin/env node
/**
 * AI 記事成形アシスタント (Gemini API)
 *
 * 使い方:
 *   1. 下書きの成形:
 *      npm run ai -- draft <slug>
 *      例: npm run ai -- draft 2026-10-22-tanzawa
 *
 *   2. 既存Markdown記事・読書ログの成形・推敲:
 *      npm run ai -- file <ファイルパス>
 *      例: npm run ai -- file src/content/posts/2026-09-15-misc.md
 *          npm run ai -- file src/content/books/born-to-run.md
 *
 *   3. 走り書きメモから新規記事を作成:
 *      npm run ai -- new "高尾山から陣馬山まで走ってきた。天気が良くて..." [--category trail]
 *
 * 必要な環境変数 (.env):
 *   GEMINI_API_KEY=xxxxx (Google AI Studio で無料取得可能)
 *   GEMINI_MODEL=gemini-2.5-flash (省略時は gemini-2.5-flash)
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');

// .env 読み込み
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

function checkApiKey() {
  if (!API_KEY) {
    console.error(`
❌ GEMINI_API_KEY が設定されていません。

【セットアップ方法（1分・完全無料）】:
1. Google AI Studio (https://aistudio.google.com/) にアクセスしてログイン
2. 「Get API key」をクリックして API キーを発行
3. プロジェクト直下の .env に以下を追記してください:

   GEMINI_API_KEY=AIzaSy...

`);
    process.exit(1);
  }
}

async function callGemini(prompt, systemInstruction = '') {
  checkApiKey();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
  
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048,
    },
  };
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  process.stdout.write('🤖 AI が記事を成形中... ');
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`APIエラー (${res.status}): ${err.slice(0, 300)}`);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
    if (!text) throw new Error('AIからの応答が空でした');

    console.log('完了！');
    return text.replace(/^```(?:markdown)?\r?\n|\r?\n```$/g, '').trim();
  } catch (e) {
    console.log('失敗');
    console.error(`\n⚠ エラー: ${e.message}\n`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// 1. 下書きの成形 (drafts/<slug>)
// ---------------------------------------------------------------------------
async function formatDraft(slug) {
  const draftDir = path.join(ROOT, 'drafts', slug);
  if (!fs.existsSync(draftDir)) {
    console.error(`下書きディレクトリが見つかりません: drafts/${slug}`);
    process.exit(1);
  }

  const actFile = path.join(draftDir, 'activity.json');
  const activity = fs.existsSync(actFile) ? JSON.parse(fs.readFileSync(actFile, 'utf8')) : null;

  const memoFile = path.join(draftDir, 'memo.md');
  const memo = fs.existsSync(memoFile) ? fs.readFileSync(memoFile, 'utf8').trim() : '';

  const photosDir = path.join(draftDir, 'photos');
  const photoCount = fs.existsSync(photosDir) ? fs.readdirSync(photosDir).length : 0;

  const sys = `あなたは登山、ランニング、トレイルランニング、ボルダリングの活動ログを発信する個人ブロガーです。
ユーザーから提供されたアクティビティの客観データ（距離、標高、時間など）と走り書きメモをもとに、ブログに掲載する「主観メモ・振り返り」を魅力的なMarkdown形式で成形してください。

【執筆ルール】:
- 文体は落ち着いた常体（「〜だ」「〜である」調）。過度な装飾や大げさなポエムは避け、身体感覚や臨場感を大切にする。
- 見出し（##）を使って構造化する（例: ## 山行の振り返り / ## コンディション・天候 / ## ギア・補給の気づき / ## 次回への課題 など、内容に応じて適切に）。
- 客観的なスプリット表や行程ログはシステム側で別途自動挿入されるため、ここでは「本人の体験・感想・思考・反省」を中心に書く。
- 本人のメモに含まれる事実や感情を最優先で活かし、辻褄の合う自然な文章に肉付けする。事実と推測を混同しない。
- Markdown のみを出力してください（前後の挨拶等は不要）。`;

  const prompt = `以下の下書きデータから、ブログ記事の振り返り本文を生成してください。

【アクティビティデータ】:
- タイトル/場所: ${activity?.title || slug} (${activity?.location || '場所未設定'})
- カテゴリ: ${activity?.category || '登山/アウトドア'}
- 距離: ${activity?.distanceKm ? activity.distanceKm + ' km' : '未記録'}
- 獲得標高: ${activity?.elevationGainM ? '↑' + activity.elevationGainM + ' m' : '未記録'}
- 行動時間: ${activity?.movingTime || '未記録'}
- 写真の枚数: ${photoCount} 枚

【本人の走り書きメモ】:
${memo || '（メモなし。アクティビティデータから一般的な振り返りの骨子を作成してください）'}
`;

  const result = await callGemini(prompt, sys);

  // バックアップ
  if (memo) {
    fs.writeFileSync(path.join(draftDir, 'memo.md.bak'), memo);
  }

  fs.writeFileSync(memoFile, result + '\n');
  console.log(`✨ drafts/${slug}/memo.md を更新しました！`);
  console.log(`👉 内容を確認して問題なければ、以下を実行して記事を結合してください:`);
  console.log(`   npm run compose -- ${slug}`);
}

// ---------------------------------------------------------------------------
// 2. 既存Markdown記事・読書ログの成形・推敲 (src/content/...)
// ---------------------------------------------------------------------------
async function formatFile(targetPath) {
  const file = path.isAbsolute(targetPath) ? targetPath : path.join(ROOT, targetPath);
  if (!fs.existsSync(file)) {
    console.error(`ファイルが見つかりません: ${targetPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(file, 'utf8');
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);

  if (!match) {
    console.error(`有効な Frontmatter 付き Markdown ファイルではありません: ${targetPath}`);
    process.exit(1);
  }

  const frontmatter = match[1];
  const body = match[2].trim();

  const isBook = file.includes('books');

  const sys = isBook
    ? `あなたは読書家のアウトドア愛好家です。提供された読書ログのMarkdownを推敲・成形してください。
- 文体は落ち着いた常体（「〜だ」「〜である」）。
- 本の概要、特に印象に残った点、自分の行動や考え方にどう影響したか、をわかりやすい見出し付きで整理する。
- Frontmatter (--- で囲まれた部分) も必要に応じて description や tags、quote を補強・改善して出力に含めてください。
- 全体を完全な Markdown として出力してください。`
    : `あなたは登山・ランニング・アウトドアを愛する個人ブロガーです。提供されたブログ記事のMarkdownを推敲・成形してください。
- 雑なメモや走り書きを、読みやすく生き生きとしたブログ記事に整えます。
- 臨場感のある常体（だ・である調）。見出し構成（##）を整える。
- Frontmatter (--- で囲まれた部分) の description（120字以内の要約）や tags も本文に合わせて最適化してください。
- 全体を完全な Markdown として出力してください。`;

  const prompt = `以下の記事を推敲・成形してください:\n\n${raw}`;

  const result = await callGemini(prompt, sys);

  // バックアップ作成
  fs.writeFileSync(`${file}.bak`, raw);
  fs.writeFileSync(file, result + '\n');

  console.log(`✨ ファイルを更新しました: ${path.relative(ROOT, file)} (バックアップ: .bak)`);
}

// ---------------------------------------------------------------------------
// 3. 走り書きから新規記事を作成
// ---------------------------------------------------------------------------
async function createNewArticle(text, category = 'misc') {
  const sys = `あなたは登山、ランニング、トレイルランニング、ボルダリングの個人ブロガーです。
短いひとことメモから、魅力的なブログ記事の Markdown を1件生成してください。

出力形式:
---
title: "記事のタイトル"
description: "記事の短い要約（80〜120字）"
date: "ISO形式日時"
category: ${category}
kind: article
tags: ["タグ1", "タグ2"]
draft: false
---

## 見出し
本文...
`;

  const prompt = `以下のメモから記事を生成してください:
カテゴリ: ${category}
メモ内容: ${text}`;

  const result = await callGemini(prompt, sys);

  const now = new Date();
  const ymd = now.toISOString().slice(0, 10);
  const slug = `${ymd}-${category}-${Date.now().toString().slice(-4)}`;
  const outFile = path.join(ROOT, 'src/content/posts', `${slug}.md`);

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, result + '\n');

  console.log(`✨ 新しい記事を作成しました: src/content/posts/${slug}.md`);
}

// ---------------------------------------------------------------------------
// CLI ルーティング
// ---------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    console.log(`
🤖 AI 記事成形コマンド (Trail & Chalk AI Assistant)

使い方:
  npm run ai -- draft <slug>       # 下書き (drafts/<slug>) のメモをGPSデータと共に成形
  npm run ai -- file <ファイルパス>  # 既存の投稿や読書メモ (.md) を推敲・ブラッシュアップ
  npm run ai -- new "走ったメモ..." # ひとことメモから新しい記事を一発生成

例:
  npm run ai -- draft 2026-10-22-tanzawa
  npm run ai -- file src/content/posts/welcome.md
  npm run ai -- file src/content/books/born-to-run.md
  npm run ai -- new "高尾山から陣馬山まで朝トレラン。雲海が最高だった" --category trail
`);
    return;
  }

  if (command === 'draft') {
    const slug = args[1];
    if (!slug) {
      console.error('下書きの slug を指定してください。例: npm run ai -- draft 2026-10-22-tanzawa');
      process.exit(1);
    }
    await formatDraft(slug);
  } else if (command === 'file' || command.endsWith('.md')) {
    const file = command === 'file' ? args[1] : command;
    if (!file) {
      console.error('ファイルパスを指定してください。例: npm run ai -- file src/content/posts/example.md');
      process.exit(1);
    }
    await formatFile(file);
  } else if (command === 'new') {
    const text = args[1];
    if (!text) {
      console.error('メモ内容を指定してください。例: npm run ai -- new "メモ内容..."');
      process.exit(1);
    }
    const catIdx = args.indexOf('--category');
    const category = catIdx >= 0 ? args[catIdx + 1] : 'misc';
    await createNewArticle(text, category);
  } else {
    // 引数が直接ファイルやdraftのslugの可能性を判定
    const draftPath = path.join(ROOT, 'drafts', command);
    if (fs.existsSync(draftPath)) {
      await formatDraft(command);
    } else if (fs.existsSync(command) || fs.existsSync(path.join(ROOT, command))) {
      await formatFile(command);
    } else {
      console.error(`不明なコマンドまたは対象が見つかりません: ${command}`);
      console.log('ヘルプを確認: npm run ai -- --help');
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error('実行時エラー:', err);
  process.exit(1);
});
