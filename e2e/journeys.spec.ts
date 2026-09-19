import { test, expect, type Page } from '@playwright/test';

/**
 * 旅程用例（J1/J4），2026-09-19 迁移到现行 UI 选择器：
 * - 顶栏 = <header>（徽标：生成中/运行中/已停止），旧 .topbar 已不存在
 * - 输入框 = placeholder「描述你想做的东西…」
 * - 预览 = header「预览」按钮展开 iframe[title="应用预览"]
 * - 停止态 = Alert「已停止 —— 已生成的文件都保留了。」+「继续刚才的」按钮
 * 旧 J6（升级→登录→找回）已删，职责由 persistence.spec.ts 的 AC3 继任。
 */

test.beforeEach(async ({ page }) => {
  // Capture browser console errors — React render errors get swallowed
  // by the removed dev overlay
  const errors: string[] = [];
  page.on('console', (msg) => {
    const text = `[${msg.type()}] ${msg.text()}`;
    errors.push(text);
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

/** Fresh visit: clear storage, reload, wait for a resolvable identity. */
async function freshVisit(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  // Identity lands when the header shows 升级保存 (or dev-), NOT 连接中…
  await expect(page.locator('header')).toContainText(/升级保存|dev-/, { timeout: 30_000 });
  // forge_session cookie lands via POST /api/auth/session, which runs AFTER
  // setIdentity — the header text alone races it. Poll the endpoint.
  const deadline = Date.now() + 20_000;
  for (;;) {
    const ok = await page.evaluate(async () => {
      const res = await fetch('/api/auth/me');
      const data = (await res.json()) as { user: { id: string } | null };
      return data.user !== null;
    });
    if (ok) return;
    if (Date.now() > deadline) throw new Error('forge_session cookie never became valid');
    await page.waitForTimeout(500);
  }
}

test.describe('J1 — 陌生首访 → 生成 → 预览', () => {
  test('empty state renders, identity is silent, generation completes, preview appears', async ({ page }) => {
    test.setTimeout(180_000);
    await freshVisit(page);

    // Empty state: heading, examples, login link (not a wall)
    await expect(page.getByRole('heading', { name: '想做点什么？' })).toBeVisible();
    await expect(page.getByText('记录每日心情的应用')).toBeVisible();
    await expect(page.getByText(/待办清单/)).toBeVisible();
    await expect(page.getByText('番茄钟计时器')).toBeVisible();
    await expect(page.getByText('换设备了？登录已有账户')).toBeVisible();

    // Type and submit
    await page.getByPlaceholder('描述你想做的东西…').fill('做一个极简计数器：加减按钮、当前数字显示。只要一个组件。');
    await page.getByRole('button', { name: '开始' }).click();

    // Streaming: 停止 button appears (generation in flight)
    await expect(page.getByRole('button', { name: /停止/ })).toBeVisible({ timeout: 15_000 });

    // Wait for completion: header badge flips to 运行中
    await expect(page.locator('header')).toContainText('运行中', { timeout: 120_000 });

    // Plan tree shows the file count ("N 个文件 · …")
    await expect(page.getByText(/个文件/).first()).toBeVisible({ timeout: 15_000 });

    // Expand the preview (auto-open only happens on session restore) and
    // assert the iframe loads the real E2B-hosted app.
    const toggle = page.getByRole('button', { name: /^(收起预览|预览)$/ });
    if ((await toggle.textContent()) === '预览') await toggle.click();
    const iframe = page.locator('iframe[title="应用预览"]');
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

test.describe('J4 — 中断不丢文件', () => {
  test('stop mid-generation, files preserved, resume affordance appears', async ({ page }) => {
    test.setTimeout(120_000);
    await freshVisit(page);

    await page
      .getByPlaceholder('描述你想做的东西…')
      .fill('做一个复杂的项目管理工具：项目列表、每个项目展开任务面板、任务有状态（待办/进行中/完成）、可拖拽排序、有进度统计仪表盘、支持标签筛选、深色模式切换。组件拆分要细，至少8个文件。');
    await page.getByRole('button', { name: '开始' }).click();

    // Stop as soon as the stop button appears — don't wait (the
    // generation might finish before we get to click).
    await expect(page.getByRole('button', { name: /停止/ })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: /停止/ }).click();

    // Stopped banner: files kept + resume affordance + header badge
    await expect(page.getByText('已生成的文件都保留了')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: '继续刚才的' })).toBeVisible();
    await expect(page.locator('header')).toContainText('已停止', { timeout: 15_000 });
  });
});
