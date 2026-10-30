#!/usr/bin/env node
/**
 * 4. すべてを結合して記事を生成 (Compose)
 *
 * 使い方:
 *   npm run compose -- <slug> [--publish]
 *   npm run compose -- --all
 *
 * drafts/<slug>/ にある各パーツを結合し、以下を生成・配置します:
 *   - src/content/posts/<slug>.md  (記事Markdown)
 *   - public/routes/<slug>.json    (Leaflet用ルートデータ)
 *   - src/assets/posts/<slug>/     (写真ディレクトリ)
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const DRAFTS_DIR = path.join(ROOT, 'drafts');
const POSTS_DIR = path.join(ROOT, 'src/content/posts');
const ROUTES_DIR = path.join(ROOT, 'public/routes');
const ASSETS_POSTS_DIR = path.join(ROOT, 'src/assets/posts');

const argv = process.argv.slice(2);
const isAll = argv.includes('--all');
const isDraft = argv.includes('--draft');
const useAi = argv.includes('--ai');
const slugArg = argv.find((a) => !a.startsWith('--'));

if (!slugArg && !isAll) {
  console.log(`使い方:
  npm run compose -- <slug> [--publish] [--ai]
  npm run compose -- --all [--ai]

※ drafts/ 内のログ、写真、メモを結合して正式な記事を生成します。
  --ai を付けると、結合前に AI が memo.md を自動成形します。
`);
  process.exit(1);
}

const CAT = {
  hike: { label: '登山', tags: ['登山'] },
  run: { label: 'ランニング', tags: ['ランニング'] },
  trail: { label: 'トレラン', tags: ['トレイルランニング'] },
  boulder: { label: 'ボルダリング', tags: ['ボルダリング'] },
  misc: { label: '雑記', tags: [] },
};

function hm(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function pace(sec, km) {
  if (!sec || !km) return undefined;
  const p = sec / km;
  return `${Math.floor(p / 60)}'${String(Math.round(p % 60)).padStart(2, '0')}"/km`;
}

function composeOne(slug) {
  const draftDir = path.join(DRAFTS_DIR, slug);
  if (!fs.existsSync(draftDir)) {
    console.error(`下書きが見つかりません: drafts/${slug}`);
    return;
  }

  // --ai が指定されている場合は事前にAIで memo.md を成形
  if (useAi) {
    try {
      execSync(`node "${path.join(ROOT, 'scripts/ai.mjs')}" draft "${slug}"`, { stdio: 'inherit' });
    } catch (e) {
      console.warn('⚠ AI成形の実行中にエラーが発生しました（スキップします）:', e.message);
    }
  }

  // 1. activity.json (GPSログ)
  const actFile = path.join(draftDir, 'activity.json');
  const activity = fs.existsSync(actFile) ? JSON.parse(fs.readFileSync(actFile, 'utf8')) : null;

  // 2. route.json (ルート座標)
  const routeFile = path.join(draftDir, 'route.json');
  let hasRoute = false;
  if (fs.existsSync(routeFile)) {
    fs.mkdirSync(ROUTES_DIR, { recursive: true });
    fs.copyFileSync(routeFile, path.join(ROUTES_DIR, `${slug}.json`));
    hasRoute = true;
  }

  // 3. photos/ (写真)
  const photosDir = path.join(draftDir, 'photos');
  let hasPhotos = false;
  if (fs.existsSync(photosDir)) {
    const files = fs.readdirSync(photosDir);
    if (files.length > 0) {
      const targetPhotoDir = path.join(ASSETS_POSTS_DIR, slug);
      fs.mkdirSync(targetPhotoDir, { recursive: true });
      for (const f of files) {
        fs.copyFileSync(path.join(photosDir, f), path.join(targetPhotoDir, f));
      }
      hasPhotos = true;
    }
  }

  // 4. memo.md (メモ)
  const memoFile = path.join(draftDir, 'memo.md');
  const memoContent = fs.existsSync(memoFile) ? fs.readFileSync(memoFile, 'utf8').trim() : '';

  // メタデータ構築
  const title = activity?.title || `${slug} の記録`;
  const category = activity?.category || 'misc';
  const date = activity?.date ? new Date(activity.date) : new Date();
  const descParts = [];
  if (CAT[category]) descParts.push(CAT[category].label);
  if (activity?.distanceKm) descParts.push(`${activity.distanceKm}km`);
  if (activity?.elevationGainM) descParts.push(`↑${activity.elevationGainM}m`);
  if (activity?.location) descParts.push(activity.location);

  // Markdown 生成
  const frontmatter = [
    '---',
    `title: ${JSON.stringify(title)}`,
    `description: ${JSON.stringify(descParts.join('｜'))}`,
    `date: ${date.toISOString()}`,
    `category: ${category}`,
    `kind: log`,
    `tags: ${JSON.stringify(CAT[category]?.tags || [])}`,
    `draft: ${isDraft ? 'true' : 'false'}`,
  ];

  if (activity) {
    frontmatter.push('activity:');
    if (activity.location) frontmatter.push(`  location: ${JSON.stringify(activity.location)}`);
    frontmatter.push(`  distanceKm: ${activity.distanceKm}`);
    frontmatter.push(`  elevationGainM: ${activity.elevationGainM}`);
    frontmatter.push(`  elevationLossM: ${activity.elevationLossM}`);
    if (activity.maxElevationM != null) frontmatter.push(`  maxElevationM: ${activity.maxElevationM}`);
    if (activity.movingTime) frontmatter.push(`  movingTime: "${activity.movingTime}"`);
    if (activity.elapsedTime) frontmatter.push(`  elapsedTime: "${activity.elapsedTime}"`);
    if (activity.pace) frontmatter.push(`  pace: ${JSON.stringify(activity.pace)}`);
    if (hasRoute) frontmatter.push(`  route: /routes/${slug}.json`);
  }
  frontmatter.push('---', '');

  // 本文組み立て（客観的事実ログ ＋ ユーザーのメモ）
  const body = [];

  // 行程ログ（客観）
  if (activity?.startTime || activity?.endTime || activity?.maxElevationM) {
    body.push('## 行程ログ');
    if (activity.startTime) body.push(`- スタート: ${hm(activity.startTime)}`);
    if (activity.maxElevationM != null) {
      body.push(`- 最高地点 (${activity.maxElevationM} m): ${hm(activity.maxEleTime)}`);
    }
    if (activity.endTime) body.push(`- ゴール: ${hm(activity.endTime)}`);
    body.push('');
  }

  // スプリット表（客観）
  if (category !== 'hike' && activity?.splits && activity.splits.length > 1) {
    body.push('## スプリットログ', '', '| km | ペース | 標高差 |', '|---|---|---|');
    for (const s of activity.splits) {
      body.push(`| ${s.km} | ${pace(s.sec, s.dist) ?? '—'} | ${s.dEle != null ? (s.dEle >= 0 ? '+' : '') + s.dEle + ' m' : '—'} |`);
    }
    body.push('');
  }

  // ユーザーメモ（主観：感想・ギア・補給・気づき）
  if (memoContent) {
    body.push(memoContent);
  }

  fs.mkdirSync(POSTS_DIR, { recursive: true });
  const postFile = path.join(POSTS_DIR, `${slug}.md`);
  fs.writeFileSync(postFile, frontmatter.join('\n') + '\n' + body.join('\n') + '\n');

  console.log(`✨ 記事を結合生成しました: src/content/posts/${slug}.md`);
  if (hasRoute) console.log(`   └─ ルートデータ: public/routes/${slug}.json`);
  if (hasPhotos) console.log(`   └─ 写真配置:     src/assets/posts/${slug}/`);
}

const targets = isAll
  ? fs.readdirSync(DRAFTS_DIR).filter((f) => fs.statSync(path.join(DRAFTS_DIR, f)).isDirectory())
  : [slugArg];

for (const s of targets) {
  composeOne(s);
}
console.log('\n✔ 完了！ `npm run dev` または `npm run preview` で確認できます。');
