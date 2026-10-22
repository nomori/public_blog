#!/usr/bin/env node
/**
 * 1. GPXから下書きディレクトリを作成
 *
 * 使い方:
 *   npm run draft:gpx -- path/to/file.gpx [--slug my-hike] [--title "タイトル"] [--category hike|run|trail]
 *
 * 余計なポエムや装飾は入れず、純粋な数値ログ（activity.json）とルート（route.json）だけを保存します。
 */

import fs from 'node:fs';
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const DRAFTS_DIR = path.join(ROOT, 'drafts');

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

const file = opt._[0];
if (!file) {
  console.log(`使い方: npm run draft:gpx -- <file.gpx> [--category hike|run|trail] [--slug 任意slug]`);
  process.exit(1);
}

if (!fs.existsSync(file)) {
  console.error(`ファイルが見つかりません: ${file}`);
  process.exit(1);
}

// GPX パース
const xml = fs.readFileSync(file, 'utf8');
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  isArray: (n) => ['trk', 'trkseg', 'trkpt', 'rte', 'rtept'].includes(n),
});
const g = parser.parse(xml).gpx;
const rawName = g?.metadata?.name ?? g?.trk?.[0]?.name;
const raw = [];
for (const trk of g.trk ?? []) for (const seg of trk.trkseg ?? []) for (const p of seg.trkpt ?? []) raw.push(p);
if (!raw.length) for (const r of g.rte ?? []) for (const p of r.rtept ?? []) raw.push(p);

const pts = raw.map((p) => ({
  lat: +p.lat,
  lon: +p.lon,
  ele: p.ele != null ? +p.ele : null,
  t: p.time ? new Date(p.time) : null,
})).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));

if (pts.length < 2) {
  console.error('トラックポイントが見つかりません');
  process.exit(1);
}

const R = 6371008.8;
const rad = (d) => (d * Math.PI) / 180;
function hav(a, b) {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

let dist = 0, moving = 0, gain = 0, loss = 0;
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

const validEle = ele.filter((e) => e != null);
const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
const elapsed = t0 && t1 ? (t1 - t0) / 1000 : 0;
let maxIdx = 0;
ele.forEach((e, i) => { if (e != null && e > (ele[maxIdx] ?? -Infinity)) maxIdx = i; });

// スプリット
const splits = [];
let next = 1000, lastIdx = 0;
for (let i = 1; i < pts.length; i++) {
  if (cum[i] >= next || i === pts.length - 1) {
    const a = pts[lastIdx], b = pts[i];
    splits.push({
      km: splits.length + 1,
      dist: +((cum[i] - cum[lastIdx]) / 1000).toFixed(2),
      sec: a.t && b.t ? Math.round((b.t - a.t) / 1000) : null,
      dEle: a.ele != null && b.ele != null ? Math.round(b.ele - a.ele) : null,
    });
    lastIdx = i; next += 1000;
  }
}

// 自動カテゴリ判定
const kmh = moving ? (dist / 1000) / (moving / 3600) : 0;
const upPerKm = dist ? gain / (dist / 1000) : 0;
let defaultCat = 'hike';
if (upPerKm < 25 && kmh > 6) defaultCat = 'run';
else if (kmh > 5.5) defaultCat = 'trail';

const category = opt.category || defaultCat;
const date = t0 ?? new Date();
const ymd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const slug = opt.slug || `${ymd}-${category}`;
const draftDir = path.join(DRAFTS_DIR, slug);
fs.mkdirSync(draftDir, { recursive: true });
fs.mkdirSync(path.join(draftDir, 'photos'), { recursive: true });

// ルートダウンサンプリング
const step = Math.max(1, Math.ceil(pts.length / 600));
const routePts = [];
for (let i = 0; i < pts.length; i += step) {
  routePts.push([
    +pts[i].lat.toFixed(5),
    +pts[i].lon.toFixed(5),
    pts[i].ele != null ? Math.round(pts[i].ele) : null,
    +(cum[i] / 1000).toFixed(3),
    pts[i].t ? Math.round(pts[i].t.getTime() / 1000) : null,
  ]);
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

// 逆ジオコーディング（任意）
async function getLoc(lat, lon) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=12&accept-language=ja`;
    const r = await fetch(url, { headers: { 'User-Agent': 'trail-and-chalk-blog/0.1' } });
    if (!r.ok) return undefined;
    const j = await r.json();
    const ad = j.address ?? {};
    return [ad.state ?? ad.province, ad.city ?? ad.town ?? ad.village ?? ad.county].filter(Boolean).join(' ') || undefined;
  } catch { return undefined; }
}

const location = opt.location || (await getLoc(pts[maxIdx].lat, pts[maxIdx].lon));
const title = opt.title || rawName || `${location ? location.split(' ').pop() + ' ' : ''}${category.toUpperCase()} ${(dist / 1000).toFixed(1)}km`;

const activityLog = {
  title,
  date: date.toISOString(),
  category,
  location,
  distanceKm: +(dist / 1000).toFixed(2),
  elevationGainM: Math.round(gain),
  elevationLossM: Math.round(loss),
  maxElevationM: validEle.length ? Math.round(Math.max(...validEle)) : null,
  minElevationM: validEle.length ? Math.round(Math.min(...validEle)) : null,
  movingTime: hms(moving),
  elapsedTime: hms(elapsed),
  pace: category !== 'hike' ? pace(moving, dist / 1000) : undefined,
  startTime: t0 ? t0.toISOString() : undefined,
  endTime: t1 ? t1.toISOString() : undefined,
  maxEleTime: pts[maxIdx].t ? pts[maxIdx].t.toISOString() : undefined,
  splits,
};

// ファイル出力
fs.writeFileSync(path.join(draftDir, 'activity.json'), JSON.stringify(activityLog, null, 2));
fs.writeFileSync(path.join(draftDir, 'route.json'), JSON.stringify({ points: routePts }, null, 2));

// memo.md が無ければ空のテンプレートを作成
const memoPath = path.join(draftDir, 'memo.md');
if (!fs.existsSync(memoPath)) {
  fs.writeFileSync(
    memoPath,
    `## 振り返り\n\n\n\n## 装備・コンディション\n\n- 天気：\n- 補給：\n- 装備：\n`
  );
}

console.log(`
✔ 下書きフォルダを作成しました: drafts/${slug}/
  ├─ activity.json   (客観的なGPSログデータ)
  ├─ route.json      (Leafletルートデータ)
  ├─ memo.md         (感想・メモ用)
  └─ photos/         (写真を保存するフォルダ)

次のステップ:
  - 写真を追加する場合:  npm run draft:photos -- ${slug}
  - メモを書く場合:      drafts/${slug}/memo.md を編集
  - 記事を生成する場合:  npm run compose -- ${slug}
`);
