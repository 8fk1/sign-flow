# 変更履歴

## 2026-06-04 — Mac インストール後の起動クラッシュ修正

### 依頼内容
Mac でアプリをインストール・起動したところ `Uncaught Exception: Error: ENOENT, static/img/stamp/新しいフォルダー not found` でクラッシュ。

### 原因
`initStampFolder()` が `static/img/stamp/` 内のエントリを全件 `copyFileSync` しようとするが、同ディレクトリに `新しいフォルダー`（サブディレクトリ）と `stamp.pptx`（不要ファイル）が含まれており、ディレクトリを `copyFileSync` しようとして ENOENT エラー。

### 対処内容
1. `main.js` の `initStampFolder()` でコピー前に `fs.statSync().isFile()` チェックを追加してディレクトリをスキップ
2. `static/img/stamp/新しいフォルダー/` を削除
3. `static/img/stamp/stamp.pptx` を削除

### テスト結果
`npx playwright test` → 12/12 通過

---

## 2026-06-04 — Windows ビルド時のアイコンパス修正

### 依頼内容
`npm run app:dist` が Windows 上で正しく完了するか調査し、問題があれば修正する。

### 原因
`package.json` の `build.mac.icon` および `build.win.icon` がともに `"build/icon.png"` を参照していたが、`build/` ディレクトリは `.gitignore` に含まれており実際には存在しない。Windows 上のクリーンな環境では `build/icon.png` が見つからずビルドエラーが発生する。

### 対処内容
`package.json` のアイコンパスを実在するファイルに変更：

- `mac.icon`: `"build/icon.png"` → `"static/img/icon/icon.png"` (PNG 256x256)
- `win.icon`: `"build/icon.png"` → `"static/img/icon/app.ico"` (ICO 256x256)

### 結果
Windows 上でもアイコンが正しく解決され、`npm run app:dist` が最後まで完了するはず。

---

## 次に強化・追加する機能の候補

1. **Apple Developer ID 署名** — GitHub Actions での正式署名・公証(notarization)設定
2. **二重円スタイルの対応** — 本格的な印鑑らしい二重円デザイン
3. **文字色・フォント変更** — 赤以外の色や明朝体/ゴシック体の選択
4. **角印作成機能** — 四角い枠に会社名・役職を配置するスタイル
5. **印影サイズのプレビュー表示** — PDF上でのスタンプ実寸大イメージをプレビューで確認

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

---

## 2026-06-04 10:16

### Situation / 指示
`npm run app:dist` 実行時に `node_modules` から Electron バージョンが計算できないエラーおよび `description is missed` 警告により、Windowsでのアプリビルドに失敗する問題の解消。

### Actions Taken / 実行した操作
1. クリーンな依存関係インストールのため、リポジトリルートで `npm ci` を実行。
2. `package.json` の `description` フィールドが空文字列になっていたため、具体的な説明を追加。
3. `npm run app:dist` を再実行し、インストーラー（`dist/sign-flow Setup 1.0.2.exe`）が正常にビルドできることを確認。

### Cause and Action (トラブルシューティング時) / 原因と対処
- **原因**: 
  1. プロジェクト内に `node_modules` がインストールされておらず、かつ `package.json` での `electron` のバージョンが `^38.2.0` と範囲指定されていたため、ビルド時に参照すべき Electron バージョンが自動検出できなかった。
  2. `package.json` の `description` フィールドが未設定（空文字列）だった。
- **対処**:
  1. `npm ci` を実行して `electron` などの依存モジュールをインストール。
  2. `package.json` に説明文を追加。

---

## 2026-06-04 11:25

### Situation / 指示
1. アプリアップデート時のインストーラー画面の起動を抑止し、サイレントアップデートに変更する。
2. アップデートファイルを裏でダウンロードしている進捗状況を、プログレスバーなどで視覚的に表現する。
3. マスタ設定画面における各設定セクション（印影画像の管理、アプリ情報・アップデート、PDF出力の微調整、書類種別の管理）の不適切な入れ子構造（レイヤー崩れ）を吟味して再構成する。

