import { test } from '@playwright/test';

test('debug: what happens during identity establishment', async ({ page }) => {
  const logs: string[] = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => logs.push(`[PAGE_ERROR] ${err.message}`));
  page.on('requestfailed', (req) => logs.push(`[REQ_FAIL] ${req.url()} — ${req.failure()?.errorText}`));

  await page.goto('https://forge-app-production-b189.up.railway.app', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(15000); // Wait 15s for identity to establish

  const topbarText = await page.locator('.topbar').textContent();
  const identitySet = topbarText?.includes('升级保存');
  console.log('TOPBAR:', topbarText);
  console.log('IDENTITY SET:', identitySet);
  console.log('CONSOLE OUTPUT:');
  logs.filter(l => !l.includes('favicon') && !l.includes('Download the React')).forEach(l => console.log(' ', l));
});
