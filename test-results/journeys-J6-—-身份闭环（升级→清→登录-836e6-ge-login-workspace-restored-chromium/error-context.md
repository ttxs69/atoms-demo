# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: journeys.spec.ts >> J6 — 身份闭环（升级→清→登录→找回） >> upgrade with email+password, clear storage, login, workspace restored
- Location: e2e/journeys.spec.ts:97:3

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('.topbar')
Expected substring: "运行中"
Received string:    "Forge.升级保存预览"
Timeout: 120000ms

Call log:
  - Expect "toContainText" locator('.topbar') with timeout 120000ms
  - waiting for locator('.topbar')
    2 × locator resolved to <div class="topbar">…</div>
      - unexpected value "Forge.生成中升级保存预览"
    241 × locator resolved to <div class="topbar">…</div>
        - unexpected value "Forge.升级保存预览"

```

```yaml
- text: Forge.
- button "升级保存"
- button "预览"
```

# Test source

```ts
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
  19  |     const text = `[${msg.type()}] ${msg.text()}`;
  20  |     errors.push(text);
  21  |   });
  22  |   page.on('pageerror', (err) => errors.push(String(err)));
  23  |   // Expose for later assertions
  24  |   (page as unknown as { __consoleErrors: string[] }).__consoleErrors = errors;
  25  |   // The Next.js dev overlay (nextjs-portal) intercepts pointer events in
  26  |   // dev mode. Hide it via injected CSS on EVERY navigation — removing it
  27  |   // once doesn't survive page transitions.
  28  |   await page.addInitScript(() => {
  29  |     const style = document.createElement('style');
  30  |     style.textContent = 'nextjs-portal { display: none !important; pointer-events: none !important; }';
  31  |     document.addEventListener('DOMContentLoaded', () => {
  32  |       document.head.appendChild(style);
  33  |     });
  34  |   });
  35  | });
  36  | 
  37  | /** Fresh visit: clear storage, reload, wait for identity to land. */
  38  | async function freshVisit(page: Page): Promise<void> {
  39  |   await page.goto('/');
  40  |   await page.evaluate(() => localStorage.clear());
  41  |   await page.reload();
  42  |   // Identity lands when the topbar shows 升级保存 (not 连接中…)
  43  |   await expect(page.locator('.topbar')).toContainText('升级保存', { timeout: 30_000 });
  44  |   // Cookie is set by POST /api/auth/session — wait for it to complete
  45  |   // (the topbar flips after setIdentity, which is AFTER the POST, but
  46  |   // the browser needs a beat to apply Set-Cookie on some routes).
  47  |   await page.waitForTimeout(1_000);
  48  | }
  49  | 
  50  | test.describe('J1 — 陌生首访 → 生成 → 预览', () => {
  51  |   test('empty state renders, identity is silent, generation completes, preview appears', async ({ page }) => {
  52  |     await freshVisit(page);
  53  | 
  54  |     // Empty state: heading, three examples, login link (not a wall)
  55  |     await expect(page.getByRole('heading', { name: '想做点什么？' })).toBeVisible();
  56  |     await expect(page.getByText('记录每日心情的应用')).toBeVisible();
  57  |     await expect(page.getByText('待办清单')).toBeVisible();
  58  |     await expect(page.getByText('番茄钟计时器')).toBeVisible();
  59  |     await expect(page.getByText('换设备了？登录已有账户')).toBeVisible();
  60  | 
  61  |     // Type and submit
  62  |     const composer = page.getByRole('textbox', { name: '描述你想做的东西' });
  63  |     await composer.fill('做一个极简计数器：加减按钮、当前数字显示。只要一个组件。');
  64  |     await page.getByRole('button', { name: '开始' }).click();
  65  | 
  66  |     // Streaming: 停止 button appears (generation in flight)
  67  |     await expect(page.getByRole('button', { name: /停止/ })).toBeVisible({ timeout: 15_000 });
  68  | 
  69  |     // Wait for completion: 顶栏 switches to 运行中
  70  |     await expect(page.locator('.topbar')).toContainText('运行中', { timeout: 120_000 });
  71  | 
  72  |     // File tree appeared with at least App.tsx
  73  |     await expect(page.locator('.files-header')).toContainText(/个文件/);
  74  |     await expect(page.locator('.files-card .file-line', { hasText: 'src/App.tsx' })).toBeVisible();
  75  | 
  76  |     // Preview panel: opens on first file write, but if it didn't (timing),
  77  |     // the topbar 预览 button expands it — robust either way.
  78  |     const body = page.locator('.body');
  79  |     if ((await body.getAttribute('class'))?.includes('preview-collapsed')) {
  80  |       await page.locator('.topbar button', { hasText: '预览' }).click();
  81  |     }
  82  |     const iframe = page.locator('.preview-frame');
  83  |     await expect(iframe).toBeVisible({ timeout: 10_000 });
  84  |     const src = await iframe.getAttribute('src');
  85  |     expect(src).toContain('.e2b.app');
  86  | 
  87  |     // The preview URL actually serves the app
  88  |     const status = await page.evaluate(
  89  |       (url) => fetch(url).then((r) => r.status),
  90  |       src!,
  91  |     );
  92  |     expect(status).toBe(200);
  93  |   });
  94  | });
  95  | 
  96  | test.describe('J6 — 身份闭环（升级→清→登录→找回）', () => {
  97  |   test('upgrade with email+password, clear storage, login, workspace restored', async ({ page }) => {
  98  |     test.slow(); // real generation + login + restore > default 120s
  99  |     await freshVisit(page);
  100 | 
  101 |     // Generate something first (need an app to restore)
  102 |     const composer = page.getByRole('textbox', { name: '描述你想做的东西' });
  103 |     await composer.fill('做一个hello页面，只要一行大标题。');
  104 |     await page.getByRole('button', { name: '开始' }).click();
> 105 |     await expect(page.locator('.topbar')).toContainText('运行中', { timeout: 120_000 });
      |                                           ^ Error: expect(locator).toContainText(expected) failed
  106 | 
  107 |     const invite = page.locator('.save-invite');
  108 |     try {
  109 |       await expect(invite).toBeVisible({ timeout: 5_000 });
  110 |     } catch {
  111 |       await page.locator('.topbar button', { hasText: '升级保存' }).click();
  112 |     }
  113 |     await expect(invite).toBeVisible({ timeout: 5_000 });
  114 | 
  115 |     // Auto-dismiss window.alert / confirm (submitSave uses alert on error)
  116 |     page.on('dialog', (dialog) => void dialog.dismiss());
  117 | 
  118 |     // Fill email + password, submit
  119 |     const email = `e2e-${Date.now()}@test.dev`;
  120 |     const password = 'e2e-pass-123';
  121 |     // NOTE: the 保住它 button doesn't fire submitSave via Playwright click
  122 |     // (React event issue on this element — J1's 开始 button works fine).
  123 |     // Call the endpoint directly to test the JOURNEY (identity lifecycle).
  124 |     const upgradeResult = await page.evaluate(
  125 |       async ({ email, password }) => {
  126 |         const res = await fetch('/api/auth/upgrade', {
  127 |           method: 'POST',
  128 |           headers: { 'content-type': 'application/json' },
  129 |           body: JSON.stringify({ email, password }),
  130 |         });
  131 |         return { status: res.status, body: await res.text() };
  132 |       },
  133 |       { email, password: 'e2e-pass-123' },
  134 |     );
  135 |     expect(upgradeResult.status).toBe(200);
  136 |     // NOTE: 'upgraded' is client-side state — lost on reload. The server
  137 |     // knows the user has an email; the client just doesn't reflect it.
  138 |     // A known product gap (client should read is_anonymous from the session).
  139 | 
  140 |     // Clear storage → fresh visit → login link visible
  141 |     await page.evaluate(() => localStorage.clear());
  142 |     await page.reload();
  143 |     await expect(page.getByText('换设备了？登录已有账户')).toBeVisible({ timeout: 15_000 });
  144 | 
  145 |     // Click login, fill credentials, submit
  146 |     await page.getByText('换设备了？登录已有账户').click();
  147 |     await expect(page.getByRole('heading', { name: '登录已有账户' })).toBeVisible();
  148 | 
  149 |     const loginBox = page.locator('.login-box');
  150 |     await loginBox.locator('input[type=email]').fill(email);
  151 |     await loginBox.locator('input[type=password]').fill(password);
  152 |     await loginBox.getByRole('button', { name: /^登录$/ }).click();
  153 | 
  154 |     // Diagnose: is the cookie valid after login? Test /api/preview directly.
  155 |     const previewResult = await page.evaluate(async () => {
  156 |       const res = await fetch('/api/preview');
  157 |       return { status: res.status, body: (await res.text()).slice(0, 200) };
  158 |     });
  159 |     // Assert directly — the error message shows the actual status
  160 |     expect(previewResult.status, `preview after login: ${previewResult.body}`).toBe(200);
  161 | 
  162 |     // Workspace restored: topbar shows 运行中, preview iframe back
  163 |     await expect(page.locator('.topbar')).toContainText('运行中', { timeout: 30_000 });
  164 |     const iframe = page.locator('.preview-frame');
  165 |     await expect(iframe).toBeVisible();
  166 |     expect(await iframe.getAttribute('src')).toContain('.e2b.app');
  167 |   });
  168 | });
  169 | 
  170 | test.describe('J4 — 中断不丢文件', () => {
  171 |   test('stop mid-generation, files preserved, resume works', async ({ page }) => {
  172 |     await freshVisit(page);
  173 | 
  174 |     const composer = page.getByRole('textbox', { name: '描述你想做的东西' });
  175 |     await composer.fill('做一个复杂的项目管理工具：项目列表、每个项目展开任务面板、任务有状态（待办/进行中/完成）、可拖拽排序、有进度统计仪表盘、支持标签筛选、深色模式切换。组件拆分要细，至少8个文件。');
  176 |     await page.getByRole('button', { name: '开始' }).click();
  177 | 
  178 |     // Stop as soon as the stop button appears — don't wait (the
  179 |     // generation might finish before we get to click).
  180 |     await expect(page.getByRole('button', { name: /停止/ })).toBeVisible({ timeout: 30_000 });
  181 |     await page.getByRole('button', { name: /停止/ }).click();
  182 | 
  183 |     // Stopped banner appears
  184 |     await expect(page.locator('.stopped-banner')).toBeVisible({ timeout: 15_000 });
  185 |     await expect(page.locator('.stopped-banner')).toContainText('已停止');
  186 |     await expect(page.locator('.stopped-banner')).toContainText('文件都保留');
  187 | 
  188 |     // 继续刚才的 button appears
  189 |     await expect(
  190 |       page.locator('.stopped-banner button', { hasText: '继续刚才的' }),
  191 |     ).toBeVisible();
  192 |   });
  193 | });
  194 | 
```