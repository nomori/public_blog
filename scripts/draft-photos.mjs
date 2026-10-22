#!/usr/bin/env node
/**
 * 2. 写真から下書き（GoogleフォトからDL、または手元フォルダから取り込み）
 *
 * 使い方:
 *   npm run draft:photos -- <slug>                     # Googleフォトから選択ダウンロード
 *   npm run draft:photos -- <slug> --from /path/to/dir # ローカルフォルダから写真をコピー
 */

import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import exifr from 'exifr';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const DRAFTS_DIR = path.join(ROOT, 'drafts');

const argv = process.argv.slice(2);
const slug = argv.find((a) => !a.startsWith('--'));
const fromIdx = argv.indexOf('--from');
const localSource = fromIdx >= 0 ? argv[fromIdx + 1] : null;

if (!slug) {
  console.log(`使い方: npm run draft:photos -- <slug> [--from /path/to/folder]`);
  process.exit(1);
}

const targetDraftDir = path.join(DRAFTS_DIR, slug);
const destPhotosDir = path.join(targetDraftDir, 'photos');
fs.mkdirSync(destPhotosDir, { recursive: true });

async function analyzeExifAndSaveManifest() {
  const files = fs.readdirSync(destPhotosDir).filter((f) => /\.(jpe?g|png|webp|avif)$/i.test(f));
  const manifest = {};
  for (const f of files) {
    const full = path.join(destPhotosDir, f);
    try {
      const data = await exifr.parse(full, { pick: ['DateTimeOriginal', 'latitude', 'longitude'], gps: true });
      if (data) {
        manifest[f] = {
          time: data.DateTimeOriginal ? new Date(data.DateTimeOriginal).toISOString() : undefined,
          lat: data.latitude,
          lon: data.longitude,
        };
      }
    } catch {}
  }
  fs.writeFileSync(path.join(destPhotosDir, '_photos.json'), JSON.stringify(manifest, null, 2));
  console.log(`📷 ${files.length} 枚の写真のEXIFログ（_photos.json）を記録しました。`);
}

if (localSource) {
  // ローカルフォルダから取り込み
  if (!fs.existsSync(localSource)) {
    console.error(`フォルダが存在しません: ${localSource}`);
    process.exit(1);
  }
  const files = fs.readdirSync(localSource).filter((f) => /\.(jpe?g|png|webp|avif)$/i.test(f));
  for (const f of files) {
    fs.copyFileSync(path.join(localSource, f), path.join(destPhotosDir, f));
  }
  console.log(`✔ ${files.length} 枚の写真を ${path.relative(ROOT, destPhotosDir)} に取り込みました。`);
  await analyzeExifAndSaveManifest();
} else {
  // Googleフォトからダウンロード（既存の gphotos.mjs を活用）
  const gphotosScript = path.join(ROOT, 'scripts/gphotos.mjs');
  // drafts/<slug>/photos へのダウンロードをサポートするため子プロセス呼び出し
  console.log(`Googleフォトから写真をダウンロードします (対象: drafts/${slug}/photos/)...`);
  const proc = exec(`node "${gphotosScript}" "${slug}" --draft`, { cwd: ROOT });
  proc.stdout.pipe(process.stdout);
  proc.stderr.pipe(process.stderr);
  proc.on('close', async (code) => {
    if (code === 0) {
      // 成功時、もし src/assets/posts/<slug> に落ちていたら drafts/<slug>/photos へ移動
      const legacyDir = path.join(ROOT, 'src/assets/posts', slug);
      if (fs.existsSync(legacyDir)) {
        for (const f of fs.readdirSync(legacyDir)) {
          fs.renameSync(path.join(legacyDir, f), path.join(destPhotosDir, f));
        }
        try { fs.rmdirSync(legacyDir); } catch {}
      }
      await analyzeExifAndSaveManifest();
    }
  });
}
