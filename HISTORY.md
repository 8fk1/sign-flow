# 変更履歴

## 2026-06-03 23:30

### 依頼内容
ライトモード・ダークモード切り替えを実装中だったので再開して完成させてほしい。

### 実施内容
ライト/ダークモード切り替え機能を新規実装。

#### アプローチ
CSS変数（カスタムプロパティ）が既に整備されていたため、  
`[data-theme="dark"]` セレクタで変数を上書きする方式を採用。  
`<html>` 要素の `dataset.theme` を JS で切り替え、`localStorage` に保存して再起動後も維持。

#### 変更ファイル
- `static/css/style.css`
  - `:root` に不足していた変数を追加（`--input-bg`, `--drop-border`, `--hover-bg` など計20変数）
  - `[data-theme="dark"]` ブロックを追加し、ダーク用の値を定義
  - ハードコードされた色値（`#ffffff`, `#f8fafc`, `#cbd5e1` 等）を変数参照に置き換え
  - テーマトグルボタンのスタイル（`.theme-toggle-btn`）を追加
  - `.hero-body` にフレックスレイアウトを追加（タイトル左・ボタン右）
- `index.html`
  - ヘッダー右端に `#themeToggleBtn`（月/太陽アイコン）を追加
- `renderer.js`
  - `applyTheme()` 関数を追加（`data-theme` 切り替え＋アイコン更新）
  - 初期化時に `localStorage` から保存済みテーマを復元
  - ボタンクリックでライト/ダーク切り替え＋保存

#### 動作確認（スクリーンショット撮影済み）
- ライトモード：白基調、ヘッダー右端に月アイコン
- ダークモード：ネイビー基調、ヘッダー右端に太陽アイコン
- localStorage に保存されるため再起動後も維持される

#### テスト結果
`npx playwright test` → 12/12 通過（既存テスト全件パス）

---

## 次に強化・追加する機能の候補

1. **システムテーマ連動** — `prefers-color-scheme` メディアクエリを検知し、OS設定に自動追従するオプション
2. **二重円スタイルの対応** — 本格的な印鑑らしい二重円デザインの追加（オプション切替）
3. **文字色・フォント変更** — 赤以外の色や明朝体/ゴシック体の選択機能
4. **角印作成機能** — 四角い枠に会社名・役職を配置するスタイルの追加
5. **作成済み印影の編集** — マスタ一覧から既存の作成印影を再編集する機能

## 2026-06-03 21:56

### 依頼内容
印影画像の管理について、印影作成機能を実装したい。

### 実施内容
テキスト（氏名）から丸印（赤・1重円・縦書き）を生成してPNG保存する「印影作成機能」を実装。

#### 変更ファイル
- `index.html` — マスタ管理タブに「テキストから新規作成」ボタンを追加。印影作成モーダル（Canvas プレビュー・氏名入力・ファイル名入力）を追加。
- `renderer.js` — `drawStampOnCanvas()` 関数（Canvas API による丸印描画）、印影作成モーダルの開閉・リアルタイムプレビュー・保存処理を追加。
- `playwright.config.js` — 新規作成（Playwright テスト設定）
- `tests/stamp-create.spec.js` — 新規作成（8ケースのE2Eテスト、全件通過）
- `.claude/plan_stamp_create.md` — 修正計画を保存

#### 実装詳細
- 「テキストから新規作成」ボタンをマスタ管理タブの「画像を選択して登録」ボタン下に追加（赤ボタン）
- モーダルを開くと Canvas に丸印プレビューをリアルタイム表示
- 氏名入力 → ファイル名が自動提案される（手動上書き可）
- Canvas（200×200px）に1重円・縦書き文字を描画 → PNG として stampFolder に保存
- 保存後、stampImages・stampMeta を更新してマスタ一覧を再描画

#### テスト結果
`npx playwright test tests/stamp-create.spec.js` → 8/8 通過

---

## 2026-06-03 22:30

### 依頼内容
インストーラー配布・再インストールの手間を減らすため、自動アップデート機能を実装したい。

### 実施内容
`electron-updater`（generic provider）を使った自動アップデート機能を実装。  
社内HTTPサーバに `latest.yml` とインストーラを置くだけで、ユーザーが次回起動時に自動通知を受け取れる。

#### 変更ファイル
- `main.js` — `electron-updater` セットアップ、IPCハンドラ（バージョン取得・手動確認・インストール）追加
- `renderer.js` — アップデート通知用IPC リスナー（確認中・ダウンロード中・完了・エラー）+ 手動確認ボタンの処理追加
- `index.html` — マスタ管理タブに「アプリ情報・アップデート」セクション追加（バージョン表示・手動確認ボタン・進捗バッジ）
- `package.json` — `electron-updater`, `electron-log` を依存追加、`build:win` / `release:win` スクリプト追加、`publish` 設定追加
- `tests/auto-update.spec.js` — 新規作成（4ケース）

