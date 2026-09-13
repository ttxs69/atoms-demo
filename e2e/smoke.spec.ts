import { test, expect } from '@playwright/test';

/**
 * 冒烟测试——每个路由加载无报错，< 5 秒/个，4 worker 并行。
 *
 * 只验证：HTTP 200、关键元素渲染、无 JS 错误。
 * 不验证：交互逻辑、状态变化、表单验证（这些在 vitest 集成测试里）。
 */

const URL = process.env.PUBLIC_URL ?? 'http://localhost:3000';

test('首页加载 + 关键元素', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/supabase.co/**', (r) => r.abort()); // 不依赖外部

  const resp = await page.goto(URL, { waitUntil: 'domcontentloaded' });
  expect(resp?.status()).toBe(200);

  // 关键元素存在
  await expect(page.getByText('Forge.')).toBeVisible();
  await expect(page.getByText('想做点什么？')).toBeVisible();
  // 换设备了链接（不再是按钮，是 anchor）
  await expect(page.getByRole('link', { name: /换设备了/ })).toBeVisible();

  // 等 dev fallback 完成（Supabase 被 abort → 4s timeout 触发 dev 模式）
  await expect(page.locator('header')).toContainText(/dev-|连接中/, { timeout: 6000 });

  // JS 错误过滤掉 favicon 之类的噪音
  const real = errors.filter((e) => !e.includes('favicon') && !e.includes('AbortError'));
  expect(real).toEqual([]);
});

test('/login 页面加载 + 标题', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/supabase.co/**', (r) => r.abort());

  const resp = await page.goto(`${URL}/login`, { waitUntil: 'domcontentloaded' });
  expect(resp?.status()).toBe(200);

  // 加载中（Supabase 被 abort 时）或 Auth UI 之一
  await expect(page.getByText(/加载中|魔法链接|邮箱/)).toBeVisible({ timeout: 3000 });

  const real = errors.filter((e) => !e.includes('favicon') && !e.includes('AbortError'));
  expect(real).toEqual([]);
});

test('404 页面正常', async ({ page }) => {
  const resp = await page.goto(`${URL}/nonexistent-page-xyz`, { waitUntil: 'domcontentloaded' });
  // Next.js 404 不算 error
  expect([200, 404]).toContain(resp?.status());
});
