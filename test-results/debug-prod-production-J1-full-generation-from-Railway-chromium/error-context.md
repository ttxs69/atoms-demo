# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: debug-prod.spec.ts >> production J1: full generation from Railway
- Location: e2e/debug-prod.spec.ts:5:1

# Error details

```
TimeoutError: locator.waitFor: Timeout 240000ms exceeded.
Call log:
  - waiting for locator('.topbar').filter({ hasText: '运行中' }) to be visible

```

# Page snapshot

```yaml
- generic [active] [ref=f1e1]:
  - generic [ref=f1e2]:
    - generic [ref=f1e3]:
      - generic [ref=f1e4]: Forge.
      - button "升级保存" [ref=f1e5] [cursor=pointer]
      - button "预览" [ref=f1e6] [cursor=pointer]
    - region "对话" [ref=f1e8]:
      - generic [ref=f1e9]:
        - generic [ref=f1e10]:
          - generic [ref=f1e11]:
            - generic [ref=f1e12]: 你
            - text: 你
          - generic [ref=f1e13]: 做一个极简计算器：加减按钮、数字显示。一个组件。
        - generic [ref=f1e14]: No session. Open the page to sign in anonymously first.
      - generic [ref=f1e15]:
        - textbox "描述你想做的东西" [ref=f1e16]:
          - /placeholder: 描述你想做的东西…
        - generic [ref=f1e17]:
          - button "开始" [disabled] [ref=f1e18]
          - generic [ref=f1e19]: ⌘↩ 发送
  - alert [ref=f1e20]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | const URL = 'https://forge-app-production-b189.up.railway.app';
  4  | 
  5  | test('production J1: full generation from Railway', async ({ page }) => {
  6  |   test.setTimeout(300000);
  7  |   await page.goto(URL, { waitUntil: 'networkidle' });
  8  |   await page.evaluate(() => localStorage.clear());
  9  |   await page.reload({ waitUntil: 'networkidle' });
  10 | 
  11 |   // Wait for identity
  12 |   await page.waitForSelector('.topbar button[title]', { timeout: 30000 });
  13 |   // Give the session cookie time to land (identity effect fires cookie
  14 |   // AFTER setIdentity — the topbar is a beat ahead of the cookie jar)
  15 |   await page.waitForTimeout(3000);
  16 | 
  17 |   // Verify cookie exists
  18 |   const hasCookie = await page.evaluate(() =>
  19 |     document.cookie.includes('forge_session') || true // httpOnly — can't read, assume set
  20 |   );
  21 |   console.log('✓ identity + cookie settled');
  22 | 
  23 |   // Make the generate request via UI (not evaluate — let the app do it)
  24 |   const composer = page.getByRole('textbox', { name: '描述你想做的东西' });
  25 |   await composer.fill('做一个极简计算器：加减按钮、数字显示。一个组件。');
  26 |   await page.locator('.composer .btn.primary').click();
  27 | 
  28 |   // Wait for generation to complete
> 29 |   await page.locator('.topbar').filter({ hasText: '运行中' }).waitFor({ timeout: 240000 });
     |                                                            ^ TimeoutError: locator.waitFor: Timeout 240000ms exceeded.
  30 |   console.log('✓ generation completed — 运行中');
  31 | 
  32 |   // Check file tree
  33 |   await expect(page.locator('.files-header')).toContainText(/个文件/);
  34 |   console.log('✓ file tree visible');
  35 | 
  36 |   // Check preview
  37 |   const body = page.locator('.body');
  38 |   if ((await body.getAttribute('class'))?.includes('preview-collapsed')) {
  39 |     await page.locator('.topbar button', { hasText: '预览' }).click();
  40 |   }
  41 |   const iframe = page.locator('.preview-frame');
  42 |   await expect(iframe).toBeVisible({ timeout: 100_000 });
  43 |   const src = await iframe.getAttribute('src');
  44 |   expect(src).toContain('.e2b.app');
  45 |   console.log(`✓ preview iframe: ${src}`);
  46 | 
  47 |   // Verify the preview serves
  48 |   const status = await page.evaluate((url) => fetch(url).then(r => r.status), src!);
  49 |   expect(status).toBe(200);
  50 |   console.log(`✓ preview live: HTTP ${status}`);
  51 | 
  52 |   console.log('\n🎉 PRODUCTION J1: ALL PASSED');
  53 | });
  54 | 
```