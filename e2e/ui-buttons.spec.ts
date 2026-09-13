import { test, expect } from '@playwright/test';

/**
 * UI 按钮级测试——每个用户可交互的元素至少一个断言。
 * 每个测试 < 15 秒，不依赖外部服务（不生成应用）。
 *
 * 这组测试存在的理由：JSX fragment bug 和按钮条件 bug 都在 UI 层，
 * 而此前的 85 个单元测试全在 orchestrator/纯函数层——金字塔的 UI 层是空的。
 */

const URL = process.env.PUBLIC_URL ?? 'http://localhost:3000';

test.describe('顶栏按钮', () => {
  test('升级保存 opens the invite card even without a preview', async ({ page }) => {
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('.topbar button[title]', { timeout: 30000 });
    // 没有生成过任何应用 → previewUrl 是 null
    await page.locator('.topbar button', { hasText: '升级保存' }).click();
    await expect(page.locator('.save-invite')).toBeVisible({ timeout: 5000 });
  });

  test('以后再说 dismisses the invite and persists', async ({ page }) => {
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('.topbar button[title]', { timeout: 30000 });
    await page.locator('.topbar button', { hasText: '升级保存' }).click();
    await expect(page.locator('.save-invite')).toBeVisible({ timeout: 5000 });
    await page.locator('.save-invite button', { hasText: '以后再说' }).click();
    await expect(page.locator('.save-invite')).toBeHidden({ timeout: 5000 });
    // localStorage 记住了关闭
    const dismissed = await page.evaluate(() => localStorage.getItem('forge-save-dismissed'));
    expect(dismissed).toBe('1');
  });
});

test.describe('升级表单验证', () => {
  test('保住它 is disabled until both email and password are valid', async ({ page }) => {
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('.topbar button[title]', { timeout: 30000 });
    await page.locator('.topbar button', { hasText: '升级保存' }).click();
    const invite = page.locator('.save-invite');
    await expect(invite).toBeVisible({ timeout: 5000 });

    const btn = invite.getByRole('button', { name: /保住它/ });
    // 空 → 禁用
    await expect(btn).toBeDisabled();
    // 只有邮箱 → 禁用
    await invite.locator('input[type=email]').fill('test@forge.dev');
    await expect(btn).toBeDisabled();
    // 密码太短 → 禁用
    await invite.locator('input[type=password]').fill('123');
    await expect(btn).toBeDisabled();
    // 都有效 → 启用
    await invite.locator('input[type=password]').fill('valid-pass-456');
    await expect(btn).toBeEnabled();
  });
});

test.describe('空状态', () => {
  test('三个样例可点击并填入 composer', async ({ page }) => {
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('.topbar button[title]', { timeout: 30000 });

    for (const label of ['记录每日心情', '待办清单', '番茄钟']) {
      const btn = page.locator('.examples button', { hasText: label });
      await btn.click();
      const value = await page.getByRole('textbox', { name: '描述你想做的东西' }).inputValue();
      expect(value).toContain(label);
    }
  });

  test('登录已有账户 link opens the login box', async ({ page }) => {
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('.topbar button[title]', { timeout: 30000 });
    await page.locator('.linklike', { hasText: '登录已有账户' }).click();
    await expect(page.getByRole('heading', { name: '登录已有账户' })).toBeVisible({ timeout: 5000 });
    // 登录和匿名开始按钮都在
    await expect(page.locator('.login-box button', { hasText: '直接开始' })).toBeVisible();
  });
});

test.describe('预览面板', () => {
  test('预览 toggle button switches panel visibility', async ({ page }) => {
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('.topbar button[title]', { timeout: 30000 });
    const body = page.locator('.body');
    const before = await body.getAttribute('class');
    await page.locator('.topbar button', { hasText: '预览' }).click();
    const after = await body.getAttribute('class');
    expect(before).not.toBe(after); // class 变了 = 面板开合了
  });
});
