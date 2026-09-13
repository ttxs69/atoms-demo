# forge-auth-session — 登录状态持久化 + 项目列表（待评审）

**目的**：让登录状态可视化、可退出；登录后能看到自己的项目。

## 当前已发现的问题

1. **SITE_URL 是 localhost** —— 邮件链接跳转到 `http://localhost:3000`，用户必须手动改域名才能用
2. **登录状态没有 UI 展示** —— 顶栏只有一个"升级保存"链接，登录后变成"已绑定邮箱"badge，但没有"退出"按钮
3. **登录后 workspace 丢失** —— `window.location.href = '/'` 硬刷新 + cookie 没传过来 = 回到空状态
4. **没有项目列表** —— forge-projects/spec.md 已经写过

## 第一阶段：基础设施修复（必须先做）

### 1.1 Supabase 配置

在 Supabase dashboard 修改：
- **SITE_URL** → `https://forge-app-production-b189.up.railway.app`
- **Additional Redirect URLs** → `https://forge-app-production-b189.up.railway.app/**` 和 `http://localhost:3000/**`（保留开发）
- 重新部署触发配置生效

### 1.2 magic link 链接格式

当前代码：
```jsx
<Auth ... redirectTo="/" />
```

`redirectTo="/"` 是相对路径。Supabase 会拼成 `SITE_URL + /`，所以 SITE_URL 修对就 OK。
**但**：保险起见用绝对路径：
```jsx
const siteUrl = typeof window !== 'undefined' ? window.location.origin : '';
<Auth ... redirectTo={`${siteUrl}/auth/callback`} />
```

新增路由 `/auth/callback` 处理 magic link 落地：等 Supabase 解析 URL fragment 里的 token → 自动签发 session → 设 cookie → 跳回 `/`。

### 1.3 客户端 session 配置

```ts
const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,        // 默认 true，写 localStorage
    autoRefreshToken: true,       // 默认 true，refresh token 自动续期
    detectSessionInUrl: true,     // 默认 true，magic link 回调时自动解析 URL
    storageKey: 'forge-auth',     // 自定义 key 避免冲突
  },
});
```

### 1.4 服务端 cookie 配置

当前 `/api/auth/session`：
```ts
'set-cookie': `${COOKIE}=${TOKEN}; HttpOnly; Path=/; SameSite=Lax; ${secure} Max-Age=2592000`
```

**问题**：跨站跳转时浏览器不发 cookie。修复：
```ts
const isHttps = url.startsWith('https://');
'set-cookie': `${COOKIE}=${TOKEN}; HttpOnly; Path=/; SameSite=Lax${
  isHttps ? '; Secure' : ''
}; Max-Age=2592000`,
```

`SameSite=Lax` 在 HTTPS 跳转后浏览器**会**发送 cookie（top-level navigation GET）。但魔法链接跳转是 GET，所以 Lax OK。

### 1.5 workspace state 恢复（必须）

登录后硬刷到 `/`，React state 全丢。但我们已经有 `/api/preview` 恢复路径（前提是 cookie 同步成功）。验证：
- 登录前访问 `/api/preview` → 没有 session → 401（正常）
- 登录后访问 `/api/preview` → 有 cookie → 返回 `{url, files}` → 重建工作区

**关键修复**：确保 magic link 跳转后 cookie 立刻可用。当前 magic link 落地在 `/auth/callback`，那是 Supabase JS SDK 处理 URL，签发 session。但我们的 `forge_session` cookie 是 `/api/auth/session` 设的——必须在 session 签发后立刻调用。

修复方案：在 `/auth/callback` 页面里：
```tsx
useEffect(() => {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) {
      fetch('/api/auth/session', { method: 'POST', body: JSON.stringify({ accessToken: session.access_token }) })
        .then(() => router.push('/'));
    }
  });
}, []);
```

## 第二阶段：登录状态 UI（顶栏）

