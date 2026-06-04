# 計画: リポジトリパブリック化前の機密情報除去

作成日: 2026-06-04

## 除去が必要な機密情報

| 場所 | 内容 | 対処 |
|---|---|---|
| `main.js:17` | GitHub PAT トークン（ハードコード） | 削除してパブリック向け設定に変更 |
| git 履歴（複数コミット） | 同トークン2種類がコミット済み | git-filter-repo で履歴から抹消 |
| `package.json` author | 会社メールアドレス | 変更 |

## 手順

1. `main.js` のトークン除去・パブリック設定に変更
2. `package.json` の author を変更
3. `.gitignore` を整備（test-results/, LICENSES.txt, static/img/.DS_Store 等）
4. git-filter-repo をインストールして履歴からトークンを完全削除
5. GitHub でトークンを revoke（ユーザー作業）
6. force push
7. GitHub でリポジトリをパブリック化（ユーザー作業）
