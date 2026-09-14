import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

/**
 * magic link 全链（零邮件消耗——generateLink 服务端生成链接，
 * 不触发 Supabase SMTP，不打邮件限流）：
 * 点链接 → /auth/confirm 换 session → cookie → /projects 登录态生效。
 */
const URL_PUBLIC = process.env.PUBLIC_URL!;
const TEST_EMAIL = `e2e-magic-${Date.now()}@gmail.com`;

test('magic link: 点链接 → 登录态 → /projects 可访问', async ({ page }) => {
  test.setTimeout(90_000);
  const admin = createClient(process.env.APPS_SUPABASE_URL!, process.env.APPS_SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
  const { data: link, error } = await admin.auth.admin.generateLink({
    type: 'magiclink', email: TEST_EMAIL,
    options: { redirectTo: `${URL_PUBLIC}/auth/confirm` },
  });
  expect(error).toBeNull();

  await page.goto(link!.properties.action_link, { waitUntil: 'domcontentloaded' });
  await page.waitForURL((u) => !u.href.includes('/auth/confirm'), { timeout: 30_000 });

  const me = await page.evaluate(() => fetch('/api/auth/me').then((r) => r.json()));
  expect(me.user?.email).toBe(TEST_EMAIL);
  console.log('✓ 登录态生效');

  await page.goto(`${URL_PUBLIC}/projects`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Not authenticated')).toBeHidden();
  await expect(page.getByRole('heading', { name: '我的项目' })).toBeVisible({ timeout: 15_000 });
  console.log('✓ /projects 已登录可访问');
});
