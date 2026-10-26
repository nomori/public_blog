/**
 * GPX プライバシーゾーン（自宅・職場等の秘匿領域）除外ユーティリティ
 *
 * 設定方法 (.env):
 *   PRIVACY_ZONE_LAT=35.681236
 *   PRIVACY_ZONE_LON=139.767125
 *   PRIVACY_ZONE_RADIUS_M=500
 *
 * 複数地点の場合:
 *   PRIVACY_ZONES=35.681236,139.767125,500;35.658034,139.701636,300
 *   または
 *   PRIVACY_ZONES=[{"lat":35.68,"lon":139.76,"radius":500}]
 */

import fs from 'node:fs';
import path from 'node:path';

const R = 6371008.8; // 地球の半径 (m)
const rad = (d) => (d * Math.PI) / 180;

/** Haversineの公式で2点間の距離(メートル)を計算 */
export function haversine(lat1, lon1, lat2, lon2) {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** .env から設定を読み込み */
export function loadEnv(root) {
  const envFile = path.join(root, '.env');
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
}

/** 登録されたプライバシーゾーン一覧を取得 */
export function getPrivacyZones(root = process.cwd()) {
  loadEnv(root);
  const zones = [];

  // 1. 単一地点設定 (PRIVACY_ZONE_LAT, PRIVACY_ZONE_LON, PRIVACY_ZONE_RADIUS_M)
  const lat = parseFloat(process.env.PRIVACY_ZONE_LAT || process.env.PRIVACY_LAT);
  const lon = parseFloat(process.env.PRIVACY_ZONE_LON || process.env.PRIVACY_LON);
  const radius = parseFloat(process.env.PRIVACY_ZONE_RADIUS_M || process.env.PRIVACY_RADIUS_M || '500');

  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    zones.push({ lat, lon, radius: Number.isFinite(radius) ? radius : 500, label: '自宅/指定地点' });
  }

  // 2. 複数地点設定 (PRIVACY_ZONES)
  const rawZones = process.env.PRIVACY_ZONES;
  if (rawZones) {
    if (rawZones.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(rawZones);
        for (const z of parsed) {
          if (Number.isFinite(+z.lat) && Number.isFinite(+z.lon)) {
            zones.push({ lat: +z.lat, lon: +z.lon, radius: +z.radius || 500, label: z.label || '指定地点' });
          }
        }
      } catch (e) {
        console.warn('⚠ PRIVACY_ZONES の JSON パースに失敗しました:', e.message);
      }
    } else {
      // セミコロン区切り: lat,lon,radius;lat,lon,radius
      const parts = rawZones.split(';');
      for (const p of parts) {
        const [zLat, zLon, zRad] = p.split(',').map((s) => parseFloat(s.trim()));
        if (Number.isFinite(zLat) && Number.isFinite(zLon)) {
          zones.push({ lat: zLat, lon: zLon, radius: Number.isFinite(zRad) ? zRad : 500, label: '指定地点' });
        }
      }
    }
  }

  return zones;
}

/** トラックポイントがプライバシーゾーン内にあるか判定 */
export function isInPrivacyZone(pt, zones) {
  for (const z of zones) {
    const dist = haversine(pt.lat, pt.lon, z.lat, z.lon);
    if (dist <= z.radius) return true;
  }
  return false;
}

/** トラックポイント一覧からプライバシーゾーン内の点を除外 */
export function filterPrivacyPoints(pts, root = process.cwd()) {
  const zones = getPrivacyZones(root);
  if (zones.length === 0) return pts;

  const originalCount = pts.length;
  const filtered = pts.filter((p) => !isInPrivacyZone(p, zones));
  const removed = originalCount - filtered.length;

  if (removed > 0) {
    const zoneDesc = zones.map((z) => `${z.radius}m圏内`).join(', ');
    console.log(`🔒 プライバシー保護: 登録ゾーン (${zoneDesc}) に含まれるトラックポイント ${removed} 点を除外しました。`);
  }

  return filtered;
}
