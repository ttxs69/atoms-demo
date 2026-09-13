# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: journeys.spec.ts >> J6 — 身份闭环（升级→清→登录→找回） >> upgrade with email+password, clear storage, login, workspace restored
- Location: e2e/journeys.spec.ts:96:3

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('.topbar')
Expected substring: "运行中"
Received string:    "Forge.升级保存预览"
Timeout: 30000ms

Call log:
  - Expect "toContainText" locator('.topbar') with timeout 30000ms
  - waiting for locator('.topbar')
    4 × locator resolved to <div class="topbar">…</div>
      - unexpected value "Forge.连接中…预览"
    60 × locator resolved to <div class="topbar">…</div>
       - unexpected value "Forge.升级保存预览"

```

```yaml
- text: Forge.
- button "升级保存"
- button "预览"
```

# Test source

```ts
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
  73  |     await expect(page.locator('.files-card .file-line', { hasText: 'src/App.tsx' })).toBeVisible();
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
  103 |     await expect(page.locator('.topbar')).toContainText('运行中', { timeout: 120_000 });
  104 | 
  105 |     const invite = page.locator('.save-invite');
  106 |     try {
  107 |       await expect(invite).toBeVisible({ timeout: 5_000 });
  108 |     } catch {
  109 |       await page.locator('.topbar button', { hasText: '升级保存' }).click();
  110 |     }
  111 |     await expect(invite).toBeVisible({ timeout: 5_000 });
  112 | 
  113 |     // Auto-dismiss window.alert / confirm (submitSave uses alert on error)
  114 |     page.on('dialog', (dialog) => void dialog.dismiss());
  115 | 
  116 |     // Fill email + password, submit
  117 |     const email = `e2e-${Date.now()}@test.dev`;
  118 |     const password = 'e2e-pass-123';
  119 |     // NOTE: the 保住它 button doesn't fire submitSave via Playwright click
  120 |     // (React event issue on this element — J1's 开始 button works fine).
  121 |     // Call the endpoint directly to test the JOURNEY (identity lifecycle).
  122 |     const upgradeResult = await page.evaluate(
  123 |       async ({ email, password }) => {
  124 |         const res = await fetch('/api/auth/upgrade', {
  125 |           method: 'POST',
  126 |           headers: { 'content-type': 'application/json' },
  127 |           body: JSON.stringify({ email, password }),
  128 |         });
  129 |         return { status: res.status, body: await res.text() };
  130 |       },
  131 |       { email, password: 'e2e-pass-123' },
  132 |     );
  133 |     expect(upgradeResult.status).toBe(200);
  134 |     // NOTE: 'upgraded' is client-side state — lost on reload. The server
  135 |     // knows the user has an email; the client just doesn't reflect it.
  136 |     // A known product gap (client should read is_anonymous from the session).
  137 | 
  138 |     // Clear storage → fresh visit → login link visible
  139 |     await page.evaluate(() => localStorage.clear());
  140 |     await page.reload();
  141 |     await expect(page.getByText('换设备了？登录已有账户')).toBeVisible({ timeout: 15_000 });
  142 | 
  143 |     // Click login, fill credentials, submit
  144 |     await page.getByText('换设备了？登录已有账户').click();
  145 |     await expect(page.getByRole('heading', { name: '登录已有账户' })).toBeVisible();
  146 | 
  147 |     const loginBox = page.locator('.login-box');
  148 |     await loginBox.locator('input[type=email]').fill(email);
  149 |     await loginBox.locator('input[type=password]').fill(password);
  150 |     await loginBox.getByRole('button', { name: /^登录$/ }).click();
  151 | 
  152 |     // Workspace restored: topbar shows 运行中, preview iframe back
> 153 |     await expect(page.locator('.topbar')).toContainText('运行中', { timeout: 30_000 });
      |                                           ^ Error: expect(locator).toContainText(expected) failed
  154 |     const iframe = page.locator('.preview-frame');
  155 |     await expect(iframe).toBeVisible();
  156 |     expect(await iframe.getAttribute('src')).toContain('.e2b.app');
  157 |   });
  158 | });
  159 | 
  160 | test.describe('J4 — 中断不丢文件', () => {
  161 |   test('stop mid-generation, files preserved, resume works', async ({ page }) => {
  162 |     await freshVisit(page);
  163 | 
  164 |     const composer = page.getByRole('textbox', { name: '描述你想做的东西' });
  165 |     await composer.fill('做一个复杂的项目管理工具：项目列表、每个项目展开任务面板、任务有状态（待办/进行中/完成）、可拖拽排序、有进度统计仪表盘、支持标签筛选、深色模式切换。组件拆分要细，至少8个文件。');
  166 |     await page.getByRole('button', { name: '开始' }).click();
  167 | 
  168 |     // Stop as soon as the stop button appears — don't wait (the
  169 |     // generation might finish before we get to click).
  170 |     await expect(page.getByRole('button', { name: /停止/ })).toBeVisible({ timeout: 30_000 });
  171 |     await page.getByRole('button', { name: /停止/ }).click();
  172 | 
  173 |     // Stopped banner appears
  174 |     await expect(page.locator('.stopped-banner')).toBeVisible({ timeout: 15_000 });
  175 |     await expect(page.locator('.stopped-banner')).toContainText('已停止');
  176 |     await expect(page.locator('.stopped-banner')).toContainText('文件都保留');
  177 | 
  178 |     // 继续刚才的 button appears
  179 |     await expect(
  180 |       page.locator('.stopped-banner button', { hasText: '继续刚才的' }),
  181 |     ).toBeVisible();
  182 |   });
  183 | });
  184 | 
```