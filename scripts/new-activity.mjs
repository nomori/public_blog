#!/usr/bin/env node
/**
 * GPX → 記事下書き 自動生成
 *
 * 使い方:
 *   npm run activity -- path/to/file.gpx [options]
 *   npm run activity -- --inbox            # inbox/ 内のGPXを一括処理（処理後 inbox/done/ へ移動）
 *
 * options:
 *   --category hike|run|trail   (省略時は平均速度と獲得標高から自動推定)
 *   --title "タイトル"           (省略時は自動)
 *   --location "丹沢・塔ノ岳"     (省略時は逆ジオコーディングで推定)
 *   --memo "感想メモ"            (本文生成のヒント)
 *   --ai                         (GEMINI_API_KEY があれば本文をAIで下書き)
 *   --publish                    (draft: false で出力)
 */
import fs from 'node:fs';
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { filterPrivacyPoints } from './lib/privacy.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const POSTS_DIR = path.join(ROOT, 'src/content/posts');
const ROUTES_DIR = path.join(ROOT, 'public/routes');
const INBOX = path.join(ROOT, 'inbox');

// ---------- args ----------
const argv = process.argv.slice(2);
const opt = { _: [] };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    const k = a.slice(2);
    const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    opt[k] = v;
  } else opt._.push(a);
}

// .env（任意）
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const CAT = {
  hike: { label: '登山', tags: ['登山'] },
  run: { label: 'ランニング', tags: ['ランニング'] },
  trail: { label: 'トレラン', tags: ['トレイルランニング'] },
};

// ---------- GPX ----------
function parseGpx(file) {
  const xml = fs.readFileSync(file, 'utf8');
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', isArray: (n) => ['trk', 'trkseg', 'trkpt', 'rte', 'rtept'].includes(n) });
  const g = parser.parse(xml).gpx;
  const name = g?.metadata?.name ?? g?.trk?.[0]?.name;
  const raw = [];
  for (const trk of g.trk ?? []) for (const seg of trk.trkseg ?? []) for (const p of seg.trkpt ?? []) raw.push(p);
  if (!raw.length) for (const r of g.rte ?? []) for (const p of r.rtept ?? []) raw.push(p);
  const rawPts = raw.map((p) => ({
    lat: +p.lat, lon: +p.lon,
    ele: p.ele != null ? +p.ele : null,
    t: p.time ? new Date(p.time) : null,
  })).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  const pts = filterPrivacyPoints(rawPts, ROOT);
  if (pts.length < 2) throw new Error('プライバシー除外後のトラックポイントが2点未満です: ' + file);
  return { name: typeof name === 'string' ? name : undefined, pts };
}

const R = 6371008.8;
const rad = (d) => (d * Math.PI) / 180;
function hav(a, b) {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function analyze(pts) {
  let dist = 0, moving = 0, gain = 0, loss = 0;
  // 標高はノイズ除去のため移動平均＋ヒステリシス
  const ele = pts.map((p) => p.ele);
  const smooth = ele.map((_, i) => {
    const w = ele.slice(Math.max(0, i - 2), i + 3).filter((e) => e != null);
    return w.length ? w.reduce((s, e) => s + e, 0) / w.length : null;
  });
  let ref = smooth.find((e) => e != null) ?? null;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    const d = hav(pts[i - 1], pts[i]);
    dist += d;
    cum.push(dist);
    const a = pts[i - 1].t, b = pts[i].t;
    if (a && b) {
      const dt = (b - a) / 1000;
      if (dt > 0 && dt < 300 && d / dt > 0.3) moving += dt;
    }
    if (smooth[i] != null && ref != null) {
      const diff = smooth[i] - ref;
      if (diff >= 3) { gain += diff; ref = smooth[i]; }
      else if (diff <= -3) { loss -= diff; ref = smooth[i]; }
    }
  }
  const valid = ele.filter((e) => e != null);
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
  const elapsed = t0 && t1 ? (t1 - t0) / 1000 : 0;
  let maxIdx = 0;
  ele.forEach((e, i) => { if (e != null && e > (ele[maxIdx] ?? -Infinity)) maxIdx = i; });

  // 1kmスプリット
  const splits = [];
  let next = 1000, lastIdx = 0;
  for (let i = 1; i < pts.length; i++) {
    if (cum[i] >= next || i === pts.length - 1) {
      const a = pts[lastIdx], b = pts[i];
      splits.push({
        km: splits.length + 1,
        dist: (cum[i] - cum[lastIdx]) / 1000,
        sec: a.t && b.t ? (b.t - a.t) / 1000 : null,
        dEle: a.ele != null && b.ele != null ? b.ele - a.ele : null,
      });
      lastIdx = i; next += 1000;
    }
  }
  return {
    distKm: dist / 1000, cum, gain, loss, moving, elapsed,
    maxEle: valid.length ? Math.max(...valid) : null,
    minEle: valid.length ? Math.min(...valid) : null,
    maxIdx, start: t0, end: t1, splits,
  };
}

