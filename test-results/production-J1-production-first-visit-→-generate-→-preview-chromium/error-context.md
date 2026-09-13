# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: production.spec.ts >> J1 production: first visit → generate → preview
- Location: e2e/production.spec.ts:9:1

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('.topbar')
Expected substring: "运行中"
Received string:    "Forge.升级保存预览"
Timeout: 180000ms

Call log:
  - Expect "toContainText" locator('.topbar') with timeout 180000ms
  - waiting for locator('.topbar')
    6 × locator resolved to <div class="topbar">…</div>
      - unexpected value "Forge.生成中升级保存预览"
    356 × locator resolved to <div class="topbar">…</div>
        - unexpected value "Forge.升级保存预览"

```

```yaml
- text: Forge.
- button "升级保存"
- button "预览"
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | /**
  4  |  * Production J1 verification — against the PUBLIC tunnel URL.
  5  |  * This proves Forge works from the internet, not just localhost.
  6  |  */
  7  | const PUBLIC_URL = process.env.PUBLIC_URL ?? 'https://free-days-hammer.loca.lt';
  8  | 
  9  | test('J1 production: first visit → generate → preview', async ({ page }) => {
  10 |   test.slow(); // real generation on a real tunnel
  11 |   await page.setViewportSize({ width: 1280, height: 800 });
  12 | 
  13 |   // 1. Visit — empty state renders
  14 |   await page.goto(PUBLIC_URL);
  15 |   await expect(page.getByRole('heading', { name: '想做点什么？' })).toBeVisible({ timeout: 30_000 });
  16 |   await expect(page.getByText('待办清单')).toBeVisible();
  17 |   await expect(page.getByText('不需要写代码')).toBeVisible();
  18 |   console.log('✓ Step 1: Empty state renders from public URL');
  19 | 
  20 |   // 2. Identity — silent anonymous sign-in
  21 |   await expect(page.locator('.topbar')).toContainText('升级保存', { timeout: 30_000 });
  22 |   console.log('✓ Step 2: Anonymous identity established (Supabase)');
  23 | 
  24 |   // 3. Generate — full pipeline
  25 |   const composer = page.getByRole('textbox', { name: '描述你想做的东西' });
  26 |   await composer.fill('做一个极简计算器：加减按钮、当前数字。一个组件就够。');
  27 |   await page.locator('.composer .btn.primary').click();
  28 | 
  29 |   // Wait for completion
> 30 |   await expect(page.locator('.topbar')).toContainText('运行中', { timeout: 180_000 });
     |                                         ^ Error: expect(locator).toContainText(expected) failed
  31 |   console.log('✓ Step 3: Generation completed');
  32 | 
  33 |   // 4. File tree visible
  34 |   await expect(page.locator('.files-header')).toContainText(/个文件/);
  35 |   console.log('✓ Step 4: File tree visible');
  36 | 
  37 |   // 5. Preview iframe — get URL and verify it serves
  38 |   const body = page.locator('.body');
  39 |   if ((await body.getAttribute('class'))?.includes('preview-collapsed')) {
  40 |     await page.locator('.topbar button', { hasText: '预览' }).click();
  41 |   }
  42 |   const iframe = page.locator('.preview-frame');
  43 |   await expect(iframe).toBeVisible({ timeout: 10_000 });
  44 |   const src = await iframe.getAttribute('src');
  45 |   expect(src).toContain('.e2b.app');
  46 |   console.log(`✓ Step 5: Preview iframe at ${src}`);
  47 | 
  48 |   // 6. Preview URL actually serves the app
  49 |   const status = await page.evaluate(
  50 |     (url) => fetch(url).then((r) => r.status),
  51 |     src!,
  52 |   );
  53 |   expect(status).toBe(200);
  54 |   console.log(`✓ Step 6: Preview URL returns ${status} — app is live`);
  55 | 
  56 |   console.log('\n🎉 PRODUCTION J1: ALL PASSED');
  57 | });
  58 | 
```