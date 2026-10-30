#!/usr/bin/env node
/**
 * IssueOps ハンドラ: GitHub Issue（Issue Forms）からコンテンツを生成する
 *
 * GitHub Actions（.github/workflows/issue-ops.yml）から呼ばれる想定。
 * ラベルで処理を切り替える:
 *   type:book    → 読書ログ   src/content/books/<slug>.md（＋書影）
 *   type:note    → つぶやき   src/content/notes/<id>.md（＋public/notes/<id>/ に画像）
 *   type:article → 記事       src/content/posts/<slug>.md（＋src/assets/issues/<slug>/ に画像）
 *
 * ローカルでの動作確認:
 *   node scripts/issue-handler.mjs --event path/to/event.json [--dry-run]
 *   （event.json は { "issue": { number, title, body, labels: [{name}], created_at } } の形）
 *
 * 環境変数:
 *   GITHUB_EVENT_PATH   Actions が自動設定
 *   ATTACHMENT_TOKEN    添付画像のダウンロード用（非公開リポジトリ向け。省略時は GITHUB_TOKEN）
 *   GEMINI_API_KEY      AI成形を使う場合
 *   GITHUB_OUTPUT       結果（PRタイトル・本文ファイル）の出力先
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { lookupBook, downloadCover, slugify } from './lib/books.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const DRY = argv.includes('--dry-run');

const CATEGORY_KEYS = ['hike', 'run', 'trail', 'boulder', 'misc'];
const warnings = [];
const created = [];

// ---------------------------------------------------------------------------
// 入力
// ---------------------------------------------------------------------------
const eventPath = opt('--event') || process.env.GITHUB_EVENT_PATH;
if (!eventPath || !fs.existsSync(eventPath)) {
  console.error('イベントファイルが見つかりません（--event <path> か GITHUB_EVENT_PATH を指定）');
  process.exit(1);
}
const issue = JSON.parse(fs.readFileSync(eventPath, 'utf8').replace(/^\uFEFF/, '')).issue;
const labels = (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name));
const type = labels.find((l) => l.startsWith('type:'))?.slice(5);
const issueTitle = (issue.title || '').replace(/^\[\w+\]\s*/, '').trim();

/** Issue Forms のラベル（.github/ISSUE_TEMPLATE/*.yml の label と一致させること） */
const FORM_LABELS = new Set([
  'ISBN', 'タイトル（ISBNがない・見つからない場合）', 'ステータス', '評価', '印象に残った一文', '感想・メモ',
  '本文', 'タグ', 'タイトル', 'カテゴリ', '概要', 'スラッグ（任意）', 'オプション',
]);