const hms = (s) => {
  if (!s) return undefined;
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
};
const pace = (sec, km) => {
  if (!sec || !km) return undefined;
  const p = sec / km;
  return `${Math.floor(p / 60)}'${String(Math.round(p % 60)).padStart(2, '0')}"/km`;
};
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hm = (d) => d ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '—';

function guessCategory(a) {
  const kmh = a.moving ? a.distKm / (a.moving / 3600) : 0;
  const upPerKm = a.distKm ? a.gain / a.distKm : 0;
  if (upPerKm < 25 && kmh > 6) return 'run';
  if (kmh > 5.5) return 'trail';
  return 'hike';
}

async function reverseGeocode(lat, lon) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=12&accept-language=ja`;
    const r = await fetch(url, { headers: { 'User-Agent': 'trail-and-chalk-blog/0.1' } });
    if (!r.ok) return undefined;
    const j = await r.json();
    const ad = j.address ?? {};
    return [ad.state ?? ad.province, ad.city ?? ad.town ?? ad.village ?? ad.county].filter(Boolean).join(' ') || undefined;
  } catch { return undefined; }
}

function downsample(pts, cum, max = 600) {
  const step = Math.max(1, Math.ceil(pts.length / max));
  const out = [];
  for (let i = 0; i < pts.length; i += step) out.push(i);
  if (out[out.length - 1] !== pts.length - 1) out.push(pts.length - 1);
  // [lat, lon, ele, distKm, epochSec|null]
  return out.map((i) => [+pts[i].lat.toFixed(5), +pts[i].lon.toFixed(5), pts[i].ele != null ? Math.round(pts[i].ele) : null, +(cum[i] / 1000).toFixed(3), pts[i].t ? Math.round(pts[i].t / 1000) : null]);
}

// ---------- 本文 ----------
function templateBody({ category, a, location, memo }) {
  const lines = [];
  const where = location ? `${location}にて、` : '';
  lines.push(`${where}${CAT[category].label}の記録。距離 ${a.distKm.toFixed(1)} km、獲得標高 ${Math.round(a.gain)} m${a.moving ? `、行動時間 ${hms(a.moving)}` : ''}。`);
  lines.push('');
  if (memo) { lines.push(`> ${memo}`); lines.push(''); }
  lines.push('## 行程', '');
  lines.push(`- スタート：${hm(a.start)}`);
  if (a.maxEle != null) lines.push(`- 最高地点（${Math.round(a.maxEle)} m）：${hm(a.ptsMaxTime)}`);
  lines.push(`- ゴール：${hm(a.end)}`, '');
  if (category !== 'hike' && a.splits.length > 1) {
    lines.push('## スプリット', '', '| km | ペース | 標高差 |', '|---|---|---|');
    for (const s of a.splits) lines.push(`| ${s.km} | ${pace(s.sec, s.dist) ?? '—'} | ${s.dEle != null ? (s.dEle >= 0 ? '+' : '') + Math.round(s.dEle) + ' m' : '—'} |`);
    lines.push('');
  }
  lines.push('## 振り返り', '', '<!-- ここに感想・コンディション・装備・補給などを書く -->', '');
  lines.push('## 装備・補給', '', '- ', '');
  return lines.join('\n');
}

async function aiBody(ctx) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) { console.warn('⚠ GEMINI_API_KEY が未設定のためテンプレートで生成します'); return null; }
  const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
  const { category, a, location, memo } = ctx;
  const splits = a.splits.map((s) => `${s.km}km: ${pace(s.sec, s.dist) ?? '-'} / 標高差${s.dEle != null ? Math.round(s.dEle) : '-'}m`).join('\n');
  const prompt = `あなたは山とランニングが好きな個人ブロガーです。以下のGPS記録をもとに、日本語でブログ記事の本文をMarkdownで下書きしてください。
- 見出しは ## から。「行程」「振り返り」「装備・補給」を含める
- 事実（数値）は記録に基づき、推測は「〜だったはず」等ぼかす。誇張しない
- 文体は落ち着いた常体（だ・である）、全体で600〜1000字
- 本人が後で追記しやすいよう、感想部分には <!-- TODO --> コメントを残す

