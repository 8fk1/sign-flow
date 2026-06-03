# 印影作成機能 実装計画

## 概要
マスタ管理タブに「テキストから新規作成」機能を追加する。
Canvas APIで丸印（赤・1重円・縦書き）を生成し、PNG として stampFolder に保存する。

## 設計決定
- スタイル: 丸印・赤（#cc0000）・1重円・縦書き
- テキスト: 氏名1行のみ（1〜6文字程度）
- UI配置: マスタ管理タブの「画像を選択して登録」ボタン下に「テキストから新規作成」ボタン
- フォーム: 氏名入力 + ファイル名入力（氏名から自動提案・上書き可）
- 生成: Canvas API（レンダラー側） → fs.writeFileSync でファイル保存
- プレビュー: 入力中リアルタイム表示（Canvas描画）
- フォント: システムフォント自動（ヒラギノ/游明朝/serif のCSSフォントスタック）

## 変更ファイル
1. `index.html` — 「新規作成」ボタン追加 + 印影作成モーダル追加
2. `renderer.js` — DOM参照追加 + drawStampOnCanvas関数 + モーダルイベント
3. `static/css/style.css` — 不要（Bulmaのmodalクラスを流用）

## 実装詳細

### Canvas描画ロジック
- キャンバスサイズ: 200x200px
- 円: cx=cy=100, radius=88, lineWidth=7, strokeStyle='#cc0000'
- 文字: 1文字ずつ縦方向に配置（Array.from でUnicode対応）
- フォントサイズ: 内側高さ(radius*1.6) / (文字数*1.05) で自動計算、14〜70px にクランプ
- 未入力時はプレースホルダー表示

### 保存フロー
1. canvas.toDataURL('image/png') → base64
2. fs.writeFileSync(stampFolder + filename, Buffer.from(base64, 'base64'))
3. stampImages 配列に追加 → localStorage 更新
4. stampMeta に 200x200 として登録
5. モーダルを閉じ、showToast('成功') → renderMasterView()

## 実行結果

2026-06-03 21:56 完了。
- `index.html`・`renderer.js` を変更して実装完了。
- `playwright.config.js`・`tests/stamp-create.spec.js` を新規作成。
- Playwright テスト 8/8 通過。
