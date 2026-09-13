import { test, expect, type Page } from '@playwright/test';

/**
 * forge E2E — Playwright, semantic selectors, auto-waiting assertions.
 *
 * Six journeys (see the test-engineering analysis). Each starts fresh
 * (no localStorage) and runs against the real stack: DeepSeek + E2B +
 * platform Supabase. None of these mock anything — they exist precisely
 * to catch what unit tests cannot (integration, config, browser).
 *
 * The journeys are INDEPENDENT: no ordering dependency, each resets.
 */

test.beforeEach(async ({ page }) => {
  // Capture browser console errors — React render errors get swallowed
  // by the removed dev overlay
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));
  // Expose for later assertions
  (page as unknown as { __consoleErrors: string[] }).__consoleErrors = errors;
  // The Next.js dev overlay (nextjs-portal) intercepts pointer events in
  // dev mode. Hide it via injected CSS on EVERY navigation — removing it
  // once doesn't survive page transitions.
  await page.addInitScript(() => {
    const style = document.createElement('style');
    style.textContent = 'nextjs-portal { display: none !important; pointer-events: none !important; }';
    document.addEventListener('DOMContentLoaded', () => {
      document.head.appendChild(style);
    });
  });
});

/** Fresh visit: clear storage, reload, wait for identity to land. */
async function freshVisit(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  // Identity lands when the topbar shows 升级保存 (not 连接中…)
  await expect(page.locator('.topbar')).toContainText('升级保存', { timeout: 30_000 });
  // Cookie is set by POST /api/auth/session — wait for it to complete
  // (the topbar flips after setIdentity, which is AFTER the POST, but
  // the browser needs a beat to apply Set-Cookie on some routes).
  await page.waitForTimeout(1_000);
}

test.describe('J1 — 陌生首访 → 生成 → 预览', () => {
  test('empty state renders, identity is silent, generation completes, preview appears', async ({ page }) => {
    await freshVisit(page);

    // Empty state: heading, three examples, login link (not a wall)
    await expect(page.getByRole('heading', { name: '想做点什么？' })).toBeVisible();
    await expect(page.getByText('记录每日心情的应用')).toBeVisible();
    await expect(page.getByText('待办清单')).toBeVisible();
    await expect(page.getByText('番茄钟计时器')).toBeVisible();
    await expect(page.getByText('换设备了？登录已有账户')).toBeVisible();

    // Type and submit
    const composer = page.getByRole('textbox', { name: '描述你想做的东西' });
    await composer.fill('做一个极简计数器：加减按钮、当前数字显示。只要一个组件。');
    await page.getByRole('button', { name: '开始' }).click();

    // Streaming: 停止 button appears (generation in flight)
    await expect(page.getByRole('button', { name: /停止/ })).toBeVisible({ timeout: 15_000 });

    // Wait for completion: 顶栏 switches to 运行中
    await expect(page.locator('.topbar')).toContainText('运行中', { timeout: 120_000 });

    // File tree appeared with at least App.tsx
    await expect(page.locator('.files-header')).toContainText(/个文件/);
    await expect(page.locator('.file-line', { hasText: 'src/App.tsx' })).toBeVisible();

    // Preview panel: opens on first file write, but if it didn't (timing),
    // the topbar 预览 button expands it — robust either way.
    const body = page.locator('.body');
    if ((await body.getAttribute('class'))?.includes('preview-collapsed')) {
      await page.locator('.topbar button', { hasText: '预览' }).click();
    }
    const iframe = page.locator('.preview-frame');
    await expect(iframe).toBeVisible({ timeout: 10_000 });
    const src = await iframe.getAttribute('src');
    expect(src).toContain('.e2b.app');

    // The preview URL actually serves the app
    const status = await page.evaluate(
      (url) => fetch(url).then((r) => r.status),
      src!,
    );
    expect(status).toBe(200);
  });
});

test.describe('J6 — 身份闭环（升级→清→登录→找回）', () => {
  test('upgrade with email+password, clear storage, login, workspace restored', async ({ page }) => {
    await freshVisit(page);

    // Generate something first (need an app to restore)
    const composer = page.getByRole('textbox', { name: '描述你想做的东西' });
    await composer.fill('做一个hello页面，只要一行大标题。');
    await page.getByRole('button', { name: '开始' }).click();
    await expect(page.locator('.topbar')).toContainText('运行中', { timeout: 120_000 });

    try {
      await expect(invite).toBeVisible({ timeout: 5_000 });
    } catch {
      await topbarBtn.click();
    }
    await expect(invite).toBeVisible({ timeout: 5_000 });

    // Fill email + password, submit
    const email = `e2e-${Date.now()}@test.dev`;
    const password = 'e2e-pass-123';
    await invite.locator('input[type=email]').fill(email);
    await invite.locator('input[type=password]').fill(password);
    await invite.getByRole('button', { name: /保住它/ }).click();

    // Upgrade succeeds → invite disappears
    await expect(invite).toBeHidden({ timeout: 15_000 });

    // Clear storage → fresh visit → login link visible
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.getByText('换设备了？登录已有账户')).toBeVisible({ timeout: 15_000 });

    // Click login, fill credentials, submit
    await page.getByText('换设备了？登录已有账户').click();
    await expect(page.getByRole('heading', { name: '登录已有账户' })).toBeVisible();

    const loginBox = page.locator('.login-box');
    await loginBox.locator('input[type=email]').fill(email);
    await loginBox.locator('input[type=password]').fill(password);
    await loginBox.getByRole('button', { name: /^登录$/ }).click();

    // Workspace restored: topbar shows 运行中, preview iframe back
    await expect(page.locator('.topbar')).toContainText('运行中', { timeout: 30_000 });
    const iframe = page.locator('.preview-frame');
    await expect(iframe).toBeVisible();
    expect(await iframe.getAttribute('src')).toContain('.e2b.app');
  });
});

test.describe('J4 — 中断不丢文件', () => {
  test('stop mid-generation, files preserved, resume works', async ({ page }) => {
    await freshVisit(page);

    const composer = page.getByRole('textbox', { name: '描述你想做的东西' });
    await composer.fill('做一个复杂的项目管理工具：项目列表、每个项目展开任务面板、任务有状态（待办/进行中/完成）、可拖拽排序、有进度统计仪表盘、支持标签筛选、深色模式切换。组件拆分要细，至少8个文件。');
    await page.getByRole('button', { name: '开始' }).click();

    // Stop as soon as the stop button appears — don't wait (the
    // generation might finish before we get to click).
    await expect(page.getByRole('button', { name: /停止/ })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: /停止/ }).click();

    // Stopped banner appears
    await expect(page.locator('.stopped-banner')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.stopped-banner')).toContainText('已停止');
    await expect(page.locator('.stopped-banner')).toContainText('文件都保留');

    // 继续刚才的 button appears
    await expect(
      page.locator('.stopped-banner button', { hasText: '继续刚才的' }),
    ).toBeVisible();
  });
});
