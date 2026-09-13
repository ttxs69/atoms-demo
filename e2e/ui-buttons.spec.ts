import { test, expect } from '@playwright/test';

/**
 * UI 单元测试（< 3 秒/个，4 worker 并行）。
 *
 * 只验证 UI 行为：可见性、点击、文本、状态变化。
 * 不做：真实 API 调用、第三方资源等待、端到端流程。
 *
 * shadcn/ui：用 ARIA role / label / placeholder 定位，不用 class。
 */

const URL = process.env.PUBLIC_URL ?? 'http://localhost:3000';

const goto = async (page: import('@playwright/test').Page, path = '/') => {
  await page.goto(`${URL}${path}`, { waitUntil: 'domcontentloaded' });
};

test.describe('空状态', () => {
  test('三个样例可点击并填入 composer', async ({ page }) => {
    await goto(page);
    const composer = page.getByLabel('描述你想做的东西');
    await expect(composer).toBeVisible();
    for (const label of ['记录每日心情', '待办清单', '番茄钟']) {
      await page.getByRole('button', { name: new RegExp(label) }).first().click();
      expect(await composer.inputValue()).toContain(label);
    }
  });

  test('换设备了 link opens login form', async ({ page }) => {
    await goto(page);
    await page.getByRole('button', { name: /换设备了/ }).click();
    await expect(page.getByRole('heading', { name: '登录已有账户' })).toBeVisible();
    await expect(page.getByRole('button', { name: /登录/ }).first()).toBeVisible();
  });
});

test.describe('顶栏', () => {
  test('预览 toggle button changes text after click', async ({ page }) => {
    await goto(page);
    // 按钮初始文案 "预览"，点击后变成 "收起预览"
    const btn = page.locator('header').getByRole('button', { name: '预览' });
    await expect(btn).toBeVisible();
    await btn.click();
    // 点击后，按钮文案必须改变（shadcn 状态切换）
    await expect(page.locator('header').getByRole('button', { name: '收起预览' })).toBeVisible({ timeout: 2000 });
  });

  test('身份建立后显示升级保存链接', async ({ page }) => {
    await goto(page);
    // 等待匿名登录完成（identity 从 null → user id）
    // 顶栏会出现 "升级保存" 或 "已绑定邮箱" badge
    // 接受 30 秒内（Supabase 匿名登录的网络往返）
    await expect(page.locator('header a[href="/login"]')).toBeVisible({ timeout: 30000 });
    const href = await page.locator('header a[href="/login"]').getAttribute('href');
    expect(href).toBe('/login');
  });
});

test.describe('/login 页面', () => {
  test('Supabase Auth UI renders email/password fields', async ({ page }) => {
    await goto(page, '/login');
    await expect(page.locator('input[type=email]')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('input[type=password]').first()).toBeVisible();
    await expect(page.getByRole('link', { name: /跳过/ })).toBeVisible();
  });

  test('跳过 link points to /', async ({ page }) => {
    await goto(page, '/login');
    const skip = page.getByRole('link', { name: /跳过/ });
    expect(await skip.getAttribute('href')).toBe('/');
  });
});
