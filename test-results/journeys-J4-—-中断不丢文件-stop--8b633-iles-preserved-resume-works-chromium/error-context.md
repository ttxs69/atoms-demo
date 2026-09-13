# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: journeys.spec.ts >> J4 — 中断不丢文件 >> stop mid-generation, files preserved, resume works
- Location: e2e/journeys.spec.ts:136:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('.stopped-banner')
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" locator('.stopped-banner') with timeout 15000ms
  - waiting for locator('.stopped-banner')

```

```yaml
- text: Forge.
- button "升级保存"
- button "预览"
- region "对话":
  - textbox "描述你想做的东西":
    - /placeholder: 描述你想做的东西…
  - button "开始" [disabled]
  - text: ⌘↩ 发送
- alert
```

# Test source

```ts
  50  | 
  51  |     // Type and submit
  52  |     const composer = page.getByRole('textbox', { name: '描述你想做的东西' });
  53  |     await composer.fill('做一个极简计数器：加减按钮、当前数字显示。只要一个组件。');
  54  |     await page.getByRole('button', { name: '开始' }).click();
  55  | 
  56  |     // Streaming: 停止 button appears (generation in flight)
  57  |     await expect(page.getByRole('button', { name: /停止/ })).toBeVisible({ timeout: 15_000 });
  58  | 
  59  |     // Wait for completion: 顶栏 switches to 运行中
  60  |     await expect(page.locator('.topbar')).toContainText('运行中', { timeout: 120_000 });
  61  | 
  62  |     // File tree appeared with at least App.tsx
  63  |     await expect(page.locator('.files-header')).toContainText(/个文件/);
  64  |     await expect(page.locator('.file-line', { hasText: 'src/App.tsx' })).toBeVisible();
  65  | 
  66  |     // Preview panel: opens on first file write, but if it didn't (timing),
  67  |     // the topbar 预览 button expands it — robust either way.
  68  |     const body = page.locator('.body');
  69  |     if ((await body.getAttribute('class'))?.includes('preview-collapsed')) {
  70  |       await page.locator('.topbar button', { hasText: '预览' }).click();
  71  |     }
  72  |     const iframe = page.locator('.preview-frame');
  73  |     await expect(iframe).toBeVisible({ timeout: 10_000 });
  74  |     const src = await iframe.getAttribute('src');
  75  |     expect(src).toContain('.e2b.app');
  76  | 
  77  |     // The preview URL actually serves the app
  78  |     const status = await page.evaluate(
  79  |       (url) => fetch(url).then((r) => r.status),
  80  |       src!,
  81  |     );
  82  |     expect(status).toBe(200);
  83  |   });
  84  | });
  85  | 
  86  | test.describe('J6 — 身份闭环（升级→清→登录→找回）', () => {
  87  |   test('upgrade with email+password, clear storage, login, workspace restored', async ({ page }) => {
  88  |     await freshVisit(page);
  89  | 
  90  |     // Generate something first (need an app to restore)
  91  |     const composer = page.getByRole('textbox', { name: '描述你想做的东西' });
  92  |     await composer.fill('做一个hello页面，只要一行大标题。');
  93  |     await page.getByRole('button', { name: '开始' }).click();
  94  |     await expect(page.locator('.topbar')).toContainText('运行中', { timeout: 120_000 });
  95  | 
  96  |     // Save-invite appears (or click the topbar button to bring it up)
  97  |     const invite = page.locator('.save-invite');
  98  |     if (!(await invite.isVisible().catch(() => false))) {
  99  |       await page.locator('.topbar button', { hasText: '升级保存' }).click();
  100 |     }
  101 |     await expect(invite).toBeVisible();
  102 | 
  103 |     // Fill email + password, submit
  104 |     const email = `e2e-${Date.now()}@test.dev`;
  105 |     const password = 'e2e-pass-123';
  106 |     await invite.locator('input[type=email]').fill(email);
  107 |     await invite.locator('input[type=password]').fill(password);
  108 |     await invite.getByRole('button', { name: /保住它/ }).click();
  109 | 
  110 |     // Upgrade succeeds → invite disappears
  111 |     await expect(invite).toBeHidden({ timeout: 15_000 });
  112 | 
  113 |     // Clear storage → fresh visit → login link visible
  114 |     await page.evaluate(() => localStorage.clear());
  115 |     await page.reload();
  116 |     await expect(page.getByText('换设备了？登录已有账户')).toBeVisible({ timeout: 15_000 });
  117 | 
  118 |     // Click login, fill credentials, submit
  119 |     await page.getByText('换设备了？登录已有账户').click();
  120 |     await expect(page.getByRole('heading', { name: '登录已有账户' })).toBeVisible();
  121 | 
  122 |     const loginBox = page.locator('.login-box');
  123 |     await loginBox.locator('input[type=email]').fill(email);
  124 |     await loginBox.locator('input[type=password]').fill(password);
  125 |     await loginBox.getByRole('button', { name: /^登录$/ }).click();
  126 | 
  127 |     // Workspace restored: topbar shows 运行中, preview iframe back
  128 |     await expect(page.locator('.topbar')).toContainText('运行中', { timeout: 30_000 });
  129 |     const iframe = page.locator('.preview-frame');
  130 |     await expect(iframe).toBeVisible();
  131 |     expect(await iframe.getAttribute('src')).toContain('.e2b.app');
  132 |   });
  133 | });
  134 | 
  135 | test.describe('J4 — 中断不丢文件', () => {
  136 |   test('stop mid-generation, files preserved, resume works', async ({ page }) => {
  137 |     await freshVisit(page);
  138 | 
  139 |     const composer = page.getByRole('textbox', { name: '描述你想做的东西' });
  140 |     await composer.fill('做一个多组件的看板应用：三列、可拖拽卡片、localStorage。组件拆细。');
  141 |     await page.getByRole('button', { name: '开始' }).click();
  142 | 
  143 |     // Wait for generation to start, then stop it
  144 |     await expect(page.getByRole('button', { name: /停止/ })).toBeVisible({ timeout: 15_000 });
  145 |     // Give it a moment to write some files, then stop
  146 |     await page.waitForTimeout(5_000);
  147 |     await page.getByRole('button', { name: /停止/ }).click();
  148 | 
  149 |     // Stopped banner appears
> 150 |     await expect(page.locator('.stopped-banner')).toBeVisible({ timeout: 15_000 });
      |                                                   ^ Error: expect(locator).toBeVisible() failed
  151 |     await expect(page.locator('.stopped-banner')).toContainText('已停止');
  152 |     await expect(page.locator('.stopped-banner')).toContainText('文件都保留');
  153 | 
  154 |     // 继续刚才的 button appears
  155 |     await expect(
  156 |       page.locator('.stopped-banner button', { hasText: '继续刚才的' }),
  157 |     ).toBeVisible();
  158 |   });
  159 | });
  160 | 
```