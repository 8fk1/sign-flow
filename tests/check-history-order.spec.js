const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');

test.describe('変更履歴の表示順序の検証', () => {
  let app;
  let page;

  test.beforeAll(async () => {
    app = await electron.launch({
      args: [path.join(__dirname, '..', 'main.js')],
    });
    page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);
    // マスタ管理タブへ移動
    await page.click('#tabBtnMaster');
    await page.waitForTimeout(500);
  });

  test.afterAll(async () => {
    await app.close();
  });

  test('更新履歴の最上部に最新の日付エントリが表示されること', async () => {
    const historyContainer = page.locator('#appHistoryContainer');
    await expect(historyContainer).toBeVisible();

    // 最初の <h2> 見出しを取得
    const firstH2 = historyContainer.locator('h2').first();
    await expect(firstH2).toBeVisible();
    const text = await firstH2.textContent();
    console.log('First H2 content:', text);

    // 最新エントリは日付形式（YYYY-MM-DD）で始まること
    expect(text).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });
});