種別: ${CAT[category].label}
場所: ${location ?? '不明'}
日付: ${a.start ? ymd(a.start) : '不明'} ${hm(a.start)}〜${hm(a.end)}
距離: ${a.distKm.toFixed(2)} km / 獲得標高 +${Math.round(a.gain)} m / -${Math.round(a.loss)} m
最高標高: ${a.maxEle != null ? Math.round(a.maxEle) : '-'} m / 最低標高: ${a.minEle != null ? Math.round(a.minEle) : '-'} m
行動時間: ${hms(a.moving) ?? '-'} / 経過時間: ${hms(a.elapsed) ?? '-'}
本人メモ: ${memo ?? 'なし'}
1kmスプリット:
${splits}`;
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    const j = await r.json();
    const text = j?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
    if (!text) throw new Error(JSON.stringify(j).slice(0, 300));
    return text.replace(/^```(?:markdown)?\s*|\s*```$/g, '').trim() + '\n';
  } catch (e) {
    console.warn('⚠ AI生成に失敗したためテンプレートで生成します:', e.message);
    return null;
  }
}

// ---------- main ----------
async function processFile(file) {
  const { name, pts } = parseGpx(file);
  const a = analyze(pts);
  a.ptsMaxTime = pts[a.maxIdx]?.t ?? null;
  const category = opt.category && CAT[opt.category] ? opt.category : guessCategory(a);
  const date = a.start ?? new Date(fs.statSync(file).mtime);
  const location = typeof opt.location === 'string' ? opt.location : await reverseGeocode(pts[a.maxIdx].lat, pts[a.maxIdx].lon);
  const memo = typeof opt.memo === 'string' ? opt.memo : undefined;
  const title = typeof opt.title === 'string' ? opt.title
    : name ?? `${location ? location.split(' ').pop() + 'で' : ''}${CAT[category].label} ${a.distKm.toFixed(1)}km`;

  let slug = typeof opt.slug === 'string' ? opt.slug : `${ymd(date)}-${category}`;
  let n = 2;
  while (fs.existsSync(path.join(POSTS_DIR, `${slug}.md`))) slug = `${slug.replace(/-\d+$/, '')}-${n++}`;

  fs.mkdirSync(ROUTES_DIR, { recursive: true });
  fs.writeFileSync(path.join(ROUTES_DIR, `${slug}.json`), JSON.stringify({ points: downsample(pts, a.cum) }));

  const ctx = { category, a, location, memo };
  const body = (opt.ai && (await aiBody(ctx))) || templateBody(ctx);
  const isRun = category !== 'hike';
  const fm = [
    '---',
    `title: ${JSON.stringify(title)}`,
    `description: ${JSON.stringify(`${CAT[category].label}｜${a.distKm.toFixed(1)}km・↑${Math.round(a.gain)}m${location ? '・' + location : ''}`)}`,
    `date: ${date.toISOString()}`,
    `category: ${category}`,
    `tags: ${JSON.stringify(CAT[category].tags)}`,
    `draft: ${opt.publish ? 'false' : 'true'}`,
    'activity:',
    location ? `  location: ${JSON.stringify(location)}` : null,
    `  distanceKm: ${+a.distKm.toFixed(2)}`,
    `  elevationGainM: ${Math.round(a.gain)}`,
    `  elevationLossM: ${Math.round(a.loss)}`,
    a.maxEle != null ? `  maxElevationM: ${Math.round(a.maxEle)}` : null,
    a.moving ? `  movingTime: "${hms(a.moving)}"` : null,
    a.elapsed ? `  elapsedTime: "${hms(a.elapsed)}"` : null,
    isRun && a.moving ? `  pace: ${JSON.stringify(pace(a.moving, a.distKm))}` : null,
    `  route: /routes/${slug}.json`,
    '---',
    '',
  ].filter((l) => l !== null).join('\n');

  fs.mkdirSync(POSTS_DIR, { recursive: true });
  const out = path.join(POSTS_DIR, `${slug}.md`);
  fs.writeFileSync(out, fm + body);
  const photoDir = path.join(ROOT, 'src/assets/posts', slug);
  fs.mkdirSync(photoDir, { recursive: true });
  console.log(`📷 写真は ${path.relative(ROOT, photoDir)} に入れる（npm run gphotos -- ${slug} でGoogleフォトから取得）`);
  console.log(`✔ ${path.relative(ROOT, out)}  [${CAT[category].label}] ${a.distKm.toFixed(1)}km ↑${Math.round(a.gain)}m ${hms(a.moving) ?? ''}`);
  return out;
}

const files = [];
if (opt.inbox) {
  fs.mkdirSync(path.join(INBOX, 'done'), { recursive: true });
  for (const f of fs.readdirSync(INBOX)) if (f.toLowerCase().endsWith('.gpx')) files.push(path.join(INBOX, f));
  if (!files.length) console.log('inbox/ にGPXがありません');
} else files.push(...opt._);

if (!files.length && !opt.inbox) {
  console.log('使い方: npm run activity -- <file.gpx> [--category hike|run|trail] [--memo "..."] [--ai]');
  process.exit(1);
}
for (const f of files) {
  try {
    await processFile(f);
    if (opt.inbox) fs.renameSync(f, path.join(INBOX, 'done', path.basename(f)));
  } catch (e) { console.error('✖', f, e.message); }
}
