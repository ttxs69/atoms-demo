# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: debug-upgrade.spec.ts >> debug: 保住它 button full flow
- Location: e2e/debug-upgrade.spec.ts:5:1

# Error details

```
TimeoutError: locator.waitFor: Timeout 5000ms exceeded.
Call log:
  - waiting for locator('.save-invite') to be visible

```

# Page snapshot

```yaml
- generic [ref=f1e1]:
  - generic [ref=f1e2]:
    - generic [ref=f1e3]:
      - generic [ref=f1e4]: Forge.
      - button "升级保存" [active] [ref=f1e5] [cursor=pointer]
      - button "预览" [ref=f1e6] [cursor=pointer]
    - region "对话" [ref=f1e8]:
      - generic [ref=f1e10]:
        - heading "想做点什么？" [level=1] [ref=f1e11]
        - paragraph [ref=f1e12]:
          - button "换设备了？登录已有账户" [ref=f1e13] [cursor=pointer]
        - paragraph [ref=f1e14]: 描述你想要的网站或工具，Alex 会把它建出来。不需要写代码，也不需要注册。
        - generic [ref=f1e15]:
          - button "📔 记录每日心情的应用 日期、心情等级、备注，数据存在浏览器里" [ref=f1e16] [cursor=pointer]:
            - generic [ref=f1e17]: 📔
            - generic [ref=f1e18]:
              - text: 记录每日心情的应用
              - generic [ref=f1e19]: 日期、心情等级、备注，数据存在浏览器里
          - button "✅ 一个待办清单 可增删、可标记完成、可筛选" [ref=f1e20] [cursor=pointer]:
            - generic [ref=f1e21]: ✅
            - generic [ref=f1e22]:
              - text: 一个待办清单
              - generic [ref=f1e23]: 可增删、可标记完成、可筛选
          - button "⏱️ 番茄钟计时器 25 分钟倒计时、专注历史记录" [ref=f1e24] [cursor=pointer]:
            - generic [ref=f1e25]: ⏱️
            - generic [ref=f1e26]:
              - text: 番茄钟计时器
              - generic [ref=f1e27]: 25 分钟倒计时、专注历史记录
      - generic [ref=f1e28]:
        - textbox "描述你想做的东西" [ref=f1e29]:
          - /placeholder: 描述你想做的东西…
        - generic [ref=f1e30]:
          - button "开始" [disabled] [ref=f1e31]
          - generic [ref=f1e32]: ⌘↩ 发送
  - alert [ref=f1e33]
```

# Test source

```ts
  1  | import { test } from '@playwright/test';
  2  | 
  3  | const URL = 'https://forge-app-production-b189.up.railway.app';
  4  | 
  5  | test('debug: 保住它 button full flow', async ({ page }) => {
  6  |   const logs: string[] = [];
  7  |   page.on('console', (msg) => {
  8  |     if (msg.type() === 'error' || msg.text().includes('[')) logs.push(msg.text().slice(0, 200));
  9  |   });
  10 |   page.on('dialog', (dialog) => {
  11 |     logs.push(`DIALOG: ${dialog.message().slice(0, 150)}`);
  12 |     void dialog.dismiss();
  13 |   });
  14 | 
  15 |   await page.goto(URL, { waitUntil: 'networkidle' });
  16 |   await page.evaluate(() => localStorage.clear());
  17 |   await page.reload({ waitUntil: 'networkidle' });
  18 |   await page.waitForSelector('.topbar button[title]', { timeout: 30000 });
  19 |   await page.waitForTimeout(2000);
  20 |   console.log('✓ identity established');
  21 | 
  22 |   // 点击升级保存按钮打开邀请卡
  23 |   await page.locator('.topbar button', { hasText: '升级保存' }).click();
  24 |   const invite = page.locator('.save-invite');
> 25 |   await invite.waitFor({ timeout: 5000 });
     |                ^ TimeoutError: locator.waitFor: Timeout 5000ms exceeded.
  26 |   console.log('✓ save-invite visible');
  27 | 
  28 |   // 填表
  29 |   const email = `ui-test-${Date.now()}@forge.dev`;
  30 |   await invite.locator('input[type=email]').fill(email);
  31 |   await invite.locator('input[type=password]').fill('ui-test-pass-456');
  32 |   console.log('✓ filled email + password');
  33 | 
  34 |   // 检查按钮是否可点
  35 |   const btn = invite.getByRole('button', { name: /保住它/ });
  36 |   const isDisabled = await btn.isDisabled();
  37 |   console.log(`button disabled: ${isDisabled}`);
  38 |   if (!isDisabled) {
  39 |     console.log('✓ button enabled, clicking...');
  40 |     await btn.click();
  41 |     await page.waitForTimeout(5000);
  42 |     const inviteStillVisible = await invite.isVisible().catch(() => false);
  43 |     console.log(`invite still visible after click: ${inviteStillVisible}`);
  44 |     if (inviteStillVisible) {
  45 |       const text = await invite.textContent();
  46 |       console.log(`invite content: ${text?.slice(0, 200)}`);
  47 |     }
  48 |   }
  49 |   console.log('CONSOLE:', logs.slice(0, 5));
  50 | });
  51 | 
```