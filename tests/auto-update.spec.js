const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');

test.describe('自動アップデートUI', () => {
  let app;
  let page;

  test.beforeAll(async () => {
    app = await electron.launch({
      args: [path.join(__dirname, '..', 'main.js')],
    });
    page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);
    // アプリ情報タブへ移動
    await page.click('#tabBtnInfo');
    await page.waitForTimeout(300);
  });

  test.afterAll(async () => {
    await app.close();
  });

  test('現在のバージョンが表示されること', async () => {
    const versionEl = page.locator('#currentAppVersion');
    await expect(versionEl).toBeVisible();
    const text = await versionEl.textContent();
    // v1.x.x 形式で表示されること
    expect(text).toMatch(/^v\d+\.\d+\.\d+/);
  });

  test('「アップデートを今すぐ確認」ボタンが表示されること', async () => {
    const btn = page.locator('#checkUpdateBtn');
    await expect(btn).toBeVisible();
    await expect(btn).toContainText('アップデートを今すぐ確認');
  });

  test('ボタンをクリックしてもアプリがクラッシュしないこと', async () => {
    // UPDATER_TOKEN 未設定なのでエラーになるが、UIが壊れないことを確認
    await page.click('#checkUpdateBtn');
    await page.waitForTimeout(3000);
    // ボタンが引き続き操作できること
    await expect(page.locator('#checkUpdateBtn')).toBeVisible();
    await expect(page.locator('#currentAppVersion')).toBeVisible();
  });

  test('アップデートバッジは初期状態で非表示であること', async () => {
    const badge = page.locator('#updateVersionBadge');
    // display: none なので不可視
    await expect(badge).toBeHidden();
  });
});
