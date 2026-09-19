/**
 * 持久化 e2e（docs/04 §7 的收尾缺口）：
 *
 *  1. seeded-replay —— 不跑 LLM/E2B：直接经 service key 种下 project +
 *     project_events，刷新断言水合。锁的是单测锁不住的东西：真实列名、
 *     jsonb 经 PostgREST 的往返、属主校验、客户端水合接线。
 *  2. journey —— 一次真实生成（一个身份、一个回合），流结束后刷新，
 *     断言对话仍在。锁的是 generate 路由 finally 里的 journal 写入时序。
 *
 * Mock 策略：对 supabase 不做任何 page.route 拦截——mock 会恰好删掉本
 * 文件存在的理由。限流对策全在用例设计上：每条用例恰好一个匿名身份；
 * 种子替代真实生成（省 LLM/E2B/时间）；无 APPS env 时整文件 skip。
 * 匿名身份与残留行由 30 天 GC 兜底回收，不做硬清理。
 */
import { test, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function envOf(key: string): string {
  if (process.env[key]) return process.env[key] as string;
  try {
    const raw = readFileSync('.env', 'utf-8');
    for (const line of raw.split('\n')) {
      if (line.startsWith(`${key}=`)) return line.slice(key.length + 1).trim();
    }
  } catch {
    /* no .env */
  }
  return '';
}

function serviceDb(): SupabaseClient | null {
  const url = envOf('APPS_SUPABASE_URL');
  const key = envOf('APPS_SUPABASE_SECRET_KEY');
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** 等匿名身份就绪（header 出现 升级保存 或 dev-），并轮询 /api/auth/me
 * 直到 forge_session cookie 生效——注意 setIdentity 早于 cookie 设置（中间隔着
 * Turnstile，最多 10s），header 文本不是可靠的同步点。 */
async function anonymousUserId(page: import('@playwright/test').Page): Promise<string> {
  await expect(page.locator('header')).toContainText(/升级保存|dev-/, { timeout: 30_000 });
  const deadline = Date.now() + 20_000;
  for (;;) {
    const data = await page.evaluate(async () => {
      const res = await fetch('/api/auth/me');
      return (await res.json()) as { user: { id: string } | null };
    });
    if (data.user) return data.user.id;
    if (Date.now() > deadline) {
      throw new Error('forge_session cookie never became valid (20s)');
    }
    await page.waitForTimeout(500);
  }
}

const seedMarker = `种子${Date.now().toString(36)}`;

/** 在页面里轮询直到 fn 返回真值（带 deadline）。
 * 注意：本 Playwright 版本的 waitForFunction 不 await async 函数的
 * Promise——async ()=>false 会 30ms 假通过。必须用这种显式轮询。 */
async function pollInPage(
  page: import('@playwright/test').Page,
  fn: () => Promise<boolean>,
  timeoutMs: number,
  what: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await page.evaluate(fn)) return;
    if (Date.now() > deadline) throw new Error(`timeout waiting for ${what}`);
    await page.waitForTimeout(1_000);
  }
}

