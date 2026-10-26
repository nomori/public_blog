# Trail & Chalk — 山道とチョークの記録

登山・ランニング・トレラン・ボルダリング＋雑記の個人ブログ。Astro（静的出力）→ さくらのレンタルサーバ。

## クイックスタート（初期設定）

本リポジトリをフォークまたはクローンした後、初期化ウィザードを実行することで、タイトル・作者名・テーマ・デプロイ先を簡単に対話形式で設定できます。

```bash
npm install
npm run init        # タイトル・作者名・カラーテーマ等の初期設定ウィザード
npm run dev         # 開発サーバー起動（http://localhost:4321）
```

> **カラーテーマについて**:  
> `forest`（深緑）、`ocean`（青空・海）、`sunset`（夕暮テラコッタ）、`granite`（花崗岩モノトーン）、`plum`（山桜プラム）の5種類から選択可能です。画面上部のパレットアイコンからいつでもリアルタイムにプレビュー・切替ができます。

## 開発コマンド

```bash
npm run dev        # http://localhost:4321
npm run build      # dist/ 生成 + Pagefind 検索索引
npm run preview    # ビルド結果確認（検索もここで動く）
```

---

## ⚠️ セキュリティ・各種キーと認証情報の取り扱い（重要）

本ブログには、Googleフォト連携、AI記事成形（Gemini API）、さくらのデプロイ用SSH鍵など、**外部サービスの認証情報**を扱う機能が含まれています。  
他の人への共有や、GitHub等の公開リポジトリ（Public）にプッシュする際は、以下のルールを必ず確認してください。

### 1. 絶対にコミット・公開してはいけないファイル

以下のファイルには機密情報が含まれるため、**絶対に Git にコミット（git add / git commit）したり、第三者に渡してはいけません**。

| ファイル名 | 含まれる機密情報 | 用途 |
|---|---|---|
| `.env` | `GEMINI_API_KEY`, `GOOGLE_CLIENT_SECRET` | ローカル実行用の環境変数・APIキー |
| `.google_token.json` | GoogleアカウントのOAuth認証トークン | GoogleフォトPickerのログインセッション |
| `sakura_deploy` | SSH秘密鍵（パスフレーズなし） | さくらのレンタルサーバへのログイン権限 |

> [!IMPORTANT]
> - これらのファイルは `.gitignore` に登録されており、通常の操作ではコミット対象になりません。
> - GitHub にプッシュする前に、必ず `git status` を実行し、上記ファイルが `Changes to be committed` に含まれていないことを確認してください。
> - チームや他人にリポジトリを展開する際は、**`.env.example` のみを共有**し、各自で `.env` を作成・キーを設定してもらってください。

### 2. CI/CD（GitHub Actions / Cloudflare Pages）での安全なキー管理
- **GitHub Actions（さくらデプロイ等）**:  
  秘密鍵や接続情報はリポジトリのコードには書かず、必ず **Settings → Secrets and variables → Actions** の「Repository secrets」に登録してください（ログにも自動マスキングされます）。
- **Cloudflare Pages**:  
  APIキーやカスタム設定が必要な場合は、ダッシュボードの **Settings → Environment variables**（環境変数）から安全に設定してください。

### 3. GPSログ（GPX）のプライバシー保護機能（自動マスク）
GPXファイルには詳細な緯度経度・標高・時刻が記録されているため、**自宅や職場周辺からスタート・ゴールしているログ**をそのまま公開すると生活圏が特定される危険があります。

本ブログシステムでは、**自宅や任意の地点から半径xxx m以内を自動除外するプライバシー保護機能**を標準搭載しています。

`.env` に以下を設定しておくだけで、`npm run draft:gpx` 実行時に指定半径内のトラックポイント（地図上のルート線・距離積算）が**自動的にカット**されます：

