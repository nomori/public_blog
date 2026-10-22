# Trail & Chalk — 山道とチョークの記録

登山・ランニング・トレラン・ボルダリング＋雑記の個人ブログ。Astro（静的出力）→ さくらのレンタルサーバ。

## 開発

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # dist/ 生成 + Pagefind 検索索引
npm run preview    # ビルド結果確認（検索もここで動く）
```

## 記事作成ワークフロー（疎結合ドラフト ＆ 結合パイプライン）

「GPSログ（Strava等から落としたGPX）」、「写真」、「個人のメモ」をそれぞれ**独立した下書き**として記録し、最後に結合して記事を生成できます。ログには余計なポエムが入らず、いつでも再結合できます。

```
drafts/<slug>/
├── activity.json    # 1. GPXの客観ログ（距離、標高、時間、行程時刻、スプリット）
├── route.json       #    Leaflet地図用のルート座標
├── photos/          # 2. Googleフォトやローカルから集めた写真（+ EXIFログ）
└── memo.md          # 3. 本人の主観メモ（感想、装備、振り返り）
```

### ステップ別の実行コマンド

| ステップ | コマンド | 説明 |
|---|---|---|
| **1. GPXから下書き** | `npm run draft:gpx -- path/to/file.gpx` | `drafts/YYYY-MM-DD-slug/` を作成し客観ログを保存（Strava/Garmin等のGPX） |
| **2. 写真の下書き** | `npm run draft:photos -- <slug>` | Googleフォト（Picker）から写真をDL、または `--from /path/to/dir` で取り込み |
| **3. メモの下書き** | `npm run draft:memo -- <slug> "メモ内容"` | `drafts/<slug>/memo.md` に追記（`--edit` でエディタ直接編集） |
| **4. 記事を自動結合** | `npm run compose -- <slug> [--draft]` | 1〜3を結合し、記事・写真・ルートデータを一括生成（デフォルトで公開） |

一括結合: `npm run compose -- --all`

---

### その他の作成コマンド
- 普通の記事: `npm run new -- post "タイトル" --category misc`
- ひとことメモ: `npm run new -- note "今日は寒かった"`
- ボルダリング記録: `npm run new -- boulder "B-PUMP荻窪"`

---

## Googleフォト連携の初期セットアップ手順（無料）

Google Photos Picker API を使って、ブラウザ上の写真選択UIから直接写真をダウンロードするための設定手順です（初回のみ設定が必要）。

### 1. Google Cloud Console でプロジェクト作成
1. [Google Cloud Console](https://console.cloud.google.com/) にアクセスし、ログインします。
2. 画面上部のプロジェクト選択メニューから **「新しいプロジェクト」** を作成します（プロジェクト名: `my-blog-photos` など任意）。

### 2. Google Photos Picker API を有効化
1. 左側メニューの **「API とサービス」** → **「ライブラリ」** を開きます。
2. 検索バーに `Google Photos Picker API` と入力して選択し、**「有効にする」** をクリックします。

### 3. OAuth 同意画面の設定
1. 左側メニューの **「API とサービス」** → **「OAuth 同意画面」** を開きます。
2. User Type で **「外部」** を選択し「作成」をクリック。
3. アプリ情報（アプリ名: `Blog Photo Picker`、ユーザーサポートメール等）を入力して「保存して次へ」。
4. 「スコープ」ステップ: **何も設定せずスキップ（「保存して次へ」）で大丈夫です。**
   ※スクリプト実行時に必要な権限が自動で要求されます。
5. 「テストユーザー」ステップで、写真を取り込みたい **ご自身のGoogleアカウントのメールアドレス** を追加して保存します。

### 4. OAuth クライアント ID の発行
1. 左側メニューの **「認証情報」** → **「認証情報を作成」** → **「OAuth クライアント ID」** を選択。
2. アプリケーションの種類: **「ウェブ アプリケーション」** を選択。
3. 名前: `Blog Local Client`（任意）。
4. **「承認済みの JavaScript 生成元」: 空欄（未入力）のままでOKです。**
5. **「承認済みのリダイレクト URI」** に以下を追加します：
   ```
   http://localhost:3456/oauth2callback
   ```
6. 「作成」をクリックすると、**クライアント ID** と **クライアント シークレット** が表示されます。

### 5. .env に設定
プロジェクト直下の `.env`（無ければ `.env.example` をコピーして `.env` を作成）に追記します：

```ini
GOOGLE_CLIENT_ID=xxxxxxxxxxxx-xxxxxxxxxxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxx
```

### 6. 写真のダウンロード実行
```bash
npm run draft:photos -- <slug>
# 例: npm run draft:photos -- 2026-10-22-tanzawa
```
- コマンドを実行するとブラウザが起動し、Googleアカウントのログインと写真選択画面（Picker）が開きます。
- 記事で使いたい写真を複数選択して「完了」を押すと、オリジナルの解像度で `drafts/<slug>/photos/` に自動ダウンロードされます。
- 写真の EXIF（撮影日時・GPS）が自動解析され、位置情報のない写真も GPX ログの時刻からルート上の地点（km）が自動計算されます。

## デプロイ（さくら）

1. ローカルでデプロイ用鍵を作成  
   `ssh-keygen -t ed25519 -f sakura_deploy -N ""`
2. 公開鍵をサーバへ登録  
   `ssh <アカウント>@<アカウント>.sakura.ne.jp` → `~/.ssh/authorized_keys` に `sakura_deploy.pub` を追記（`chmod 600`）
3. GitHub リポジトリの Settings → Secrets and variables → Actions に登録（Repository secrets）

| Secret | 例 | 備考 |
|---|---|---|
| `SAKURA_HOST` | `xxxx.sakura.ne.jp` | さくらサーバのホスト名 |
| `SAKURA_USER` | `xxxx` | SSHログインユーザー名 |
| `SAKURA_SSH_KEY` | `sakura_deploy` の中身 | 秘密鍵ファイルの内容すべて |
| `SAKURA_PATH` | `~/www/blog/` | **※既存コンテンツ保護のため必ず末尾スラッシュ付きで `~/www/blog/` を指定してください** |

4. `astro.config.mjs` の `site` を公開ドメイン（例: `https://xxxx.sakura.ne.jp` または独自ドメイン）に変更（`base: '/blog'` は設定済みです）
5. `main` または `master` に push → 自動デプロイ（`https://<ドメイン>/blog/` で公開されます）

> さくらのコントロールパネルで無料SSL（Let's Encrypt）を有効にしてください。`.htaccess` で HTTPS に強制リダイレクトします。
