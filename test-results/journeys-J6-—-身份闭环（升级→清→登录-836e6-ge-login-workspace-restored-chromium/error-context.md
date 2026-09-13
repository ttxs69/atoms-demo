# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: journeys.spec.ts >> J6 — 身份闭环（升级→清→登录→找回） >> upgrade with email+password, clear storage, login, workspace restored
- Location: e2e/journeys.spec.ts:96:3

# Error details

```
Test timeout of 120000ms exceeded.
```

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('.topbar')
Expected substring: "运行中"
Received string:    "Forge.升级保存预览"

Call log:
  - Expect "toContainText" locator('.topbar') with timeout 120000ms
  - waiting for locator('.topbar')
    2 × locator resolved to <div class="topbar">…</div>
      - unexpected value "Forge.生成中升级保存预览"
    234 × locator resolved to <div class="topbar">…</div>
        - unexpected value "Forge.升级保存预览"
  - Test timeout of 120000ms exceeded.

```

```yaml
- text: Forge.
- button "升级保存"
- button "预览"
```

# Test source

```ts
  3   | /**
  4   |  * forge E2E — Playwright, semantic selectors, auto-waiting assertions.
  5   |  *
  6   |  * Six journeys (see the test-engineering analysis). Each starts fresh
  7   |  * (no localStorage) and runs against the real stack: DeepSeek + E2B +
  8   |  * platform Supabase. None of these mock anything — they exist precisely
  9   |  * to catch what unit tests cannot (integration, config, browser).
  10  |  *
  11  |  * The journeys are INDEPENDENT: no ordering dependency, each resets.
  12  |  */
  13  | 
  14  | test.beforeEach(async ({ page }) => {
  15  |   // Capture browser console errors — React render errors get swallowed
  16  |   // by the removed dev overlay
  17  |   const errors: string[] = [];
  18  |   page.on('console', (msg) => {
  19  |     if (msg.type() === 'error') errors.push(msg.text());
  20  |   });
  21  |   page.on('pageerror', (err) => errors.push(String(err)));
  22  |   // Expose for later assertions
  23  |   (page as unknown as { __consoleErrors: string[] }).__consoleErrors = errors;
  24  |   // The Next.js dev overlay (nextjs-portal) intercepts pointer events in
  25  |   // dev mode. Hide it via injected CSS on EVERY navigation — removing it
  26  |   // once doesn't survive page transitions.
  27  |   await page.addInitScript(() => {
  28  |     const style = document.createElement('style');
  29  |     style.textContent = 'nextjs-portal { display: none !important; pointer-events: none !important; }';
  30  |     document.addEventListener('DOMContentLoaded', () => {
  31  |       document.head.appendChild(style);
  32  |     });
  33  |   });
  34  | });
  35  | 
  36  | /** Fresh visit: clear storage, reload, wait for identity to land. */
  37  | async function freshVisit(page: Page): Promise<void> {
  38  |   await page.goto('/');
  39  |   await page.evaluate(() => localStorage.clear());
  40  |   await page.reload();
  41  |   // Identity lands when the topbar shows 升级保存 (not 连接中…)
  42  |   await expect(page.locator('.topbar')).toContainText('升级保存', { timeout: 30_000 });
  43  |   // Cookie is set by POST /api/auth/session — wait for it to complete
  44  |   // (the topbar flips after setIdentity, which is AFTER the POST, but
  45  |   // the browser needs a beat to apply Set-Cookie on some routes).
  46  |   await page.waitForTimeout(1_000);
  47  | }
  48  | 
  49  | test.describe('J1 — 陌生首访 → 生成 → 预览', () => {
  50  |   test('empty state renders, identity is silent, generation completes, preview appears', async ({ page }) => {
  51  |     await freshVisit(page);
  52  | 
  53  |     // Empty state: heading, three examples, login link (not a wall)
  54  |     await expect(page.getByRole('heading', { name: '想做点什么？' })).toBeVisible();
  55  |     await expect(page.getByText('记录每日心情的应用')).toBeVisible();
  56  |     await expect(page.getByText('待办清单')).toBeVisible();
  57  |     await expect(page.getByText('番茄钟计时器')).toBeVisible();
  58  |     await expect(page.getByText('换设备了？登录已有账户')).toBeVisible();
  59  | 
  60  |     // Type and submit
  61  |     const composer = page.getByRole('textbox', { name: '描述你想做的东西' });
  62  |     await composer.fill('做一个极简计数器：加减按钮、当前数字显示。只要一个组件。');
  63  |     await page.getByRole('button', { name: '开始' }).click();
  64  | 
  65  |     // Streaming: 停止 button appears (generation in flight)
  66  |     await expect(page.getByRole('button', { name: /停止/ })).toBeVisible({ timeout: 15_000 });
  67  | 
  68  |     // Wait for completion: 顶栏 switches to 运行中
  69  |     await expect(page.locator('.topbar')).toContainText('运行中', { timeout: 120_000 });
  70  | 
  71  |     // File tree appeared with at least App.tsx
  72  |     await expect(page.locator('.files-header')).toContainText(/个文件/);
  73  |     await expect(page.locator('.file-line', { hasText: 'src/App.tsx' })).toBeVisible();
  74  | 
  75  |     // Preview panel: opens on first file write, but if it didn't (timing),
  76  |     // the topbar 预览 button expands it — robust either way.
  77  |     const body = page.locator('.body');
  78  |     if ((await body.getAttribute('class'))?.includes('preview-collapsed')) {
  79  |       await page.locator('.topbar button', { hasText: '预览' }).click();
  80  |     }
  81  |     const iframe = page.locator('.preview-frame');
  82  |     await expect(iframe).toBeVisible({ timeout: 10_000 });
  83  |     const src = await iframe.getAttribute('src');
  84  |     expect(src).toContain('.e2b.app');
  85  | 
  86  |     // The preview URL actually serves the app
  87  |     const status = await page.evaluate(
  88  |       (url) => fetch(url).then((r) => r.status),
  89  |       src!,
  90  |     );
  91  |     expect(status).toBe(200);
  92  |   });
  93  | });
  94  | 
  95  | test.describe('J6 — 身份闭环（升级→清→登录→找回）', () => {
  96  |   test('upgrade with email+password, clear storage, login, workspace restored', async ({ page }) => {
  97  |     await freshVisit(page);
  98  | 
  99  |     // Generate something first (need an app to restore)
  100 |     const composer = page.getByRole('textbox', { name: '描述你想做的东西' });
  101 |     await composer.fill('做一个hello页面，只要一行大标题。');
  102 |     await page.getByRole('button', { name: '开始' }).click();
> 103 |     await expect(page.locator('.topbar')).toContainText('运行中', { timeout: 120_000 });
      |                                           ^ Error: expect(locator).toContainText(expected) failed
  104 | 
  105 |     try {
  106 |       await expect(invite).toBeVisible({ timeout: 5_000 });
  107 |     } catch {
  108 |       await topbarBtn.click();
  109 |     }
  110 |     await expect(invite).toBeVisible({ timeout: 5_000 });
  111 | 
  112 |     // Fill email + password, submit
  113 |     const email = `e2e-${Date.now()}@test.dev`;
  114 |     const password = 'e2e-pass-123';
  115 |     await invite.locator('input[type=email]').fill(email);
  116 |     await invite.locator('input[type=password]').fill(password);
  117 |     await invite.getByRole('button', { name: /保住它/ }).click();
  118 | 
  119 |     // Upgrade succeeds → invite disappears
  120 |     await expect(invite).toBeHidden({ timeout: 15_000 });
  121 | 
  122 |     // Clear storage → fresh visit → login link visible
  123 |     await page.evaluate(() => localStorage.clear());
  124 |     await page.reload();
  125 |     await expect(page.getByText('换设备了？登录已有账户')).toBeVisible({ timeout: 15_000 });
  126 | 
  127 |     // Click login, fill credentials, submit
  128 |     await page.getByText('换设备了？登录已有账户').click();
  129 |     await expect(page.getByRole('heading', { name: '登录已有账户' })).toBeVisible();
  130 | 
  131 |     const loginBox = page.locator('.login-box');
  132 |     await loginBox.locator('input[type=email]').fill(email);
  133 |     await loginBox.locator('input[type=password]').fill(password);
  134 |     await loginBox.getByRole('button', { name: /^登录$/ }).click();
  135 | 
  136 |     // Workspace restored: topbar shows 运行中, preview iframe back
  137 |     await expect(page.locator('.topbar')).toContainText('运行中', { timeout: 30_000 });
  138 |     const iframe = page.locator('.preview-frame');
  139 |     await expect(iframe).toBeVisible();
  140 |     expect(await iframe.getAttribute('src')).toContain('.e2b.app');
  141 |   });
  142 | });
  143 | 
  144 | test.describe('J4 — 中断不丢文件', () => {
  145 |   test('stop mid-generation, files preserved, resume works', async ({ page }) => {
  146 |     await freshVisit(page);
  147 | 
  148 |     const composer = page.getByRole('textbox', { name: '描述你想做的东西' });
  149 |     await composer.fill('做一个复杂的项目管理工具：项目列表、每个项目展开任务面板、任务有状态（待办/进行中/完成）、可拖拽排序、有进度统计仪表盘、支持标签筛选、深色模式切换。组件拆分要细，至少8个文件。');
  150 |     await page.getByRole('button', { name: '开始' }).click();
  151 | 
  152 |     // Stop as soon as the stop button appears — don't wait (the
  153 |     // generation might finish before we get to click).
  154 |     await expect(page.getByRole('button', { name: /停止/ })).toBeVisible({ timeout: 30_000 });
  155 |     await page.getByRole('button', { name: /停止/ }).click();
  156 | 
  157 |     // Stopped banner appears
  158 |     await expect(page.locator('.stopped-banner')).toBeVisible({ timeout: 15_000 });
  159 |     await expect(page.locator('.stopped-banner')).toContainText('已停止');
  160 |     await expect(page.locator('.stopped-banner')).toContainText('文件都保留');
  161 | 
  162 |     // 继续刚才的 button appears
  163 |     await expect(
  164 |       page.locator('.stopped-banner button', { hasText: '继续刚才的' }),
  165 |     ).toBeVisible();
  166 |   });
  167 | });
  168 | 
```