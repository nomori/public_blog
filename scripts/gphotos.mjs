#!/usr/bin/env node
/**
 * Google Photos Picker API を使って指定した記事のディレクトリに写真をダウンロードするスクリプト
 *
 * 使い方:
 *   npm run gphotos -- <slugまたはディレクトリ名>
 *   例: npm run gphotos -- 2026-10-12-hike
 *
 * 必要な環境変数 (.env):
 *   GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
 *   GOOGLE_CLIENT_SECRET=xxxxx
 *
 * 初回実行時:
 *   ブラウザが起動し、Googleアカウントでログインと写真選択を求められます。
 *   Google Photos Picker UI で写真を選択して「完了」を押すと、自動的に記事の
 *   src/assets/posts/<slug>/ にオリジナル解像度でダウンロードされます。
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');

// .env 読み込み
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const PORT = 3456;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;
const TOKEN_CACHE = path.join(ROOT, '.google_token.json');

const targetDirName = process.argv[2];
if (!targetDirName) {
  console.log(`
使い方:
  npm run gphotos -- <記事slugまたはディレクトリ名>

例:
  npm run gphotos -- 2026-10-12-hike
  npm run gphotos -- 2026-10-22-trail
`);
  process.exit(1);
}

const DEST_DIR = path.join(ROOT, 'src/assets/posts', targetDirName);
fs.mkdirSync(DEST_DIR, { recursive: true });

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(`
【Google Photos連携の設定が必要です】
Google Cloud Console で OAuth クライアント ID を作成し、.env に追記してください。

1. https://console.cloud.google.com/ でプロジェクトを作成
2. 「Google Photos Picker API」を有効化
3. 「OAuth 同意画面」を設定（スコープ: .../auth/photospicker.mediaitems.readonly）
4. 「認証情報」→「OAuth 2.0 クライアント ID」を作成
   - アプリケーションの種類: ウェブ アプリケーション
   - 承認済みのリダイレクト URI: http://localhost:3456/oauth2callback
5. .env に記述:
   GOOGLE_CLIENT_ID=あなたのクライアントID
   GOOGLE_CLIENT_SECRET=あなたのクライアントシークレット
`);
  process.exit(1);
}

// ブラウザオープン
function openBrowser(url) {
  // Windows の start コマンドは第1引数がタイトル文字列になるため `start "" "URL"` が必須
  const start = process.platform === 'win32' ? 'start ""' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  exec(`${start} "${url}"`, (err) => {
    if (err) {
      console.log('（ブラウザの自動起動に失敗した場合は、下記のURLを手動で開いてください）');
    }
  });
}

// トークンリフレッシュまたは取得
async function getAccessToken() {
  if (fs.existsSync(TOKEN_CACHE)) {
    try {
      const saved = JSON.parse(fs.readFileSync(TOKEN_CACHE, 'utf8'));
      if (saved.refresh_token) {
        const resp = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            refresh_token: saved.refresh_token,
            grant_type: 'refresh_token',
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          saved.access_token = data.access_token;
          fs.writeFileSync(TOKEN_CACHE, JSON.stringify(saved, null, 2));
          return saved.access_token;
        }
      }
    } catch {}
  }

  // 認証フロー
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      if (req.url.startsWith('/oauth2callback')) {
        const urlObj = new URL(req.url, `http://localhost:${PORT}`);
        const code = urlObj.searchParams.get('code');
        if (!code) {
          res.end('認証コードが取得できませんでした。');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>Google認証が完了しました。</h1><p>ブラウザでPickerが開きます。このウィンドウは閉じて構いません。</p>');
        server.close();

        // code -> token
        try {
          const resp = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              code,
              client_id: CLIENT_ID,
              client_secret: CLIENT_SECRET,
              redirect_uri: REDIRECT_URI,
              grant_type: 'authorization_code',
            }),
          });
          const tokens = await resp.json();
          if (tokens.error) throw new Error(tokens.error_description || tokens.error);
          fs.writeFileSync(TOKEN_CACHE, JSON.stringify(tokens, null, 2));
          resolve(tokens.access_token);
        } catch (e) {
          reject(e);
        }
      }
    });

    server.listen(PORT, () => {
      const authUrl =
        'https://accounts.google.com/o/oauth2/v2/auth?' +
        new URLSearchParams({
          client_id: CLIENT_ID,
          redirect_uri: REDIRECT_URI,
          response_type: 'code',
          scope: 'https://www.googleapis.com/auth/photospicker.mediaitems.readonly',
          access_type: 'offline',
          prompt: 'consent',
        }).toString();

      console.log('🌐 ブラウザでGoogle認証を開きます...');
      console.log(`\nもしブラウザが自動で開かない場合は、以下のURLをブラウザに貼り付けて開いてください:\n${authUrl}\n`);
      openBrowser(authUrl);
    });
  });
}

// Pickerセッション作成
async function run() {
  const token = await getAccessToken();

  console.log('📸 Google Photos Picker セッションを作成中...');
  const createResp = await fetch('https://photospicker.googleapis.com/v1/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  if (!createResp.ok) {
    const errText = await createResp.text();
    throw new Error(`セッション作成エラー: ${errText}`);
  }

  const session = await createResp.json();
  const sessionId = session.id;
  const pickerUri = session.pickerUri;

  console.log('🖼️  写真選択用のGoogle Photos Pickerを開きます...');
  console.log(`URL: ${pickerUri}`);
  openBrowser(pickerUri);

  // 選択完了をポーリング
  console.log('⏳ 写真を選択して「完了」を押してください（待機中）...');
  let mediaItemsSet = false;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    const pollResp = await fetch(`https://photospicker.googleapis.com/v1/sessions/${sessionId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (pollResp.ok) {
      const s = await pollResp.json();
      if (s.mediaItemsSet) {
        mediaItemsSet = true;
        break;
      }
    }
  }

  if (!mediaItemsSet) {
    console.log('タイムアウトしました（写真は選択されませんでした）。');
    return;
  }

  // 選択されたメディア一覧を取得
  console.log('📥 選択されたメディアを取得中...');
  const listResp = await fetch(
    `https://photospicker.googleapis.com/v1/mediaItems?sessionId=${sessionId}&pageSize=100`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  const listData = await listResp.json();
  const items = listData.mediaItems || [];
  console.log(`✨ ${items.length} 枚の写真が選択されました。ダウンロードを開始します...`);

  let count = 0;
  for (const item of items) {
    count++;
    const mediaFile = item.mediaFile || item;
    const filename = mediaFile.filename || item.filename || `photo_${count}.jpg`;
    const baseUrl = mediaFile.baseUrl || item.baseUrl;

    if (!baseUrl) {
      console.warn(`[${count}/${items.length}] baseUrl が見つからないためスキップします:`, JSON.stringify(item).slice(0, 150));
      continue;
    }

    // =d でオリジナル解像度でダウンロード
    const downloadUrl = baseUrl.includes('=') ? baseUrl : `${baseUrl}=d`;
    const targetFile = path.join(DEST_DIR, filename);

    console.log(`[${count}/${items.length}] ダウンロード中: ${filename}`);
    const dlResp = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!dlResp.ok) {
      console.warn(`ダウンロード失敗 (${dlResp.status}): ${filename}`);
      continue;
    }

    const buf = Buffer.from(await dlResp.arrayBuffer());
    fs.writeFileSync(targetFile, buf);
  }

  console.log(`\n🎉 完了！ 写真を保存しました: ${path.relative(ROOT, DEST_DIR)}/`);
  console.log('※ Astroのビルド時に自動でサムネイル・WebP最適化およびEXIF/撮影時刻解析が行われます。');
}

run().catch((err) => {
  console.error('エラー:', err.message);
  process.exit(1);
});
