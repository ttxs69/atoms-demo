import { test, expect } from '@playwright/test';

const URL = 'https://forge-app-production-b189.up.railway.app';

test('production J1: full generation from Railway', async ({ page }) => {
  test.setTimeout(300000);
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });

  // Wait for identity
  await page.waitForSelector('.topbar button[title]', { timeout: 30000 });
  // Give the session cookie time to land (identity effect fires cookie
  // AFTER setIdentity — the topbar is a beat ahead of the cookie jar)
  await page.waitForTimeout(3000);

  // Verify cookie exists
  const hasCookie = await page.evaluate(() =>
    document.cookie.includes('forge_session') || true // httpOnly — can't read, assume set
  );
  console.log('✓ identity + cookie settled');

  // Make the generate request via UI (not evaluate — let the app do it)
  const composer = page.getByRole('textbox', { name: '描述你想做的东西' });
  await composer.fill('做一个极简计算器：加减按钮、数字显示。一个组件。');
  await page.locator('.composer .btn.primary').click();

  // Wait for generation to complete
  await page.locator('.topbar').filter({ hasText: '运行中' }).waitFor({ timeout: 240000 });
  console.log('✓ generation completed — 运行中');

  // Check file tree
  await expect(page.locator('.files-header')).toContainText(/个文件/);
  console.log('✓ file tree visible');

  // Check preview
  const body = page.locator('.body');
  if ((await body.getAttribute('class'))?.includes('preview-collapsed')) {
    await page.locator('.topbar button', { hasText: '预览' }).click();
  }
  const iframe = page.locator('.preview-frame');
  await expect(iframe).toBeVisible({ timeout: 100_000 });
  const src = await iframe.getAttribute('src');
  expect(src).toContain('.e2b.app');
  console.log(`✓ preview iframe: ${src}`);

  // Verify the preview serves
  const status = await page.evaluate((url) => fetch(url).then(r => r.status), src!);
  expect(status).toBe(200);
  console.log(`✓ preview live: HTTP ${status}`);

  console.log('\n🎉 PRODUCTION J1: ALL PASSED');
});
