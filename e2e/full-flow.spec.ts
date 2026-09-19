/**
 * 完整功能流程 E2E——用户列出的每一项功能：
 * - 注册（OTP request）
 * - 登录（OTP verify）
 * - 查看项目（/projects 列表）
 * - 创建项目（POST /api/projects）
 * - 编辑项目（PATCH 改名）
 * - 删除项目（DELETE 软删除）
 * - 退出登录（POST /api/auth/signout）
 *
 * 策略：
 * - 用真实 Supabase（因为 Ethereal fake SMTP 不需要真实收件）
 * - 用 dev_otp code 直接绕过邮件查看
 * - 不依赖任何真实浏览器交互的点击（用 API + DOM 断言）
 */

import { test, expect } from '@playwright/test';

const URL_PUBLIC = process.env.PUBLIC_URL ?? 'http://localhost:3000';
const TEST_EMAIL = `e2e-flow-${Date.now()}@gmail.com`;

test.describe.configure({ mode: 'serial' });

test('完整流程：注册 → 登录 → 项目 CRUD → 退出', async ({ page, request, context }) => {
  page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));

  // ============ 注册 / 登录 ============
  console.log('▶ 1. POST /api/auth/otp/request');
  const reqRes = await request.post(`${URL_PUBLIC}/api/auth/otp/request`, {
    data: { email: TEST_EMAIL },
  });
  expect(reqRes.ok()).toBe(true);
  const reqBody = await reqRes.json();
  expect(reqBody.ok).toBe(true);
  // dev 模式应返回 code；生产 Ethereal 模式下 code 在 server log，不在 response
  // 改成从 server 端拿——但我们访问不到 server log
  // 所以 dev 模式必须开启 DEV_OTP_VISIBLE=1
  const code = reqBody.dev_code as string;
  expect(code).toBeTruthy();
  expect(code).toMatch(/^\d{6}$/);

  console.log(`▶ 2. POST /api/auth/otp/verify {code: ${code}}`);
  const verifyRes = await request.post(`${URL_PUBLIC}/api/auth/otp/verify`, {
    data: { email: TEST_EMAIL, code },
  });
  expect(verifyRes.ok()).toBe(true);
  const verifyBody = await verifyRes.json();
  expect(verifyBody.ok).toBe(true);
  expect(verifyBody.user.email).toBe(TEST_EMAIL);

  // 把 cookie 注入浏览器上下文
  const setCookie = verifyRes.headers()['set-cookie'];
  expect(setCookie).toBeTruthy();
  // 解析 forge_session cookie
  const cookieMatch = setCookie!.match(/forge_session=([^;]+)/);
  expect(cookieMatch).toBeTruthy();
  const cookieValue = decodeURIComponent(cookieMatch![1]);
  await context.addCookies([
    {
      name: 'forge_session',
      value: cookieValue,
      domain: new URL(URL_PUBLIC).hostname,
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);

  // ============ 登录状态验证 ============
  console.log('▶ 3. /api/auth/me 返回当前用户');
  const meRes = await request.get(`${URL_PUBLIC}/api/auth/me`);
  expect(meRes.ok()).toBe(true);
  const me = await meRes.json();
  expect(me.user.email).toBe(TEST_EMAIL);

  // ============ 创建项目 ============
  console.log('▶ 4. POST /api/projects');
  const createRes = await request.post(`${URL_PUBLIC}/api/projects`, {
    data: { name: '我的第一个项目' },
  });
  expect(createRes.ok()).toBe(true);
  const createBody = await createRes.json();
  console.log('POST /api/projects body:', JSON.stringify(createBody));
  const { project } = createBody as { project: { id: string; name: string; status: string } };
  expect(project.name).toBe('我的第一个项目');
  expect(project.status).toBe('draft');

  // ============ 查看项目列表 ============
  console.log('▶ 5. GET /api/projects 列出项目');
  const listRes = await request.get(`${URL_PUBLIC}/api/projects`);
  expect(listRes.ok()).toBe(true);
  const { projects } = (await listRes.json()) as { projects: { id: string; name: string }[] };
  expect(projects.length).toBeGreaterThanOrEqual(1);
  expect(projects.find((p) => p.id === project.id)).toBeTruthy();

  // ============ /projects 页面渲染 ============
  console.log('▶ 6. 访问 /projects 看到新项目');
  await page.goto(`${URL_PUBLIC}/projects`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('我的第一个项目').first()).toBeVisible({ timeout: 15000 });

  // ============ 打开项目详情 ============
  console.log('▶ 7. GET /api/projects/:id');
  const detailRes = await request.get(`${URL_PUBLIC}/api/projects/${project.id}`);
  expect(detailRes.ok()).toBe(true);
  const { project: detail } = (await detailRes.json()) as { project: { id: string; name: string } };
  expect(detail.id).toBe(project.id);

  // ============ 编辑（改名）============
  console.log('▶ 8. PATCH /api/projects/:id 改名');
  const patchRes = await request.patch(`${URL_PUBLIC}/api/projects/${project.id}`, {
    data: { name: '改名后的项目' },
  });
  expect(patchRes.ok()).toBe(true);

  // 验证改名生效
  const listAfter = await request.get(`${URL_PUBLIC}/api/projects`);
  const { projects: after } = (await listAfter.json()) as { projects: { id: string; name: string }[] };
  expect(after.find((p) => p.id === project.id)?.name).toBe('改名后的项目');

  // ============ 详情页渲染（包含改名）============
  console.log('▶ 9. /projects/:id 工作现场渲染（URL 即项目地址）');
  await page.goto(`${URL_PUBLIC}/projects/${project.id}`, { waitUntil: 'domcontentloaded' });
  // 空会话项目（未生成过）：工作现场渲染为空白待开始，不报错不字面量死胡同
  await expect(page.getByRole('heading', { name: '想做点什么？' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByPlaceholder('描述你想做的东西…')).toBeVisible();

  // ============ 删除（软删除）============
  console.log('▶ 10. DELETE /api/projects/:id 归档');
  // 拦截 window.confirm 自动点 OK
  page.on('dialog', (d) => void d.accept());
  const deleteRes = await request.delete(`${URL_PUBLIC}/api/projects/${project.id}`);
  expect(deleteRes.ok()).toBe(true);

  // 验证已归档（列表不再显示）
  const listFinal = await request.get(`${URL_PUBLIC}/api/projects`);
  const { projects: final } = (await listFinal.json()) as { projects: { id: string; status: string }[] };
  expect(final.find((p) => p.id === project.id)).toBeUndefined();

  // ============ 退出登录 ============
  console.log('▶ 11. POST /api/auth/signout');
  const signoutRes = await request.post(`${URL_PUBLIC}/api/auth/signout`);
  expect(signoutRes.ok()).toBe(true);
  // 退出后 /api/auth/me 应该返回 null
  const meAfter = await request.get(`${URL_PUBLIC}/api/auth/me`);
  const meAfterBody = await meAfter.json();
  expect(meAfterBody.user).toBeNull();
});
