import { test, expect } from '@playwright/test';

const URL = process.env.PUBLIC_URL ?? 'http://localhost:3000';

const goto = async (page: import('@playwright/test').Page, path = '/') => {
  await page.route('**/supabase.co/**', (r) => r.abort());
  await page.goto(`${URL}${path}`, { waitUntil: 'domcontentloaded' });
};

test('首页加载', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await goto(page);
  expect(await page.getByText('想做点什么？').isVisible()).toBe(true);
  expect(errors.filter((e) => !e.includes('favicon'))).toEqual([]);
});

test('/login 是 OTP 表单', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await goto(page, '/login');
  // OTP 第一步：邮箱输入
  await expect(page.getByLabel('邮箱')).toBeVisible({ timeout: 5000 });
  // 发送按钮
  await expect(page.getByRole('button', { name: /发送验证码/ })).toBeVisible();
  // 跳过链接
  await expect(page.getByRole('link', { name: /跳过/ })).toBeVisible();
  expect(errors.filter((e) => !e.includes('favicon'))).toEqual([]);
});

test('/projects 未登录跳 /login', async ({ page }) => {
  await goto(page, '/projects');
  // /api/auth/me 返回 null → useEffect 跳 /login
  await page.waitForURL(/\/login/, { timeout: 5000 });
});

test('404 页面正常', async ({ page }) => {
  const resp = await page.goto(`${URL}/nonexistent-xyz`, { waitUntil: 'domcontentloaded' });
  expect([200, 404]).toContain(resp?.status());
});