```ini
# 自宅の緯度・経度と除外半径（メートル）
PRIVACY_ZONE_LAT=35.681236
PRIVACY_ZONE_LON=139.767125
PRIVACY_ZONE_RADIUS_M=500

# 複数地点（自宅、実家、職場など）を登録する場合（セミコロン区切り: 緯度,経度,半径m）
# PRIVACY_ZONES=35.681236,139.767125,500;35.658034,139.701636,300
```
- 設定がある場合のみ自動で有効化されます（未設定時は通常の解析）。
- 自宅の緯度経度情報は `.env` 内で完結するため、GitHub 等に公開される心配もありません。


### 4. 万が一キーやトークンを誤って公開してしまった場合
Git のコミット履歴からファイルを消すだけでは不十分です（一度でも公開リポジトリに上がると即座に自動スキャンされます）。**直ちに該当サービスでキーを無効化（Revoke / 再発行）してください**:
- **Gemini API**: [Google AI Studio](https://aistudio.google.com/) からキーを削除して新規発行
- **Google OAuth**: [Google Cloud Console](https://console.cloud.google.com/) の「認証情報」から該当クライアントシークレットを削除・再作成
- **さくらSSH鍵**: サーバの `~/.ssh/authorized_keys` から該当の公開鍵を削除し、ローカルの `sakura_deploy` を破棄して再作成

---

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
| **3.5. AIで下書き成形** | `npm run ai -- draft <slug>` | **(New)** GPXの数値と雑なメモから、山行記の振り返り本文をAIが自動成形 |
| **4. 記事を自動結合** | `npm run compose -- <slug> [--draft]` | 1〜3を結合し、記事・写真・ルートデータを一括生成（デフォルトで公開） |

> **Tip**: `npm run compose -- <slug> --ai` とすると、結合直前に AI が自動でメモを成形してから一発で記事を生成できます。

一括結合: `npm run compose -- --all`

---

### AI 記事成形コマンド一覧 (`npm run ai`)

Google Gemini API（無料枠）を活用し、下書きの肉付け、既存記事の推敲、読書録の成形などを手軽に行えます。

```bash
# 1. 下書きのメモ・GPSデータから山行記・ラン記録を成形
npm run ai -- draft <slug>
# 例: npm run ai -- draft 2026-10-22-tanzawa

# 2. 既存の記事や読書ログ (.md) の文章を推敲・見出し構成・tagsを最適化
npm run ai -- file <ファイルパス>
# 例: npm run ai -- file src/content/posts/welcome.md
#     npm run ai -- file src/content/books/born-to-run.md

# 3. 走り書きのメモから新規記事を一発生成
npm run ai -- new "高尾山から陣馬山まで朝トレラン。雲海が最高だった" --category trail
```

> **AIの初期設定（完全無料）**:  
> 1. [Google AI Studio](https://aistudio.google.com/) から API キー（無料）を取得。  
> 2. プロジェクト直下の `.env` に `GEMINI_API_KEY=AIzaSy...` を追記するだけで即座に使えます。

---

### その他の作成コマンド一覧
- 読み物記事の作成: `npm run new -- article "タイトル" [--category hike|run|trail|boulder|misc]`
- 手動記録の作成: `npm run new -- log "タイトル" [--category run]`
- ひとことメモ: `npm run new -- note "今日は寒かった"`
- ボルダリング記録: `npm run new -- boulder "B-PUMP荻窪"`
- 読書ログ（ISBN検索で書影・書誌を自動取得）: `npm run book -- <ISBN> [--status read|reading|want]`
- X（Twitter）アーカイブ取り込み: `npm run import:x -- --file /path/to/tweets.js [--tag "#山,#ラン"]`

---

## サイトマップ（ページ構成）

- `/` : トップ（累計・This Month・目標進捗・最新の記録＆記事・つぶやき・読書中）
- `/logs/` : **記録（Logs）** — 山行・ランなどの数値ログの月別タイムライン（カテゴリ絞り込み可能）
- `/articles/` : **記事（Articles）** — 振り返り・ギアレビュー・考察・雑記のカード一覧
- `/notes/` : **つぶやき（Notes）** — 手書きメモ & Xから取り込んだポスト（ソース別フィルタ）
- `/books/` : **読書ログ（Books）** — 読書中・読了本棚（★評価・引用文・年間読書ペース）
- `/stats/` : **統計（Stats）** — 年間累計、月別棒グラフ、12ヶ月ヒートマップ、自己ベスト(PR)、ボルダー完登ピラミッド、全ルート重ね合わせ地図
- `/stats/[year]/[month]/` : **月次レポート** — その月の記録・記事・読書・つぶやきを自動集約した月間まとめページ
- `/posts/[slug]/` : 記録・記事の詳細ページ（同一日のつぶやき自動表示、標高＆地図連動）
- `/books/[slug]/` : 本の詳細ページ（感想・引用・読書日数）
- `/photos/` : 写真ギャラリー
- `/tags/` : タグ一覧


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

## デプロイ

本ブログは静的サイト（SSG）のため、**Cloudflare Pages（推奨・無料）** または **さくらのレンタルサーバ** のどちらでも簡単にホストできます。

---

### A. Cloudflare Pages でデプロイ（推奨・最も簡単）

世界中のCDNから高速配信され、HTTPS（SSL）やGit push時の自動ビルドが完全無料で利用できます。

#### 1. Cloudflare ダッシュボードで連携
1. [Cloudflare ダッシュボード](https://dash.cloudflare.com/) にログイン。
2. 左メニューの **「Workers & Pages」** → **「アプリケーションの作成」** → **「Pages」** タブ → **「Git に接続」** を選択。
3. ブログの GitHub リポジトリを選択して **「セットアップの開始」** をクリック。

#### 2. ビルド設定
以下の通り設定します：

| 項目 | 設定値 | 備考 |
|---|---|---|
| **フレームワーク プリセット** | `Astro` | |
| **ビルド コマンド** | `npm run build` | Pagefind 検索索引も自動生成されます |
| **ビルド出力ディレクトリ** | `dist` | |
| **ルート ディレクトリ** | （空欄のまま） | リポジトリ直下がプロジェクトの場合 |

#### 3. 環境変数の設定（重要）
同じ設定画面下部の **「環境変数 (高度)」** を開き、以下を追加します：

| 変数名 | 値 | 説明 |
|---|---|---|
| `NODE_VERSION` | `22` | Cloudflare のビルド環境で最新の Node.js を使用 |
| `ASTRO_SITE` | `https://<プロジェクト名>.pages.dev` | 公開 URL（独自ドメインの場合はその URL） |

> **Base パスについて**:  
> `astro.config.mjs` は Cloudflare Pages 実行時（`CF_PAGES=1`）に自動でルートパス (`/`) を使用します。  
> もし Cloudflare Pages でも `https://example.com/blog/` のようにサブディレクトリで公開したい場合は、環境変数 `ASTRO_BASE` に `/blog` を設定してください。

#### 4. デプロイ
- **「保存してデプロイ」** をクリック。数分でビルドが完了し、`https://xxxx.pages.dev` で公開されます。
- 以降は GitHub の `main` ブランチに push するだけで自動デプロイされます。
- プルリクエストを作成した場合は、プレビュー専用のURLが自動発行されます。

#### 5. （任意）カスタム独自ドメインの設定
- プロジェクト詳細画面の **「カスタム ドメイン」** タブから、お持ちの独自ドメイン（例: `blog.yourdomain.com`）を数クリックで割り当て可能です（無料SSL証明書が即時発行されます）。

---

### B. さくらのレンタルサーバでデプロイ

SSH + rsync による GitHub Actions 自動デプロイです。

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

4. `astro.config.mjs` の `site` を公開ドメイン（例: `https://xxxx.sakura.ne.jp` または独自ドメイン）に変更（デフォルトで `base: '/blog'` になっています）
5. `main` または `master` に push → `.github/workflows/deploy.yml` により自動デプロイ（`https://<ドメイン>/blog/` で公開されます）

> さくらのコントロールパネルで無料SSL（Let's Encrypt）を有効にしてください。`.htaccess` で HTTPS に強制リダイレクトします。

