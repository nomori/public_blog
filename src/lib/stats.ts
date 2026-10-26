/**
 * アクティビティ集計（月別・ヒートマップ・自己ベスト・目標・グレード分布）
 * すべてビルド時に計算される静的データ
 */
import { CATEGORIES, GOALS, type CategoryKey } from '../consts';
import { dayKey, jst, monthKey, type Book, type Post } from './content';

export interface Summary {
  km: number;
  up: number;
  minutes: number;
  count: number; // アクティビティ数（activity または climbing を持つ投稿）
  days: number; // 活動日数
  byCat: Record<CategoryKey, number>;
}

const isActivity = (p: Post) => !!(p.data.activity || p.data.climbing);

/** "3h 36m" / "56m" / "1:23:45" → 分 */
export function parseDuration(s?: string): number {
  if (!s) return 0;
  const hm = s.match(/(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?/);
  if (hm && (hm[1] || hm[2])) return Number(hm[1] ?? 0) * 60 + Number(hm[2] ?? 0);
  const parts = s.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60;
  if (parts.length === 2) return parts[0] + parts[1] / 60;
  return 0;
}
export function fmtMinutes(min: number) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}
/** 5'29"/km → 秒/km */
function parsePace(s?: string) {
  const m = s?.match(/(\d+)'(\d+)/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : Infinity;
}

export function summarize(posts: Post[]): Summary {
  const byCat = Object.fromEntries(Object.keys(CATEGORIES).map((k) => [k, 0])) as Record<CategoryKey, number>;
  const days = new Set<string>();
  const s = { km: 0, up: 0, minutes: 0, count: 0 };
  for (const p of posts) {
    if (!isActivity(p)) continue;
    const a = p.data.activity;
    s.km += a?.distanceKm ?? 0;
    s.up += a?.elevationGainM ?? 0;
    s.minutes += parseDuration(a?.movingTime);
    s.count++;
    byCat[p.data.category]++;
    days.add(dayKey(p.data.date));
  }
  return { ...s, km: Math.round(s.km * 10) / 10, days: days.size, byCat };
}

/* ---------- 月 ---------- */

export const nowJst = () => jst(new Date());

export function shiftMonth(y: number, m: number, delta: number) {
  const idx = y * 12 + (m - 1) + delta;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
}
export const mk = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;

export function inMonth<T extends { data: { date: Date } }>(items: T[], y: number, m: number) {
  const key = mk(y, m);
  return items.filter((i) => monthKey(i.data.date) === key);
}

/** 直近 n ヶ月（古い→新しい）の月別サマリ */
export function monthlySeries(posts: Post[], n = 12, end = nowJst()) {
  return Array.from({ length: n }, (_, i) => {
    const { y, m } = shiftMonth(end.y, end.m, i - (n - 1));
    return { y, m, key: mk(y, m), ...summarize(inMonth(posts, y, m)) };
  });
}

/** 投稿・メモ・本のある月一覧（新しい順） */
export function activeMonths(...lists: { data: { date?: Date; finished?: Date } }[][]) {
  const set = new Set<string>();
  for (const list of lists) for (const i of list) {
    const d = i.data.date ?? i.data.finished;
    if (d) set.add(monthKey(d));
  }
  return [...set].sort().reverse();
}

/** 増減率（前月比） */
export function delta(cur: number, prev: number) {
  if (!prev) return cur ? null : 0; // null = 新規（比較不可）
  return Math.round(((cur - prev) / prev) * 100);
}

/* ---------- ヒートマップ ---------- */

export interface HeatDay {
  key: string;
  date: Date;
  level: 0 | 1 | 2 | 3 | 4;
  km: number;
  up: number;
  posts: { id: string; title: string; category: CategoryKey }[];
  future: boolean;
}

/** 直近 weeks 週（日曜始まり）。level は距離＋標高から算出、ボルダーは固定で2 */
export function heatmap(posts: Post[], weeks = 53): HeatDay[][] {
  const byDay = new Map<string, Post[]>();
  for (const p of posts) if (isActivity(p)) {
    const k = dayKey(p.data.date);
    byDay.set(k, [...(byDay.get(k) ?? []), p]);
  }
  const today = new Date();
  const t = jst(today);
  // 今週の土曜まで埋める
  const endUtc = Date.UTC(t.y, t.m - 1, t.d + (6 - t.w));
  const startUtc = endUtc - (weeks * 7 - 1) * 86400e3;
  const out: HeatDay[][] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(startUtc + i * 86400e3 - 9 * 3600e3); // JST 0:00
    const key = dayKey(d);
    const list = byDay.get(key) ?? [];
    const km = list.reduce((s, p) => s + (p.data.activity?.distanceKm ?? 0), 0);
    const up = list.reduce((s, p) => s + (p.data.activity?.elevationGainM ?? 0), 0);
    const score = km + up / 100; // 100m登り ≒ 1km
    let level: HeatDay['level'] = 0;
    if (list.length) level = score >= 25 ? 4 : score >= 15 ? 3 : score >= 6 ? 2 : list.some((p) => p.data.climbing) ? 2 : 1;
    (out[Math.floor(i / 7)] ??= []).push({
      key, date: d, level, km, up,
      posts: list.map((p) => ({ id: p.id, title: p.data.title, category: p.data.category })),
      future: d.getTime() > today.getTime(),
    });
  }
  return out;
}

