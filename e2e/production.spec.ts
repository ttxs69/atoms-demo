import { test, expect } from '@playwright/test';

/**
 * Production J1 verification — against the PUBLIC tunnel URL.
 * This proves Forge works from the internet, not just localhost.
 */
const PUBLIC_URL = process.env.PUBLIC_URL ?? 'https://free-days-hammer.loca.lt';

test('J1 production: first visit → generate → preview', async ({ page }) => {
  test.slow(); // real generation on a real tunnel
  await page.setViewportSize({ width: 1280, height: 800 });

  // 1. Visit — empty state renders
  await page.goto(PUBLIC_URL);
  await expect(page.getByRole('heading', { name: '想做点什么？' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('待办清单')).toBeVisible();
  await expect(page.getByText('不需要写代码')).toBeVisible();
  console.log('✓ Step 1: Empty state renders from public URL');

  // 2. Identity — silent anonymous sign-in
  await expect(page.locator('.topbar')).toContainText('升级保存', { timeout: 30_000 });
  console.log('✓ Step 2: Anonymous identity established (Supabase)');

  // 3. Generate — full pipeline
  const composer = page.getByRole('textbox', { name: '描述你想做的东西' });
  await composer.fill('做一个极简计算器：加减按钮、当前数字。一个组件就够。');
  await page.locator('.composer .btn.primary').click();

  // Wait for completion
  await expect(page.locator('.topbar')).toContainText('运行中', { timeout: 180_000 });
  console.log('✓ Step 3: Generation completed');

  // 4. File tree visible
  await expect(page.locator('.files-header')).toContainText(/个文件/);
  console.log('✓ Step 4: File tree visible');

  // 5. Preview iframe — get URL and verify it serves
  const body = page.locator('.body');
  if ((await body.getAttribute('class'))?.includes('preview-collapsed')) {
    await page.locator('.topbar button', { hasText: '预览' }).click();
  }
  const iframe = page.locator('.preview-frame');
  await expect(iframe).toBeVisible({ timeout: 10_000 });
  const src = await iframe.getAttribute('src');
  expect(src).toContain('.e2b.app');
  console.log(`✓ Step 5: Preview iframe at ${src}`);

  // 6. Preview URL actually serves the app
  const status = await page.evaluate(
    (url) => fetch(url).then((r) => r.status),
    src!,
  );
  expect(status).toBe(200);
  console.log(`✓ Step 6: Preview URL returns ${status} — app is live`);

  console.log('\n🎉 PRODUCTION J1: ALL PASSED');
});
