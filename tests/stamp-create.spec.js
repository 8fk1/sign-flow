const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');

test.describe('印影作成機能', () => {
  let app;
  let page;

  test.beforeAll(async () => {
    app = await electron.launch({
      args: [path.join(__dirname, '..', 'main.js')],
    });
    page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);
  });

  test.afterAll(async () => {
    await app.close();
  });

  test.beforeEach(async () => {
    // マスタ管理タブへ移動（毎テスト前に確実に移動）
    await page.click('#tabBtnMaster');
    await page.waitForTimeout(200);
  });

  test('「テキストから新規作成」ボタンが表示されること', async () => {
    const btn = page.locator('#createStampBtn');
    await expect(btn).toBeVisible();
    await expect(btn).toContainText('テキストから新規作成');
  });

  test('ボタンクリックでモーダルが開くこと', async () => {
    await page.click('#createStampBtn');
    await expect(page.locator('#stampCreateModal')).toHaveClass(/is-active/);
    await expect(page.locator('#stampCreateCanvas')).toBeVisible();
    await expect(page.locator('#stampCreateName')).toBeVisible();
    await expect(page.locator('#stampCreateFilename')).toBeVisible();
    // 閉じておく
    await page.click('#stampCreateCancelBtn');
  });

  test('氏名入力でファイル名が自動入力されること', async () => {
    await page.click('#createStampBtn');
    await page.fill('#stampCreateName', '山田太郎');
    const filenameVal = await page.inputValue('#stampCreateFilename');
    expect(filenameVal).toBe('山田太郎');
    await page.click('#stampCreateCancelBtn');
  });

  test('キャンセルボタンでモーダルが閉じること', async () => {
    await page.click('#createStampBtn');
    await expect(page.locator('#stampCreateModal')).toHaveClass(/is-active/);
    await page.click('#stampCreateCancelBtn');
    await expect(page.locator('#stampCreateModal')).not.toHaveClass(/is-active/);
  });

  test('モーダル背景クリックでモーダルが閉じること', async () => {
    await page.click('#createStampBtn');
    await expect(page.locator('#stampCreateModal')).toHaveClass(/is-active/);
    // モーダルカード外のコーナーをクリック
    await page.click('#stampCreateModalBg', { position: { x: 10, y: 10 } });
    await expect(page.locator('#stampCreateModal')).not.toHaveClass(/is-active/);
  });

  test('氏名なしで保存しようとするとモーダルが閉じないこと', async () => {
    await page.click('#createStampBtn');
    await page.fill('#stampCreateName', '');
    await page.click('#stampCreateSaveBtn');
    // モーダルは閉じていない（バリデーションエラー）
    await expect(page.locator('#stampCreateModal')).toHaveClass(/is-active/);
    await page.click('#stampCreateCancelBtn');
  });

  test('印影を新規作成して一覧に追加されること', async () => {
    const testFilename = `テスト印影_${Date.now()}`;

    // 作成前のカード数を記録
    const beforeCount = await page.locator('#masterStampList .stamp-card').count();

    await page.click('#createStampBtn');
    await page.fill('#stampCreateName', 'テスト');
    await page.fill('#stampCreateFilename', testFilename);
    await page.click('#stampCreateSaveBtn');

    // モーダルが閉じること
    await expect(page.locator('#stampCreateModal')).not.toHaveClass(/is-active/);

    // 一覧にカードが1件追加されること
    await expect(page.locator('#masterStampList .stamp-card')).toHaveCount(beforeCount + 1);
  });

  test('同名ファイル名を指定するとエラーでモーダルが閉じないこと', async () => {
    await page.click('#createStampBtn');
    await page.fill('#stampCreateName', '山田');
    await page.fill('#stampCreateFilename', 'square'); // square.png は既存
    await page.click('#stampCreateSaveBtn');
    // モーダルは閉じていない
    await expect(page.locator('#stampCreateModal')).toHaveClass(/is-active/);
    await page.click('#stampCreateCancelBtn');
  });
});