顶栏右侧当前：
```
[升级保存] [预览]
```

登录后应该是：
```
[头像/邮箱首字母] [v]  [预览]
  ↓ 点 v
  ┌─────────────────┐
  │ 已登录: a@x.com │
  │ 退出登录        │
  └─────────────────┘
```

**实现**：用 shadcn `<DropdownMenu>`（需装：`npx shadcn@latest add dropdown-menu`）：
- 触发：圆形头像（首字母 + 背景色）
- 内容：邮箱（只读）+ "退出登录" 按钮
- 退出：`supabase.auth.signOut()` + 清 cookie + `window.location.href = '/'`

**匿名态保留**：用 `<Button variant="outline">登录</Button>`，点击跳 `/login`。匿名用户的 session 仍然在（不退出匿名），只是顶部标识换。

## 第三阶段：项目列表（衔接到 forge-projects/spec.md）

### 3.1 数据迁移（forge-projects ticket 1）

`projects` 表 + `project_files` 表 + Storage bucket `project-files`。先建表 + RLS，不改代码。

### 3.2 匿名 → 已登录 升级（forge-projects ticket 2）

魔法链接登录成功后，在 `/auth/callback` 里：
- 拿到当前匿名 session 对应的 sandbox_id + preview_url + 文件
- 调用 `POST /api/projects` 创建项目（user_id = 当前登录用户）
- 把当前 workspace 的所有文件写到 Supabase Storage（绑定到 project_id）
- 更新 projects.sandbox_id, preview_url

### 3.3 项目列表路由 `/projects`（forge-projects ticket 7）

shadcn `<Card>` 网格，每个卡片：
- 项目名字（前 30 字符）
- 状态 badge（generating / ready / failed / archived）
- "最后打开时间"（相对时间）
- 点击 → `/projects/:id`（=当前工作区 + 面包屑）

**已登录用户**进入 `/` → 检查是否已有项目 → 没有 → 走匿名模式开始；有 → 重定向到 `/projects`。

**匿名用户**进 `/` → 保持现状（不强制登录）。

### 3.4 项目 API

```
GET  /api/projects           列表
POST /api/projects           新建（来自 /auth/callback 的升级）
GET  /api/projects/:id       详情
PATCH /api/projects/:id      改名 / 归档
DELETE /api/projects/:id     软删除
POST /api/projects/:id/preview  重新 build 预览
```

所有 API 鉴权：必须登录（user_id != null），RLS 二次保护。

## 实施顺序（强制依赖）

**必须先做**才能做后面的：

1. ✅ 修 Supabase SITE_URL + redirect URL（基础设施）
2. ✅ `/auth/callback` 路由 + cookie 同步（基础设施）
3. ✅ 顶栏 DropdownMenu 登录状态 UI（独立功能）
4. ✅ 退出登录（独立功能）
5. 🔗 数据迁移 `projects` 表
6. 🔗 匿名 → 已登录 升级逻辑
7. 🔗 `/projects` 路由 + 列表 UI
8. 🔗 项目 API + RLS

## 风险

| 风险 | 缓解 |
|---|---|
| 改 SITE_URL 影响开发 | 加 `http://localhost:3000/**` 到 Additional Redirect URLs |
| Supabase JS 在多个地方创建 client 实例 | 抽 `src/lib/supabase.ts` 单例 |
| 项目升级时 sandbox 死了（用户登录前等太久） | 升级时检测 sandbox 状态，死了就只持久化文件 |
| 多个标签页同时升级导致竞态 | 单 tab 锁定升级流程 |

## 不做什么

- ❌ 不做密码登录（魔法链接已足够）
- ❌ 不做 OAuth（Google/GitHub）—— MVP 不要，密钥管理麻烦
- ❌ 不做"会话中切换账户"—— 用户自己退出重登
- ❌ 不做项目分享/协作
- ❌ 不做项目 fork