# GitHub Releases 自動アップデート実装計画（プライベートリポジトリ）

## 構成
- provider: github（electron-updater公式対応）
- リリース作成: GitHub Actions（GITHUB_TOKEN、追加設定不要）
- ダウンロード認証: 読み取り専用 PAT をアプリに埋め込む

## トリガー
main ブランチへの push → package.json の version が変わっていたら自動ビルド・リリース

## ユーザーが1度だけ行う手順
1. GitHub で fine-grained PAT を作成（Contents: Read-only）
2. main.js の UPDATER_TOKEN を書き換えてコミット

## 変更ファイル
1. `.github/workflows/release.yml` — 新規作成
2. `main.js` — provider を github に変更
3. `package.json` — publish 設定を github に変更

## 実行結果（後で記入）
