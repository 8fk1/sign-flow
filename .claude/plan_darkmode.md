# ライト/ダークモード切り替え 実装計画

## 概要
CSS変数が既に整備されているため、ダーク用変数セットを追加し、トグルボタンで `data-theme="dark"` を `<html>` 要素に付け外しする方式で実装する。

## 実装ステップ

### 1. style.css
- `:root` に不足しているCSS変数を追加（ハードコードされた色値を変数化）
- `[data-theme="dark"] :root` にダーク用の変数値を定義
- テーマトグルボタン自体のスタイルを追加

### 2. index.html
- ヘッダー右端にテーマトグルボタンを追加
  - Sun / Moon アイコン（FontAwesome）
  - `id="themeToggleBtn"`

### 3. renderer.js
- 初期化時に `localStorage.getItem('theme')` を読み込み適用
- `themeToggleBtn` クリックで `document.documentElement.dataset.theme` を切り替え
- 変更を `localStorage.setItem('theme', ...)` に保存

## CSS変数追加リスト
追加する変数（ハードコード色を変数化）:
- `--input-bg` (#ffffff / #1e293b)
- `--drop-border` (#cbd5e1 / #475569)
- `--drop-hover-bg` (#eff6ff / #1e3a5f)
- `--drop-dragover-bg` (#dbeafe / #1e3a8f)
- `--hover-bg` (#f1f5f9 / #334155)
- `--danger-hover-bg` (#fee2e2 / #450a0a)
- `--setting-row-bg` (#f8fafc / #0f172a)
- `--mode-switch-bg` (#e2e8f0 / #334155)
- `--mode-active-bg` (#ffffff / #475569)
- `--file-count-badge-bg` (#e2e8f0 / #334155)
- `--date-panel-bg` (#f0fdf4 / #022c22)
- `--date-panel-border` (#a7f3d0 / #064e3b)
- `--stamp-thumbnail-bg` (#f8fafc / #0f172a)
- `--modal-head-foot-bg` (#ffffff / #1e293b)
- `--toast-bg` (#ffffff / #1e293b)
- `--stamp-panel-bg` (#f8fafc / #0f172a)
- `--pair-row-bg` (#ffffff / #1e293b)
- `--pair-row-border` (#e2e8f0 / #334155)
- `--rename-row-bg` (#f8fafc / #0f172a)
- `--canvas-bg` (#ffffff / #1e293b)
- `--preview-canvas-border` (#cbd5e1 / #475569)

## テスト
- `npx playwright test` で全テストをパスさせる

## ステータス
- [x] 計画保存
- [x] style.css 変数化＆ダーク変数定義
- [x] index.html トグルボタン追加
- [x] renderer.js 切り替えロジック追加
- [x] テスト実行・パス確認 → 12/12 passed