/** Issue Forms の本文（### 見出し + 値）をパース。本文中の ### 見出しを誤認しないよう既知ラベルだけで区切る */
function parseForm(body = '') {
  const out = {};
  let key = null;
  let buf = [];
  const flush = () => {
    if (key == null) return;
    const v = buf.join('\n').trim();
    out[key] = v === '_No response_' || v === 'None' ? '' : v;
  };
  for (const line of body.replace(/\r\n/g, '\n').split('\n')) {
    const m = line.match(/^### (.+?)\s*$/);
    if (m && FORM_LABELS.has(m[1])) {
      flush();
      key = m[1];
      buf = [];
    } else if (key != null) {
      buf.push(line);
    }
  }
  flush();
  return out;
}
const form = parseForm(issue.body || '');
const isForm = Object.keys(form).length > 0;
const field = (...keys) => keys.map((k) => form[k]).find((v) => v) || '';
/** "read — 読了" → "read" */
const choice = (v) => (v || '').split(/\s/)[0];
const checked = (v, label) => new RegExp(`- \\[x\\]\\s*${label}`, 'i').test(v || '');
const parseTags = (v) => (v || '').split(/[,、\s]+/).map((t) => t.replace(/^#/, '').trim()).filter(Boolean);

// ---------------------------------------------------------------------------
// 日付（Actions は UTC で動くので JST に寄せる）
// ---------------------------------------------------------------------------
const created_at = issue.created_at ? new Date(issue.created_at) : new Date();
const jst = (d) => new Date(d.getTime() + 9 * 3600e3);
const YMD = jst(created_at).toISOString().slice(0, 10);
const HHMM = jst(created_at).toISOString().slice(11, 16).replace(':', '');
const ISO = jst(created_at).toISOString().replace(/\.\d+Z$/, '+09:00');

// ---------------------------------------------------------------------------
// 添付画像
// ---------------------------------------------------------------------------
const IMG_RE = /!\[[^\]]*\]\((https:\/\/[^)\s]+)\)|<img\b[^>]*?\bsrc=["'](https:\/\/[^"']+)["'][^>]*>/gi;
const isAttachment = (u) => /github\.com\/user-attachments\/|githubusercontent\.com\//.test(u);

/** 本文中の画像を抽出し、ダウンロード → 長辺1600pxのJPEGに変換（EXIFは除去） */
async function collectImages(text, destDir, prefix = '') {
  const found = [];
  for (const m of text.matchAll(IMG_RE)) {
    const url = m[1] || m[2];
    if (isAttachment(url)) found.push({ raw: m[0], url });
  }
  const token = process.env.ATTACHMENT_TOKEN || process.env.GITHUB_TOKEN;
  const results = [];
  let n = 0;
  for (const f of found) {
    n++;
    const name = `${prefix}${String(n).padStart(2, '0')}.jpg`;
    try {
      let res = await fetch(f.url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok && token) res = await fetch(f.url); // 公開リポジトリでトークンが邪魔をする場合
      const ct = res.headers.get('content-type') || '';
      if (!res.ok || !ct.startsWith('image/')) throw new Error(`HTTP ${res.status} ${ct}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (!DRY) {
        fs.mkdirSync(destDir, { recursive: true });
        await sharp(buf)
          .rotate()
          .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 82, mozjpeg: true })
          .toFile(path.join(destDir, name));
        created.push(path.relative(ROOT, path.join(destDir, name)));
      }
      results.push({ ...f, name, ok: true });
    } catch (e) {
      warnings.push(`画像をダウンロードできませんでした（${e.message}）: ${f.url}`);
      results.push({ ...f, name, ok: false });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// 共通
// ---------------------------------------------------------------------------
const y = (v) => JSON.stringify(v ?? '');

function writeFile(abs, content) {
  if (DRY) {
    console.log(`\n----- ${path.relative(ROOT, abs)} (dry-run) -----\n${content}`);
  } else {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  created.push(path.relative(ROOT, abs));
}

function runAI(abs) {
  if (DRY) return console.log('（dry-run: AI成形はスキップ）');
  if (!process.env.GEMINI_API_KEY) {
    warnings.push('AI成形が指定されましたが、GEMINI_API_KEY が未設定のためスキップしました。');
    return;
  }
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/ai.mjs'), 'file', abs], { stdio: 'inherit', cwd: ROOT });
  if (r.status !== 0) warnings.push('AI成形に失敗したため、入力内容のまま作成しました。');
  fs.rmSync(`${abs}.bak`, { force: true });
}

// ---------------------------------------------------------------------------
// type:note
// ---------------------------------------------------------------------------
async function handleNote() {
  let text = isForm ? field('本文') : (issue.body || '');
  const tags = parseTags(field('タグ'));
  const id = `${YMD}-${HHMM}-issue${issue.number}`;

  const imgs = await collectImages(text, path.join(ROOT, 'public/notes', id));
  for (const im of imgs) text = text.replace(im.raw, '');
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  if (!text && imgs.length === 0) throw new Error('本文が空です');

  const images = imgs.filter((i) => i.ok).map((i) => `/notes/${id}/${i.name}`);
  const fm = ['---', `date: ${ISO}`, `tags: ${JSON.stringify(tags)}`, 'source: local'];
  if (images.length) fm.push(`images: ${JSON.stringify(images)}`);
  fm.push('---', '');
  writeFile(path.join(ROOT, 'src/content/notes', `${id}.md`), `${fm.join('\n')}\n${text}\n`);

  const head = text.split('\n')[0].slice(0, 40);
  return { title: `つぶやき: ${head || '（写真）'}`, summary: `つぶやき \`${id}\`${images.length ? `（画像 ${images.length} 枚）` : ''}` };
}

// ---------------------------------------------------------------------------
// type:book
// ---------------------------------------------------------------------------
async function handleBook() {
  const isbn = field('ISBN').replace(/[^0-9X]/gi, '');
  const manualTitle = field('タイトル（ISBNがない・見つからない場合）') || (isForm ? '' : issueTitle);
  const status = choice(field('ステータス')) || 'read';
  if (!['read', 'reading', 'want'].includes(status)) throw new Error(`不明なステータス: ${status}`);
  const ratingRaw = Number(choice(field('評価')));
  const rating = Number.isFinite(ratingRaw) && ratingRaw > 0 ? ratingRaw : undefined;
  const quote = field('印象に残った一文');
  const tags = parseTags(field('タグ'));
  const comment = field('感想・メモ');
  const useAI = checked(field('オプション'), 'AI');

  let book = { title: manualTitle, author: '', publisher: '', isbn: isbn.length >= 10 ? isbn : '', pages: undefined, coverUrl: '', description: '' };
  if (isbn.length >= 10) {
    const info = await lookupBook(isbn);
    if (info) {
      console.log(`ヒット: 『${info.title}』`);
      book = { ...book, ...info };
    } else {
      console.log('見つかりませんでした');
      warnings.push(`ISBN ${isbn} の書誌情報が見つかりませんでした。著者などは手動で補ってください。`);
    }
  }
  if (!book.title) throw new Error('ISBN で本が見つからず、タイトルも入力されていません');

  const slug = `${YMD}-${slugify(book.title)}`;
  let coverRel = '';
  if (book.coverUrl && !DRY) {
    const coverFile = path.join(ROOT, 'src/assets/books', `${slug}.jpg`);
    if (await downloadCover(book.coverUrl, coverFile)) {
      coverRel = `../../assets/books/${slug}.jpg`;
      created.push(path.relative(ROOT, coverFile));
    } else {
      warnings.push('書影のダウンロードに失敗しました。');
    }
  }

  const fm = ['---', `title: ${y(book.title)}`, `author: ${y(book.author)}`];
  if (book.publisher) fm.push(`publisher: ${y(book.publisher)}`);
  if (book.isbn) fm.push(`isbn: ${y(book.isbn)}`);
  if (book.pages) fm.push(`pages: ${book.pages}`);
  if (coverRel) fm.push(`cover: ${coverRel}`);
  fm.push(`status: ${status}`);
  if (status !== 'want') fm.push(`started: ${YMD}`);
  if (status === 'read') fm.push(`finished: ${YMD}`);
  if (rating) fm.push(`rating: ${rating}`);
  fm.push(`tags: ${JSON.stringify(tags)}`);
  fm.push(`quote: ${y(quote)}`);
  fm.push('---', '');

  const body = [
    book.description ? `<!-- ${book.description.replace(/\n+/g, ' ').replace(/-->/g, '')} -->\n` : '',
    '## 感想・読書メモ',
    '',
    comment,
    '',
  ].join('\n');

  const abs = path.join(ROOT, 'src/content/books', `${slug}.md`);
  writeFile(abs, fm.join('\n') + body);
  if (useAI && comment) runAI(abs);

  return { title: `読書ログ: 『${book.title}』`, summary: `読書ログ \`${slug}\`（${status}${rating ? ` / ★${rating}` : ''}${useAI ? ' / AI成形' : ''}）` };
}

// ---------------------------------------------------------------------------
// type:article
// ---------------------------------------------------------------------------
async function handleArticle() {
  const title = field('タイトル') || issueTitle || '無題';
  let category = choice(field('カテゴリ')) || 'misc';
  if (!CATEGORY_KEYS.includes(category)) {
    warnings.push(`不明なカテゴリ「${category}」のため misc にしました。`);
    category = 'misc';
  }
  const tags = parseTags(field('タグ'));
  const description = field('概要');
  const slugIn = field('スラッグ（任意）').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  const slug = slugIn || `${YMD}-${category}-${issue.number}`;
  let text = isForm ? field('本文') : (issue.body || '');
  const useAI = checked(field('オプション'), 'AI');
  if (!text.trim()) throw new Error('本文が空です');

  // 写真は src/assets/issues/<slug>/ に置き、本文中の位置にそのまま埋め込む（Astro が最適化）
  const imgs = await collectImages(text, path.join(ROOT, 'src/assets/issues', slug));
  for (const im of imgs) {
    text = text.replace(im.raw, im.ok ? `![](../../assets/issues/${slug}/${im.name})` : '');
  }
  const firstImg = imgs.find((i) => i.ok);

  const fm = [
    '---',
    `title: ${y(title)}`,
    `description: ${y(description)}`,
    `date: ${ISO}`,
    `category: ${category}`,
    'kind: article',
    `tags: ${JSON.stringify(tags)}`,
  ];
  if (firstImg) fm.push(`cover: ../../assets/issues/${slug}/${firstImg.name}`);
  fm.push('draft: false', '---', '');

  const abs = path.join(ROOT, 'src/content/posts', `${slug}.md`);
  writeFile(abs, `${fm.join('\n')}\n${text.trim()}\n`);
  if (useAI) runAI(abs);

  return { title: `記事: ${title}`, summary: `記事 \`${slug}\`（${category}${imgs.length ? ` / 画像 ${imgs.filter((i) => i.ok).length} 枚` : ''}${useAI ? ' / AI成形' : ''}）` };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
const HANDLERS = { note: handleNote, book: handleBook, article: handleArticle };

async function main() {
  const handler = HANDLERS[type];
  if (!handler) throw new Error(`対応する type ラベルがありません（labels: ${labels.join(', ') || 'なし'}）`);
  console.log(`▶ Issue #${issue.number} を type:${type} として処理します`);
  const r = await handler();

  const body = [
    `Issue #${issue.number} から自動生成しました。`,
    '',
    `- ${r.summary}`,
    '',
    '### 生成ファイル',
    ...[...new Set(created)].map((f) => `- \`${f.replace(/\\/g, '/')}\``),
    ...(warnings.length ? ['', '### ⚠ 注意', ...warnings.map((w) => `- ${w}`)] : []),
    '',
    '修正したいときは、Issue に再度自分をアサイン → 編集 → アサインを外すと、この PR が更新されます。',
    '',
    `Closes #${issue.number}`,
    '',
  ].join('\n');

  const bodyFile = path.join(process.env.RUNNER_TEMP || os.tmpdir(), `issueops-${issue.number}.md`);
  fs.writeFileSync(bodyFile, body);
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `title=${r.title.replace(/\r?\n/g, ' ')}\nbody_path=${bodyFile}\n`);
  }
  console.log(`\n✨ ${r.title}\n${body}`);
}

main().catch((e) => {
  console.error(`❌ ${e.message}`);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `error=${e.message.replace(/\r?\n/g, ' ')}\n`);
  process.exit(1);
});
