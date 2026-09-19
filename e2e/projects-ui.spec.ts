import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

/**
 * 项目 CRUD 的 UI 交互路径（补 full-flow 的 API 级覆盖缺口）：
 * 按钮真的被点、原生 dialog 真的被接、渲染真的变化。
 * 身份走 magic link（服务端铸链，零邮件）；项目经页面内 fetch 创建（带 cookie）。
 */
const URL_PUBLIC = process.env.PUBLIC_URL ?? 'http://localhost:3000';

async function magicLinkLogin(page: import('@playwright/test').Page): Promise<void> {
  const { createClient } = await import('@supabase/supabase-js');
  const db = createClient(envOf('APPS_SUPABASE_URL'), envOf('APPS_SUPABASE_SECRET_KEY'), {
    auth: { persistSession: false },
  });
  const email = `e2e-${Date.now().toString(36)}@test.dev`;
  const { data: link, error } = await db.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${URL_PUBLIC}/auth/confirm` },
  });
  expect(error).toBeNull();
  await page.goto(link!.properties.action_link, { waitUntil: 'domcontentloaded' });
  await page.waitForURL((u) => !u.href.includes('/auth/confirm'), { timeout: 30_000 });
}

function envOf(key: string): string {
  if (process.env[key]) return process.env[key] as string;
  try {
    for (const line of readFileSync('.env', 'utf8').split('\n')) {
      if (line.startsWith(`${key}=`)) return line.slice(key.length + 1).trim();
    }
  } catch {
    /* no .env */
  }
  return '';
}

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

test('打开 = 回到工作现场：项目列表 → 打开 → 对话回来（用户报告的回归）', async ({ page }) => {
  test.setTimeout(90_000);
  const marker = `回到现场${Date.now().toString(36)}`;

  await magicLinkLogin(page);
  const userId = await page.evaluate(async () => {
    const me = await fetch('/api/auth/me').then((r) => r.json());
    return me.user.id as string;
  });

  // 种子：一个带对话的项目（确定性，无 LLM）
  const db: SupabaseClient = createClient(envOf('APPS_SUPABASE_URL'), envOf('APPS_SUPABASE_SECRET_KEY'), {
    auth: { persistSession: false },
  });
  const { data: project } = await db
    .from('projects')
    .insert({ user_id: userId, name: `e2e-${marker}`, status: 'ready' })
    .select('id')
    .single();
  await db.from('project_events').insert([
    {
      project_id: project!.id,
      turn_id: `t-${marker}`,
      message_id: null,
      kind: 'user_message',
      payload: { kind: 'user_message', messageId: null, text: `用户说 ${marker}` },
    },
  ]);

  try {
    // 项目列表 → 点「打开」
    await page.goto('/projects', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(`e2e-${marker}`)).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: '打开' }).click();

    // 回到工作区，对话现场水合（marker 来自 journal，不是缓存）
    await page.waitForURL((u) => !u.href.includes('/projects'), { timeout: 15_000 });
    await expect(page.locator('section[aria-label="对话"]')).toContainText(marker, { timeout: 30_000 });
  } finally {
    await db.from('projects').update({ status: 'archived' }).eq('id', project!.id);
  }
});
