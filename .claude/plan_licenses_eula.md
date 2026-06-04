# 計画: LICENSES.txt 同梱 & EULA ダイアログ実装

作成日: 2026-06-04

## 変更対象

| ファイル | 種別 | 内容 |
|---|---|---|
| `scripts/generate-licenses.js` | 新規 | license-checker でOSSライセンスを収集しLICENSES.txtを生成 |
| `build/license.txt` | 新規 | インストーラーに表示するEULAテキスト（日本語） |
| `LICENSES.txt` | 生成物 | ビルド前に自動生成。インストーラーに同梱 |
| `package.json` | 更新 | devDependenciesにlicense-checker追加、scripts更新、build設定にeula/licenses設定追加 |

## 実装手順

1. `license-checker` を devDependencies にインストール
2. `scripts/generate-licenses.js` 作成
   - 本番依存（dependencies）のみ対象（devDependenciesは除外）
   - 各パッケージのライセンス名・バージョン・著作権表示を LICENSES.txt に出力
3. `build/license.txt` 作成
   - 日本語のEULA（使用許諾契約）
4. `package.json` 更新
   - `app:dist` スクリプトの前に generate-licenses を実行
   - `build.files` に `LICENSES.txt` を追加
   - `build.nsis.license` に `"build/license.txt"` を設定（Windows インストーラーにEULA画面追加）
   - `build.dmg.license` に `"build/license.txt"` を設定（macOS DMGにEULA画面追加）

## 注意点

- NSISはUnicode TXTをサポートするが、文字化け防止のため UTF-8 BOM なしで記述
- DMGのライセンス表示はmacOSの標準UIを使用（日本語対応）
- LICENSES.txtの生成対象は本番依存パッケージのみ（Playwright等のdevDependenciesは除外）
- Electronのバイナリ自体のライセンス（MIT）は手書きで追記
