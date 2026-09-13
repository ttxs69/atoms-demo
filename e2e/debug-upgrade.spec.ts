import { test } from '@playwright/test';

const URL = 'https://forge-app-production-b189.up.railway.app';

test('debug: 保住它 button full flow', async ({ page }) => {
  const logs: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.text().includes('[')) logs.push(msg.text().slice(0, 200));
  });
  page.on('dialog', (dialog) => {
    logs.push(`DIALOG: ${dialog.message().slice(0, 150)}`);
    void dialog.dismiss();
  });

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.topbar button[title]', { timeout: 30000 });
  await page.waitForTimeout(2000);
  console.log('✓ identity established');

  // 点击升级保存按钮打开邀请卡
  await page.locator('.topbar button', { hasText: '升级保存' }).click();
  const invite = page.locator('.save-invite');
  await invite.waitFor({ timeout: 5000 });
  console.log('✓ save-invite visible');

  // 填表
  const email = `ui-test-${Date.now()}@forge.dev`;
  await invite.locator('input[type=email]').fill(email);
  await invite.locator('input[type=password]').fill('ui-test-pass-456');
  console.log('✓ filled email + password');

  // 检查按钮是否可点
  const btn = invite.getByRole('button', { name: /保住它/ });
  const isDisabled = await btn.isDisabled();
  console.log(`button disabled: ${isDisabled}`);
  if (!isDisabled) {
    console.log('✓ button enabled, clicking...');
    await btn.click();
    await page.waitForTimeout(5000);
    const inviteStillVisible = await invite.isVisible().catch(() => false);
    console.log(`invite still visible after click: ${inviteStillVisible}`);
    if (inviteStillVisible) {
      const text = await invite.textContent();
      console.log(`invite content: ${text?.slice(0, 200)}`);
    }
  }
  console.log('CONSOLE:', logs.slice(0, 5));
});