/* ---------- 自己ベスト ---------- */

export interface Record_ { label: string; value: string; post: Post }

/** ボルダーのグレードを数値化（級: 10-n、段: 10+n、Vグレード: 4+V） */
export function gradeValue(g: string) {
  let m = g.match(/(\d+)\s*級/);
  if (m) return 10 - Number(m[1]);
  m = g.match(/(\d+|初)\s*段/);
  if (m) return 10 + (m[1] === '初' ? 1 : Number(m[1]));
  m = g.match(/V(\d+)/i);
  if (m) return 4 + Number(m[1]);
  return -Infinity;
}
const SENT = (s: string) => !/トライ|project|プロジェクト/i.test(s);

export function personalRecords(posts: Post[]): Record_[] {
  const acts = posts.filter((p) => p.data.activity);
  const best = <T>(list: Post[], f: (p: Post) => T | undefined, cmp: (a: T, b: T) => boolean) => {
    let top: { p: Post; v: T } | undefined;
    for (const p of list) {
      const v = f(p);
      if (v == null || (typeof v === 'number' && !isFinite(v))) continue;
      if (!top || cmp(v, top.v)) top = { p, v };
    }
    return top;
  };
  const out: Record_[] = [];
  const dist = best(acts, (p) => p.data.activity!.distanceKm, (a, b) => a > b);
  if (dist) out.push({ label: '最長距離', value: `${dist.v} km`, post: dist.p });
  const gain = best(acts, (p) => p.data.activity!.elevationGainM, (a, b) => a > b);
  if (gain) out.push({ label: '最大獲得標高', value: `${gain.v.toLocaleString()} m`, post: gain.p });
  const high = best(acts, (p) => p.data.activity!.maxElevationM, (a, b) => a > b);
  if (high) out.push({ label: '最高到達点', value: `${high.v.toLocaleString()} m`, post: high.p });
  const long = best(acts, (p) => parseDuration(p.data.activity!.movingTime) || undefined, (a, b) => a > b);
  if (long) out.push({ label: '最長行動時間', value: fmtMinutes(long.v), post: long.p });
  const runs = acts.filter((p) => p.data.category === 'run' && (p.data.activity!.distanceKm ?? 0) >= 5);
  const pace = best(runs, (p) => parsePace(p.data.activity!.pace), (a, b) => a < b);
  if (pace) out.push({ label: '最速ペース (5km+)', value: pace.p.data.activity!.pace!, post: pace.p });
  const climbs = posts.filter((p) => p.data.climbing);
  let grade: { p: Post; g: string; v: number } | undefined;
  for (const p of climbs) for (const s of p.data.climbing!.sends) {
    if (!SENT(s.status)) continue;
    const v = gradeValue(s.grade);
    if (!grade || v > grade.v) grade = { p, g: s.grade, v };
  }
  if (grade) out.push({ label: '最高グレード', value: grade.g, post: grade.p });
  return out;
}

/** 完登グレードの分布（難しい順） */
export function gradePyramid(posts: Post[]) {
  const map = new Map<string, { grade: string; sent: number; flash: number; v: number }>();
  for (const p of posts) for (const s of p.data.climbing?.sends ?? []) {
    if (!SENT(s.status)) continue;
    const e = map.get(s.grade) ?? { grade: s.grade, sent: 0, flash: 0, v: gradeValue(s.grade) };
    e.sent++;
    if (/flash|onsight|一撃/i.test(s.status)) e.flash++;
    map.set(s.grade, e);
  }
  return [...map.values()].sort((a, b) => b.v - a.v);
}

/* ---------- 目標 ---------- */

export function goalProgress(year: number, posts: Post[], books: Book[]) {
  const goals = GOALS[year] ?? [];
  const ofYear = posts.filter((p) => jst(p.data.date).y === year);
  return goals.map((g) => {
    const list = g.category ? ofYear.filter((p) => p.data.category === g.category) : ofYear;
    const s = summarize(list);
    const value =
      g.metric === 'books'
        ? books.filter((b) => b.data.status === 'read' && b.data.finished && jst(b.data.finished).y === year).length
        : g.metric === 'km' ? s.km : g.metric === 'up' ? s.up : s.count;
    // 年の経過率と比較してペース判定
    const start = Date.UTC(year, 0, 1), end = Date.UTC(year + 1, 0, 1);
    const elapsed = Math.min(1, Math.max(0, (Date.now() - start) / (end - start)));
    const ratio = value / g.target;
    return { ...g, value, ratio: Math.min(1, ratio), pct: Math.round(ratio * 100), elapsed, onTrack: ratio >= elapsed };
  });
}

export const unitOf = (metric: string) => (metric === 'km' ? 'km' : metric === 'up' ? 'm' : metric === 'books' ? '冊' : '回');