#### 利用開始に必要なこと
1. `main.js` の `UPDATE_SERVER_URL` と `package.json` の `build.publish.url` を実際の社内サーバURLに変更する
2. 社内サーバにディレクトリを作成してHTTPで公開できるようにする
3. `npm run build:win` → `dist/` の `*.exe` と `latest.yml` をサーバに配置

#### リリース手順（運用開始後）
1. `package.json` の `version` を上げる
2. `npm run build:win` を実行
3. `dist/` の `sign-flow Setup *.exe` と `latest.yml` をサーバに上書きコピー
4. 完了（ユーザーは次回起動時に自動通知）

#### テスト結果
`npx playwright test` → 12/12 通過（自動アップデートUI: 4件 + 印影作成: 8件）

---

## 2026-06-03 22:50

### 依頼内容
社内サーバが難しいため、Firebase/Vercel などを使って「git push で自動反映」する仕組みにしたい。

### 実施内容
GitHub Releases + GitHub Actions に切り替え。プライベートリポジトリ対応。

#### 変更ファイル
- `.github/workflows/release.yml` — 新規作成（main push → バージョン変更検出 → Windowsビルド → GitHub Release 自動作成）
- `main.js` — provider を `generic` から `github` に変更、読み取り専用 PAT のプレースホルダーを設置
- `package.json` — publish 設定を github provider に変更

#### 利用開始に必要な作業（1回だけ）
1. GitHub → Settings → Developer settings → Fine-grained tokens でトークンを作成
   - Repository: sign-flow のみ / Permissions: Contents = Read-only
2. `main.js` の `UPDATER_TOKEN` にそのトークンを貼り付けてコミット・push

#### 運用フロー（開始後）
```
package.json の "version" を上げて git push
→ GitHub Actions が自動検知・ビルド・Release 作成
→ 同僚の次回起動時に自動通知 → ワンクリックで更新
```

#### テスト結果
`npx playwright test` → 12/12 通過

---

## 次に強化・追加する機能の候補

1. **二重円スタイルの対応** — 本格的な印鑑らしい二重円デザインの追加（オプション切替）
2. **文字色・フォント変更** — 赤以外の色や明朝体/ゴシック体の選択機能
3. **角印作成機能** — 四角い枠に会社名・役職を配置するスタイルの追加
4. **作成済み印影の編集** — マスタ一覧から既存の作成印影を再編集する機能
5. **印影サイズのプレビュー表示** — PDF上でのスタンプ実寸大イメージをプレビューで確認できる機能

---

## 2026-06-04 00:15 — npm run app:dist ビルドエラー修正

### 依頼内容
`npm run app:dist` が失敗するとの報告。

### 原因
macOS 15 (Sequoia) で導入された `com.apple.provenance` 拡張属性が、Electron のキャッシュから展開されたバイナリに自動付加される。これが `codesign --timestamp` コマンドと組み合わさると「resource fork, Finder information, or similar detritus not allowed」エラーを引き起こす。`xattr -cr`、ファイルの再作成、`dd` によるコピーなどでも除去不可能な保護属性。

### 対処内容
1. `scripts/afterPack.js` を作成（afterPack フック）— xattr + copyFile による属性除去を試みる（副次的効果）
2. `package.json` の `build.mac` に以下を追加：
   - `"identity": null` — コード署名を完全スキップ（ad-hoc署名も行わない）
   - `"hardenedRuntime": false` — `--options runtime` を無効化
   - `"gatekeeperAssess": false` — Gatekeeper チェックを無効化
3. `~/Library/Caches/electron-builder/` をクリアして DMG ビルドのキャッシュ問題も解消

### 結果
`dist/sign-flow-1.0.2-arm64.dmg` (125MB) の生成に成功。

### 注意点
署名なしのため macOS の Gatekeeper で「開発元が確認できない」警告が出る場合がある。内部配布・開発用途では問題なし。Apple Developer ID での署名が必要な場合は別途設定が必要。

---

## 次に強化・追加する機能の候補

1. **Apple Developer ID 署名の設定** — GitHub Actions の CI/CD で正式署名・公証(notarization)を行う設定
2. **二重円スタイルの対応** — 本格的な印鑑らしい二重円デザインの追加
3. **文字色・フォント変更** — 赤以外の色や明朝体/ゴシック体の選択機能
4. **角印作成機能** — 四角い枠に会社名・役職を配置するスタイルの追加
5. **印影サイズのプレビュー表示** — PDF上でのスタンプ実寸大イメージをプレビューで確認できる機能
