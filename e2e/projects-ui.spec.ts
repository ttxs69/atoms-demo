import { test, expect } from '@playwright/test';

/**
 * 项目 CRUD 的 UI 交互路径（补 full-flow 的 API 级覆盖缺口）：
 * 按钮真的被点、原生 dialog 真的被接、渲染真的变化。
 * 身份走 magic link（服务端铸链，零邮件）；项目经页面内 fetch 创建（带 cookie）。
 */
const URL_PUBLIC = process.env.PUBLIC_URL ?? 'http://localhost:3000';

test('登录用户在 /projects 上：改名(prompt) → 归档(confirm) → 新建跳转', async ({ page }) => {
  test.setTimeout(90_000);
  const email = `e2e-projects-ui-${Date.now()}@test.dev`;

  // magic link 登录（零邮件消耗）
  const { readFileSync } = await import('node:fs');
  const { createClient } = await import('@supabase/supabase-js');
  const envOf = (key: string): string => {
    if (process.env[key]) return process.env[key] as string;
    try {
      for (const line of readFileSync('.env', 'utf8').split('\n')) {
        if (line.startsWith(`${key}=`)) return line.slice(key.length + 1).trim();
      }
    } catch {
      /* no .env */
    }
    return '';
  };
  const db = createClient(envOf('APPS_SUPABASE_URL'), envOf('APPS_SUPABASE_SECRET_KEY'), {
    auth: { persistSession: false },
  });
  const { data: link, error } = await db.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${URL_PUBLIC}/auth/confirm` },
  });
  expect(error).toBeNull();
  await page.goto(link!.properties.action_link, { waitUntil: 'domcontentloaded' });
  await page.waitForURL((u) => !u.href.includes('/auth/confirm'), { timeout: 30_000 });

  // 建一个项目（页面内 fetch，带刚落的 cookie）
  const created = await page.evaluate(async (name: string) => {
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    return (await res.json()) as { project?: { id: string } };
  }, 'UI 测试项目');
  expect(created.project).toBeTruthy();

  // 列表页：卡片渲染
  await page.goto('/projects', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('UI 测试项目')).toBeVisible({ timeout: 15_000 });

  // 改名：原生 prompt → 接受并填新名
  const promptHandler = page.waitForEvent('dialog').then(async (dialog) => {
    expect(dialog.type()).toBe('prompt');
    await dialog.accept('改过的名字');
  });
  await page.getByRole('button', { name: '改名' }).click();
  await promptHandler;
  await expect(page.getByText('改过的名字')).toBeVisible({ timeout: 10_000 });

  // 归档：原生 confirm → 接受 → 卡片消失 → 空状态出现
  const confirmHandler = page.waitForEvent('dialog').then(async (dialog) => {
    expect(dialog.type()).toBe('confirm');
    await dialog.accept();
  });
  await page.getByRole('button', { name: '归档' }).click();
  await confirmHandler;
  await expect(page.getByText('改过的名字')).toBeHidden({ timeout: 10_000 });
  await expect(page.getByText('开始第一个')).toBeVisible({ timeout: 10_000 });

  // + 新建项目 → 跳回工作区
  await page.getByRole('button', { name: '+ 新建项目' }).click();
  await expect(page).toHaveURL(/\/$|localhost:3000\/$|:3000\/$/);
  await expect(page.getByPlaceholder('描述你想做的东西…')).toBeVisible({ timeout: 15_000 });
});
