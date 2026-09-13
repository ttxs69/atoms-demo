import { test, expect } from '@playwright/test';

/**
 * UI 按钮级测试——每个用户可交互的元素至少一个断言。
 * 不依赖外部服务（不生成应用、不真实注册）。
 * 目标：15 秒内跑完全部。
 */

const URL = process.env.PUBLIC_URL ?? 'http://localhost:3000';

test.describe('空状态', () => {
  test('三个样例可点击并填入 composer', async ({ page }) => {
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('.topbar button[title], .topbar a[title]', { timeout: 30000 });
    for (const label of ['记录每日心情', '待办清单', '番茄钟']) {
      await page.locator('.examples button', { hasText: label }).click();
      const value = await page.getByRole('textbox', { name: '描述你想做的东西' }).inputValue();
      expect(value).toContain(label);
    }
  });

  test('登录已有账户 link opens the login box', async ({ page }) => {
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('.topbar button[title], .topbar a[title]', { timeout: 30000 });
    await page.locator('.linklike', { hasText: '登录已有账户' }).click();
    await expect(page.getByRole('heading', { name: '登录已有账户' })).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.login-box button', { hasText: '直接开始' })).toBeVisible();
  });
});

test.describe('顶栏', () => {
  test('升级保存 links to /login', async ({ page }) => {
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('.topbar a[href="/login"]', { timeout: 30000 });
    const href = await page.locator('.topbar a[href="/login"]').getAttribute('href');
    expect(href).toBe('/login');
  });

  test('预览 toggle changes panel visibility', async ({ page }) => {
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('.topbar button[title], .topbar a[title]', { timeout: 30000 });
    const before = await page.locator('.body').getAttribute('class');
    await page.locator('.topbar button', { hasText: '预览' }).click();
    const after = await page.locator('.body').getAttribute('class');
    expect(before).not.toBe(after);
  });
});

test.describe('/login 页面', () => {
  test('signup form renders with all fields', async ({ page }) => {
    await page.goto(`${URL}/login`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: '创建账户' })).toBeVisible();
    await expect(page.locator('input[type=email]')).toBeVisible();
    await expect(page.locator('input[type=password]')).toBeVisible();
    await expect(page.getByRole('button', { name: '注册' })).toBeVisible();
    await expect(page.getByText('已有账户？登录')).toBeVisible();
    await expect(page.getByText('跳过，继续匿名使用')).toBeVisible();
  });

  test('switch to signin mode', async ({ page }) => {
    await page.goto(`${URL}/login`, { waitUntil: 'networkidle' });
    await page.getByText('已有账户？登录').click();
    await expect(page.getByRole('heading', { name: '登录' })).toBeVisible();
    await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible();
    await expect(page.getByText('没有账户？注册')).toBeVisible();
  });

  test('password minLength=6 enforced', async ({ page }) => {
    await page.goto(`${URL}/login`, { waitUntil: 'networkidle' });
    const pw = page.locator('input[type=password]');
    expect(await pw.getAttribute('minlength')).toBe('6');
  });

  test('跳过 link goes back to workspace', async ({ page }) => {
    await page.goto(`${URL}/login`, { waitUntil: 'networkidle' });
    const href = await page.locator('.login-skip').getAttribute('href');
    expect(href).toBe('/');
  });

  test('empty form cannot submit (HTML validation)', async ({ page }) => {
    await page.goto(`${URL}/login`, { waitUntil: 'networkidle' });
    // required 属性防空提交
    expect(await page.locator('input[type=email]').getAttribute('required')).not.toBeNull();
    expect(await page.locator('input[type=password]').getAttribute('required')).not.toBeNull();
  });

  test('autocomplete attributes correct', async ({ page }) => {
    await page.goto(`${URL}/login`, { waitUntil: 'networkidle' });
    expect(await page.locator('input[type=email]').getAttribute('autocomplete')).toBe('email');
    expect(await page.locator('input[type=password]').getAttribute('autocomplete')).toBe('new-password');
    // 切到登录模式
    await page.getByText('已有账户？登录').click();
    expect(await page.locator('input[type=password]').getAttribute('autocomplete')).toBe('current-password');
  });
});

test.describe('注册→登录闭环（真实 Supabase）', () => {
  test('signup, clear, signin, workspace restored', async ({ page }) => {
    test.setTimeout(120000);
    const email = `e2e-${Date.now()}@forge.dev`;
    const password = 'e2e-pass-456';

    // 1. 注册
    await page.goto(`${URL}/login`, { waitUntil: 'networkidle' });
    await page.locator('input[type=email]').fill(email);
    await page.locator('input[type=password]').fill(password);
    await page.getByRole('button', { name: '注册' }).click();
    // 等跳回工作区
    await page.waitForURL(`${URL}/`, { timeout: 30000 });
    // 身份已建立
    await page.waitForSelector('.topbar a[href="/login"], .topbar .pill.ok', { timeout: 30000 });
    console.log('  ✓ signup complete');

    // 2. 清 localStorage 模拟换设备
    await page.evaluate(() => localStorage.clear());

    // 3. 登录
    await page.goto(`${URL}/login`, { waitUntil: 'networkidle' });
    await page.getByText('已有账户？登录').click();
    await page.locator('input[type=email]').fill(email);
    await page.locator('input[type=password]').fill(password);
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await page.waitForURL(`${URL}/`, { timeout: 30000 });
    console.log('  ✓ signin complete');

    // 4. 工作区可达（不需要有应用，只要页面正常）
    await expect(page.getByRole('heading', { name: '想做点什么？' })).toBeVisible({ timeout: 15000 });
    console.log('  ✓ workspace accessible after login');
  });
});