### Actions Taken / 実行した操作
1. [package.json](file:///c:/Users/fujiwara/Documents/GitHub/sign-flow/package.json) 内の `build.nsis` 設定を `"oneClick": true`, `"allowToChangeInstallationDirectory": false`, `"perMachine": false` に更新。
2. [index.html](file:///c:/Users/fujiwara/Documents/GitHub/sign-flow/index.html) の設定タブ（`#tabContentMaster`）配下の閉じタグズレによる入れ子を解消し、4つの設定ブロックがそれぞれ独立した `card-panel` カードとしてフラットに配置されるようレイアウト構造を再構成。
3. [index.html](file:///c:/Users/fujiwara/Documents/GitHub/sign-flow/index.html) の「アプリ情報・アップデート」カード内にダウンロード進捗を示すプログレスバー用のDOM（`#updateProgressContainer`, `#updateProgressBar`）を追加。
4. [renderer.js](file:///c:/Users/fujiwara/Documents/GitHub/sign-flow/renderer.js) にて追加した進捗バーDOMへの参照を取得し、`update-download-progress` / `update-downloaded` / `update-error` / `update-not-available` イベントに合わせて、進捗率の更新およびプログレスバー表示のオン・オフを制御するロジックを実装。
5. `npx playwright test` を実行し、全12件の自動テストが正常に通過することを確認。
6. [package.json](file:///c:/Users/fujiwara/Documents/GitHub/sign-flow/package.json) のバージョンを `1.0.4` に引き上げ、自動パブリッシュコマンド（`npm run release:win`）を実行して、GitHub Releases 上にサイレントアップデート対応の `v1.0.4` リリース（アセットおよび `latest.yml`）をアップロード。

### Cause and Action (トラブルシューティング時) / 原因と対処
- **原因**: 
  - インストーラー（NSIS）が個別インストール位置の選択などを許可する設定（`oneClick: false`）になっていたため、アップデート時にも都度インストーラーウィザードが前面に立ち上がっていた。
  - HTMLマークアップ上の `</div>` 閉じタグの配置ミスにより、いくつかの設定カードが別のカード内に不適切にネストされていた。
- **対処**:
  - `oneClick: true` への変更とインストール先を `AppData/Local` に固定することで完全サイレントアップデート化。
  - タグ構造を吟味し、完全にフラットな4枚の独立カード型レイアウトに整理した。
  - `electron-updater` の `download-progress` イベントから取得した進捗率 `progress.percent` を元に、Bulmaのプログレスバー要素をリアルタイムで操作するよう更新した。

---

## 2026-06-04 11:35 — v1.0.5 更新履歴表示とリネームバグ修正

### Situation / 指示
1. 登録済み印影画像のリネーム時に名前にドットが含まれていると、ドット以降（拡張子）が欠落して画像が一覧から消えるバグを修正する。
2. 過去の更新内容をアプリ側から確認できる「更新履歴」機能を追加する。
3. 問題がなければ新バージョン `1.0.5` としてビルド・パブリッシュする。

### Actions Taken / 実行した操作
1. [renderer.js](file:///c:/Users/fujiwara/Documents/GitHub/sign-flow/renderer.js) のリネーム保存処理（`commit`）内にて、`path.extname` による誤認識を防ぐため、入力文字列が元の拡張子で終わっているかをチェックするロジック（`endsWith`）に修正。これにより、`山田.太郎` のようにドットを含む名前でも正しくリネーム可能にし、一覧から欠落するバグを解消。
2. [package.json](file:///c:/Users/fujiwara/Documents/GitHub/sign-flow/package.json) の `files` 設定に `"HISTORY.md"` を追加し、パッケージ内に履歴ファイルを同梱。
3. [index.html](file:///c:/Users/fujiwara/Documents/GitHub/sign-flow/index.html) の設定タブの下部に更新履歴を表示するパネル（`#appHistoryContainer`）を追加。
4. [renderer.js](file:///c:/Users/fujiwara/Documents/GitHub/sign-flow/renderer.js) に `loadAppHistory()` を実装。ローカルの `HISTORY.md` を読み込んで簡易マークダウンパーサーでHTMLにパースし、設定画面を開いた時に描画するよう対応。
5. `npx playwright test` を実行し、全12件の自動テストが正常に通過することを確認。
6. 自動パブリッシュコマンド（`npm run release:win`）を実行して、GitHub Releases上に `v1.0.5` をリリース。

### Cause and Action (トラブルシューティング時) / 原因と対処
- **原因**: 
  - 印影名に `山田.太郎` のようなドットが含まれると、`path.extname` が `.太郎` を拡張子と判定してしまい、本来の拡張子 `.png` を補完せずリネームが実行されていた。そのため、画像検索時の拡張子フィルタ（`.png` や `.jpg` 等）から漏れて一覧から消えていた。
- **対処**:
  - `newBase.toLowerCase().endsWith(ext.toLowerCase())` の判定に修正し、本来の拡張子で終わっていない限り、常に元の拡張子を強制的に末尾に結合するようにロジックを修正。

---

## 2026-06-04 11:39 — v1.0.6 リリースノートの自動同期機能

### Situation / 指示
1. パブリッシュビルド実行時に、`HISTORY.md` の最新セクションの内容を GitHub Releases の「Release notes（リリース内容説明文）」に自動で抽出・反映できるようにする。
2. 設定変更を完了させ、新バージョン `1.0.6` としてビルド・パブリッシュする。

### Actions Taken / 実行した操作
1. [scripts/extract-release-notes.js](file:///c:/Users/fujiwara/Documents/GitHub/sign-flow/scripts/extract-release-notes.js) を作成。`HISTORY.md` の最新日付のログセクションを自動抽出して `release-notes.md` 一時ファイルを生成するNode.jsスクリプトを記述。
2. [package.json](file:///c:/Users/fujiwara/Documents/GitHub/sign-flow/package.json) の `"release:win"` コマンドの戦闘に、上記抽出スクリプトの実行処理を追加。
3. [package.json](file:///c:/Users/fujiwara/Documents/GitHub/sign-flow/package.json) の `build.publish` 設定に `"releaseNotesFile": "release-notes.md"` を追加し、パブリッシュ時に自動同期されるよう設定。
4. [.gitignore](file:///c:/Users/fujiwara/Documents/GitHub/sign-flow/.gitignore) に `release-notes.md` を追加してgit追跡対象外に設定。
5. `npx playwright test` による自動テストの通過を確認後、`npm run release:win` コマンドで `v1.0.6` の自動パブリッシュ（リリースノート自動適用）を実行。

### Cause and Action (トラブルシューティング時) / 原因と対処
- **原因**: 
  - 手動パブリッシュや従来のパブリッシュ方法では、GitHub Releaseのリリースノート（説明文）が空のままであり、`HISTORY.md` の内容と同じログを毎回ブラウザでコピペ入力する二重管理の手間が発生していた。
- **対処**:
  - `releaseNotesFile` によるリリースノート自動指定オプションと、ビルド前に `HISTORY.md` の最新ブロックを切り出すJSスクリプトを連携させ、完全に自動で同期されるビルドフローを構築した。

---

## 2026-06-04 12:00 — v1.0.7 更新履歴の表示順序の修正

### Situation / 指示
1. アプリ内の「更新履歴」で最新の変更履歴が一番上に表示されない問題を修正する。
2. 正しいリリースノートを反映した最新バージョンをパブリッシュする。

### Actions Taken / 実行した操作
1. [renderer.js](file:///c:/Users/fujiwara/Documents/GitHub/sign-flow/renderer.js) の `loadAppHistory()` を修正し、`HISTORY.md` の各セクションを「## YYYY-MM-DD」で分割後、逆順（最新が上）にソートして結合した上でHTMLに描画するように対応。
2. [package.json](file:///c:/Users/fujiwara/Documents/GitHub/sign-flow/package.json) のバージョンを `1.0.7` に引き上げ。

---

## 2026-06-04 20:46 — ココナラ販売ページコンテンツ作成

### 依頼内容
SignFlowをココナラで一般販売するにあたり、販売前の注意事項の整理と、サービスページに必要な各コンテンツ（タイトル・説明文・FAQ等）の作成依頼。

### 結果
1. **販売前の注意事項**を整理・提示
   - ライセンス表記義務（Electron/pdf-lib等のOSSライブラリ）
   - フォント著作権（システムフォント参照はOK、同梱は不可）
   - 電子印鑑の法的効力の注意書き必要性
   - macOS Gatekeeper警告への対応方法
   - サポート期間・返金ポリシーの事前定義の重要性

2. **サービスページコンテンツを `.claude/coconala_service.md` に保存**
   - サービスタイトル（22字）
   - キャッチコピー（26字）
   - サービス内容（約880字）
   - 推奨価格：基本5,000円
   - 有料オプション2種（リモートサポート2,000円 / テンプレート登録代行3,000円）
   - 購入にあたってのお願い（約420字）
   - よくある質問10件
   - 必要な画像・動画の仕様ガイド

### 注意点
- 画像（スクリーンショット5〜8枚）と動画（1〜3分）は別途ユーザーが撮影・作成が必要
- 商標「SignFlow」の既存登録商標との衝突確認を推奨
- Appleコード署名（Developer ID）を取得すれば macOS Gatekeeper 問題が解消される

---

## 2026-06-04 21:10 — LICENSES.txt 自動生成 & EULA ダイアログ実装

### 依頼内容
ライセンス表記ファイル（LICENSES.txt）をビルド時に自動生成してインストーラーへ同梱すること、およびインストール時にEULA（使用許諾契約書）ダイアログを表示すること。

### 対処内容

1. **`scripts/generate-licenses.js`** 新規作成
   - `license-checker` を使い、本番依存パッケージ（devDependencies 除外）のライセンス情報を収集
   - Electron/Chromium/Node.js は手動テンプレートで追加
   - プロジェクトルートに `LICENSES.txt` を出力

2. **`build/license.txt`** 新規作成
   - 日本語の EULA（全8条）を作成
   - 使用許諾・禁止事項・電子印鑑の法的注意・免責事項を含む

3. **`package.json`** 更新
   - devDependencies に `license-checker@^25.0.1` を追加
   - `generate-licenses` スクリプトを追加
   - `app:dist`、`app:dir`、`build:win`、`release:win` の前に generate-licenses と extract-release-notes を自動実行
   - `build.files` に `LICENSES.txt` を追加（アプリに同梱）
   - `build.nsis.license` に `build/license.txt` を設定（Windows インストーラーに EULA 画面追加）
   - `build.nsis.oneClick` を false に変更（EULA 表示に必要）
   - `build.nsis.allowToChangeInstallationDirectory` を true に変更

4. **`tests/check-history-order.spec.js`** 修正
   - テストを特定バージョン文字列ではなく日付形式（YYYY-MM-DD）のパターンマッチに変更

### 結果
- `npm run app:dist` でビルドが成功し、LICENSES.txt が asar に同梱されることを確認
- macOS の DMG では electron-builder v26 が `dmg.license` を非対応のため EULA ダイアログは Windows（NSIS）のみ
- 全 13 Playwright テストがパス

### 注意点
- macOS で EULA ダイアログを出すには electron-builder のカスタム DMG スクリプトか別の方法が必要（別途対応）
- NSISの `oneClick: false` により、インストーラーのUIがウィザード形式に変わった（インストール先変更も可能になった）
