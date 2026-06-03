# 自動アップデート機能 実装計画

## アーキテクチャ
- electron-updater (generic provider) + 社内HTTPサーバ
- アプリ起動5秒後に自動チェック → トーストで通知 → ワンクリックで再起動・適用
- 手動チェックボタンをマスタ管理タブに追加

## 配布者のリリース手順（完成後）
1. `package.json` の version を上げる
2. `npm run build:win` でインストーラー + latest.yml を生成
3. `dist/` の `*.exe` と `latest.yml` を社内サーバのURLディレクトリに上書きコピー
4. 終わり（ユーザーは次回起動時に自動通知される）

## 変更ファイル
1. `main.js` — autoUpdater セットアップ + IPC ハンドラ
2. `renderer.js` — IPC リスナー（更新通知・進捗・再起動）
3. `index.html` — 手動チェックボタン + バージョン表示
4. `package.json` — publish 設定 + ビルドスクリプト追加

## UPDATE_SERVER_URL
`main.js` の定数 `UPDATE_SERVER_URL` を変更することで配布先を切り替える。
デフォルト: `http://your-internal-server/sign-flow-updates/`（プレースホルダー）

## 実行結果

2026-06-03 完了。Playwright テスト 12/12 通過。
URLプレースホルダーを社内サーバのURLに差し替えれば即利用可能。
