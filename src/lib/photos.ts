/**
 * 記事ごとの写真ディレクトリ
 *   src/assets/posts/<dir>/*.jpg
 *   <dir> = frontmatter `photoDir` → 記事slug → 日付(YYYY-MM-DD) の順に探す
 *
 * 任意で <dir>/_photos.json に { "file.jpg": { "caption": "...", "time": "ISO", "lat": 0, "lon": 0, "hidden": true } }
 * EXIF(撮影時刻/GPS)は自動で読む。GPSが無い写真はGPXの時刻から位置を補間する。
 */
import fs from 'node:fs';
import path from 'node:path';
import exifr from 'exifr';
import type { ImageMetadata } from 'astro';
import type { Post } from './content';

const modules = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/posts/**/*.{jpg,jpeg,png,webp,avif,JPG,JPEG,PNG,WEBP}',
  { eager: true },
);
const BASE = '/src/assets/posts/';

const dirs = new Map<string, { key: string; file: string; img: ImageMetadata }[]>();
for (const [key, mod] of Object.entries(modules)) {
  const rel = key.slice(BASE.length);
  const i = rel.lastIndexOf('/');
  if (i < 0) continue;
  const dir = rel.slice(0, i);
  (dirs.get(dir) ?? dirs.set(dir, []).get(dir)!).push({ key, file: rel.slice(i + 1), img: mod.default });
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function resolvePhotoDir(post: Post): string | undefined {
  const cands = [post.data.photoDir, post.id, ymd(post.data.date)].filter(Boolean) as string[];
  return cands.find((c) => dirs.has(c));
}

/** 同期・軽量：カバー用などに画像だけ欲しいとき */
export function getPostImages(post: Post) {
  const dir = resolvePhotoDir(post);
  return dir ? [...dirs.get(dir)!].sort((a, b) => a.file.localeCompare(b.file)) : [];
}

export interface PostPhoto {
  img: ImageMetadata;
  file: string;
  caption?: string;
  time?: Date;
  lat?: number;
  lon?: number;
  distKm?: number;
  interpolated?: boolean;
}

type RoutePt = [number, number, number | null, number, (number | null)?];

export function loadRoute(route?: string): RoutePt[] {
  if (!route) return [];
  const file = path.join(process.cwd(), 'public', route);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).points ?? [] : [];
}

function nearestByLatLon(pts: RoutePt[], lat: number, lon: number) {
  let best = -1, bd = Infinity;
  pts.forEach((p, i) => {
    const d = (p[0] - lat) ** 2 + ((p[1] - lon) * Math.cos((lat * Math.PI) / 180)) ** 2;
    if (d < bd) { bd = d; best = i; }
  });
  return best >= 0 && bd < 0.0005 ? best : -1; // 約2.5km以内のみ
}

function interpByTime(pts: RoutePt[], t: number) {
  const timed = pts.filter((p) => p[4] != null);
  if (timed.length < 2 || t < timed[0][4]! - 600 || t > timed[timed.length - 1][4]! + 600) return undefined;
  if (t <= timed[0][4]!) return timed[0];
  for (let i = 1; i < timed.length; i++) {
    const a = timed[i - 1], b = timed[i];
    if (t <= b[4]!) {
      const f = (t - a[4]!) / (b[4]! - a[4]! || 1);
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, null, a[3] + (b[3] - a[3]) * f] as RoutePt;
    }
  }
  return timed[timed.length - 1];
}

export async function getPostPhotos(post: Post): Promise<PostPhoto[]> {
  const dir = resolvePhotoDir(post);
  if (!dir) return [];
  const absDir = path.join(process.cwd(), 'src/assets/posts', dir);
  const manifestFile = path.join(absDir, '_photos.json');
  let manifest: Record<string, any> = {};
  if (fs.existsSync(manifestFile)) {
    try {
      const raw = fs.readFileSync(manifestFile, 'utf8').replace(/^\uFEFF/, '');
      manifest = JSON.parse(raw);
    } catch (e) {
      console.warn(`[photos] Failed to parse ${manifestFile}:`, e);
    }
  }
  const route = loadRoute(post.data.activity?.route);

  const out: PostPhoto[] = [];
  for (const { file, img } of dirs.get(dir)!) {
    const m = manifest[file] ?? {};
    if (m.hidden) continue;
    let exif: any = {};
    try {
      exif = (await exifr.parse(path.join(absDir, file), { pick: ['DateTimeOriginal', 'CreateDate', 'latitude', 'longitude'], gps: true })) ?? {};
    } catch {}
    const time: Date | undefined = m.time ? new Date(m.time) : exif.DateTimeOriginal ?? exif.CreateDate;
    let lat: number | undefined = m.lat ?? exif.latitude;
    let lon: number | undefined = m.lon ?? exif.longitude;
    let distKm: number | undefined, interpolated = false;
    if (route.length) {
      if (lat != null && lon != null) {
        const i = nearestByLatLon(route, lat, lon);
        if (i >= 0) distKm = route[i][3];
      } else if (time) {
        const p = interpByTime(route, time.getTime() / 1000);
        if (p) { lat = p[0]; lon = p[1]; distKm = p[3]; interpolated = true; }
      }
    }
    out.push({ img, file, caption: m.caption, time, lat, lon, distKm, interpolated });
  }
  return out.sort((a, b) => (a.time?.getTime() ?? 0) - (b.time?.getTime() ?? 0) || a.file.localeCompare(b.file));
}