test('种子回放：project_events 经真实 PostgREST 往返后刷新可水合', async ({ page }) => {
  test.setTimeout(60_000);
  const db = serviceDb();
  test.skip(!db, '需要 APPS_SUPABASE_URL / APPS_SUPABASE_SECRET_KEY（.env）');

  await page.goto('/');
  const userId = await anonymousUserId(page);

  const { data: project, error: projectError } = await db!
    .from('projects')
    .insert({
      user_id: userId,
      name: `e2e-${seedMarker}`,
      status: 'ready',
      last_opened_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  expect(projectError).toBeNull();
  const projectId = project!.id as string;

  const { error: eventsError } = await db!
    .from('project_events')
    .insert([
      {
        project_id: projectId,
        turn_id: `t-${seedMarker}`,
        message_id: null,
        kind: 'user_message',
        payload: { kind: 'user_message', messageId: null, text: `用户说 ${seedMarker}` },
      },
      {
        project_id: projectId,
        turn_id: `t-${seedMarker}`,
        message_id: 'seed-eng-1',
        kind: 'agent_message',
        payload: {
          kind: 'agent_message',
          messageId: 'seed-eng-1',
          agentHandle: 'eng',
          text: `Alex 写好了 ${seedMarker}`,
          files: [{ path: 'src/App.tsx', bytes: 900 }],
          errors: [],
          creditsUsed: 123,
          aborted: false,
        },
      },
    ]);
  expect(eventsError).toBeNull();

  try {
    // URL 即状态：直访项目工作现场 → 挂载水合（/api/projects/[id]/events）
    await page.goto(`/projects/${projectId}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(`用户说 ${seedMarker}`)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(`Alex 写好了 ${seedMarker}`)).toBeVisible();
    await expect(page.getByText('Alex').first()).toBeVisible();

    // API 侧的 schema 往返：jsonb 字段无损、message_id 保真、seq 递增
    const events = await page.evaluate(async (id: string) => {
      const res = await fetch(`/api/projects/${id}/events`);
      return (await res.json()) as {
        events: { seq: number; message_id: string | null; payload: Record<string, unknown> }[];
      };
    }, projectId);
    expect(events.events.length).toBe(2);
    const [row0, row1] = events.events;
    expect(row1!.message_id).toBe('seed-eng-1');
    expect(row1!.seq).toBeGreaterThan(row0!.seq);
    expect(
      (row1!.payload as { files?: { path?: string; bytes?: number }[] }).files?.[0],
    ).toEqual({ path: 'src/App.tsx', bytes: 900 });
  } finally {
    // 软删兜底；失败则交给 30 天匿名 GC
    await db!.from('projects').update({ status: 'archived' }).eq('id', projectId);
  }
});

test('AC2 冷恢复：杀掉真实沙箱 → 下一回合从快照恢复文件树', async ({ page }) => {
  test.setTimeout(420_000);
  const marker = `复原${Date.now().toString(36)}`;

  await page.goto('/');
  const userId = await anonymousUserId(page);
  await page.getByPlaceholder('描述你想做的东西…').fill(`做一个页面，大标题只写「${marker}」`);
  await page.getByRole('button', { name: '开始' }).click();
  await expect(page.locator('header')).toContainText('生成中', { timeout: 60_000 });
  await expect(page.locator('header')).not.toContainText('生成中', { timeout: 240_000 });

  // 快照已提交的确定性信号：snapshot.save 完成后回写 projects（status=ready + file_count>0）。
  // 真·轮询（waitForFunction 在本版本对 async 函数假通过）。
  await pollInPage(
    page,
    async () => {
      const res = await fetch('/api/projects');
      const { projects } = (await res.json()) as { projects?: { status?: string; file_count?: number }[] };
      const p = projects?.[0];
      return p?.status === 'ready' && (p?.file_count ?? 0) > 0;
    },
    120_000,
    'snapshot committed (status=ready, file_count>0)',
  );

  // 期望值 = 快照对象本身（与模型怎么转写 marker 无关）：恢复后的 src 树
  // 必须逐路径、逐字节等于快照里的 src 树。
  const db = serviceDb();
  test.skip(!db, '需要 APPS_SUPABASE_* env');
  const snapDownload = await db!.storage.from('project-snapshots').download(`${userId}.json`);
  assert.ok(snapDownload.data, 'snapshot object must exist after commit');
  const snapshotFiles = JSON.parse(await snapDownload.data.text()) as Record<string, string>;
  const snapshotSrc = Object.keys(snapshotFiles).filter((p) => p.startsWith('src/')).sort();
  expect(snapshotSrc.length).toBeGreaterThan(0);

  // 杀掉本 workspace 的沙箱（只按 metadata 定位，不误伤）
  const apiKey = envOf('E2B_API_KEY');
  test.skip(!apiKey, '需要 E2B_API_KEY');
  const { Sandbox } = await import('e2b');
  const paginator = Sandbox.list({ apiKey, query: { metadata: { workspace_id: userId } } });
  let batch = await paginator.nextItems();
  const targets = [...batch];
  while (paginator.hasNext) {
    batch = await paginator.nextItems();
    targets.push(...batch);
  }
  expect(targets.length).toBeGreaterThanOrEqual(1);
  for (const sb of targets) await Sandbox.kill(sb.sandboxId, { apiKey });

  // 死亡确认：/api/files 变 404（E2B list 有最终一致性，轮询而非瞬时断言）
  {
    const deadline = Date.now() + 30_000;
    for (;;) {
      const deadStatus = await page.evaluate(async (id: string) => {
        const res = await fetch(`/api/files?session=${id}`);
        return res.status;
      }, userId);
      if (deadStatus === 404) break;
      if (Date.now() > deadline) {
        throw new Error(`sandbox still reachable after kill (status ${deadStatus})`);
      }
      await page.waitForTimeout(1_000);
    }
  }

  // 下一回合触发冷恢复；要求不动文件，保证断言确定性
  await page.getByPlaceholder('描述你想做的东西…').fill('不要修改任何文件，只回复：收到');
  await page.getByRole('button', { name: '开始' }).click();
  await expect(page.locator('header')).toContainText('生成中', { timeout: 60_000 });
  await expect(page.locator('header')).not.toContainText('生成中', { timeout: 300_000 });

  // 恢复验证（模型无关）：恢复后的 src 文件集合 == 快照的 src 集合，
  // 且 src/App.tsx 逐字节等于快照内容。
  const restoredTree = await page.evaluate(async (id: string) => {
    const list = (await (await fetch(`/api/files?session=${id}`)).json()) as { files?: string[] };
    const app = await fetch(`/api/files?session=${id}&path=${encodeURIComponent('src/App.tsx')}`);
    return {
      src: (list.files ?? []).filter((p) => p.startsWith('src/')).sort(),
      appTsx: app.ok ? ((await app.json()) as { content?: string }).content ?? null : null,
    };
  }, userId);
  expect(restoredTree.src).toEqual(snapshotSrc);
  expect(restoredTree.appTsx).toBe(snapshotFiles['src/App.tsx'] ?? null);

  // UI 可见出口：展开预览面板 → 切代码页 → 恢复的文件在列表里。
  // （代码按钮在预览面板内部；展开后页内会有第二个「预览」tab，header 作用域限定。）
  await page.locator('header').getByRole('button', { name: '预览' }).click();
  await page.getByRole('button', { name: '代码' }).click();
  await expect(page.getByText('src/App.tsx').first()).toBeVisible({ timeout: 15_000 });
});

test('AC3 登录找回：升级→清环境→magic link 重登→对话与 workspace 都回来', async ({ page, context }) => {
  test.setTimeout(300_000);
  const marker = `找回${Date.now().toString(36)}`;
  const email = `e2e-ac3-${Date.now()}@test.dev`;
  const password = 'e2e-pass-123';

  await page.goto('/');
  await anonymousUserId(page);
  await page.getByPlaceholder('描述你想做的东西…').fill(`做一个页面，大标题只写「${marker}」`);
  await page.getByRole('button', { name: '开始' }).click();
  await expect(page.locator('header')).toContainText('生成中', { timeout: 60_000 });
  await expect(page.locator('header')).not.toContainText('生成中', { timeout: 240_000 });

  // 匿名 → 邮箱升级（身份 id 不变，对话/产物的归属随之保留）
  const upgradeStatus = await page.evaluate(
    async ({ email, password }) => {
      const res = await fetch('/api/auth/upgrade', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      return res.status;
    },
    { email, password },
  );
  expect(upgradeStatus).toBe(200);

  // 模拟换设备：cookie + localStorage 全清
  await page.evaluate(() => localStorage.clear());
  await context.clearCookies();

  // magic link 重登（admin.generateLink 服务端铸链，零邮件消耗，不打 SMTP 限流）
  const db = serviceDb();
  test.skip(!db, '需要 APPS_SUPABASE_* env');
  const { data: link, error: linkError } = await db!.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${page.url().split('/').slice(0, 3).join('/')}/auth/confirm` },
  });
  expect(linkError).toBeNull();
  await page.goto(link!.properties.action_link, { waitUntil: 'domcontentloaded' });
  await page.waitForURL((u) => !u.href.includes('/auth/confirm'), { timeout: 30_000 });

  // 回到工作现场：经列表「打开」（标准导航——URL 即项目地址），对话水合
  // （marker 来自 journal）+ workspace 恢复（预览徽标）
  await page.goto('/projects', { waitUntil: 'domcontentloaded' });
  const openHref = await page.getByRole('link', { name: '打开' }).first().getAttribute('href');
  expect(openHref).toMatch(/^\/projects\//);
  await page.getByRole('link', { name: '打开' }).first().click();
  await page.waitForURL((u) => /\/projects\//.test(u.pathname), { timeout: 15_000 });
  await expect(page.locator('section[aria-label="对话"]')).toContainText(marker, { timeout: 30_000 });
  await expect(page.locator('header')).toContainText('运行中', { timeout: 30_000 });
});

test('完整链路：真实生成一个回合 → 刷新 → 对话仍在（journal 已写入）', async ({ page }) => {
  test.setTimeout(300_000);
  const marker = `持久化${Date.now().toString(36)}`;

  await page.goto('/');
  await anonymousUserId(page);

  await page.getByPlaceholder('描述你想做的东西…').fill(`做一个极简计数器页面，标题写 ${marker}`);
  await page.getByRole('button', { name: '开始' }).click();

  // 流结束 = journal 已写入（路由在 controller.close() 前 await appendTurn），
  // 所以以"生成中"徽标消失为同步点，再刷新。
  await expect(page.locator('header')).toContainText('生成中', { timeout: 60_000 });
  await expect(page.locator('header')).not.toContainText('生成中', { timeout: 240_000 });

  await page.reload();
  await expect(page.locator('header')).toContainText(/升级保存|dev-/, { timeout: 30_000 });

  // 水合后：用户消息（带唯一 marker）与 agent 回复都在
  await expect(page.getByText(marker).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Mike|Emma|Alex/).first()).toBeVisible({ timeout: 15_000 });

  // 详情页的文件清单与 header 计数同源（用户报告过「14 个文件 vs 还没有文件」
  // 的矛盾——此处锁住 manifest 同步：status=ready ⟹ project_files 已镜像）
  const detail = await page.evaluate(async () => {
    const list = await fetch('/api/projects').then((r) => r.json());
    const id = list.projects?.[0]?.id as string;
    const res = await fetch(`/api/projects/${id}`);
    return (await res.json()) as {
      project: { file_count: number };
      files: { path: string }[];
    };
  });
  const paths = detail.files.map((f) => f.path);
  expect(paths).toContain('package.json');
  expect(paths).toContain('src/App.tsx');
  expect(detail.project.file_count).toBe(detail.files.length);
});
