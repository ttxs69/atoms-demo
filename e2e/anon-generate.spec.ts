import { test, expect } from '@playwright/test';

const URL_PUBLIC = process.env.PUBLIC_URL ?? 'http://localhost:3000';

/** 核心路径：匿名 → 生成请求被接受 → SSE 流开始（agent 开工）*/
test('匿名首访 → 生成 → LLM 开工', async ({ page }) => {
  test.setTimeout(75_000);
  await page.goto(URL_PUBLIC, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('header')).toContainText(/升级保存|dev-/, { timeout: 30_000 });
  await page.getByRole('button', { name: /待办清单/ }).first().click();
  await page.getByRole('button', { name: '开始' }).click();
  // agent_started 事件 → 顶栏"生成中" + 对话区出现 agent 头像名（Mike/Emma/Alex）
  await expect(page.locator('header')).toContainText('生成中', { timeout: 15_000 });
  await expect(page.getByText(/Mike|Emma|Alex/).first()).toBeVisible({ timeout: 45_000 });
});
