# 08 — 生成的应用如何取得数据库与登录

Type: grilling
Status: resolved
Blocked by: 04

## Question

依赖 ticket 04 的 Supabase 调研结论。待定的是**产品决策**：
用户在对话里说"要能登录、数据要持久化"之后，实际发生什么？

待定的决策：

- **接入模式**：用户自带 Supabase 项目（Atoms 路线，需 OAuth，摩擦大但用户掌控数据）
  还是平台托管一个共享后端（摩擦小但平台承担成本与合规）？
- 如果走 OAuth：用户没有 Supabase 账号怎么办？能否代建？
- 如果走平台托管：如何隔离不同用户生成的应用的数据？
- **生成时机**：是构建时就建好表，还是运行时首次访问再建？
- **密钥处理**：anon key 必然出现在前端代码里——这是可接受的吗？
  service role key 绝不能进前端，那么需要服务端逻辑的操作（发邮件、调第三方 API）
  如何实现？WebContainer 没有服务端，这个缺口怎么补？
- 如果生成的应用需要一个真正的服务端（如 Stripe webhook），
  本地图的终点要不要覆盖？还是明确记为"不支持，请自行部署"？
- 无后端应用的默认形态：纯前端 + localStorage？如何向用户解释数据会丢？

## Answer

Resolved 2026-09-12。

### ticket 08 的问题写在 WebContainer 假设下，一半已过时

ticket 12 把沙箱换成了 E2B。E2B 沙箱本身就是一台有服务端的机器，
`getHost(port)` 直接对外暴露 URL，可以运行 Express/Fastify/Vite
preview server。因此"WebContainer 没有服务端，这个缺口怎么补"这一问
**已有答案**：在沙箱里运行服务端进程，secret key 只活在沙箱的环境变量里，
前端通过沙箱内的 API 路由访问，绝不直接接触 secret key。

---

### 接入模式：平台托管共享 Supabase 项目 + RLS 多租户

ticket 04 已调研 Supabase Platforms 模式。**共享单项目 + RLS 是正确选择**，
理由对我们的目标用户（匿名访客、零注册）更重要：

- OAuth 需要用户有 Supabase 账号 + org，且需要等待 `ACTIVE_HEALTHY`（分钟级），
  对"打开即用"的承诺是直接违背
- 每用户独立项目：Hobby 层 2 项目上限（ticket 04 已标注为 recalled-volatile，
  但即使更高，每次生成都 provision 一个 Supabase 项目需要分钟级，且不可逆）
- 共享单项目 + RLS：即时可用，`publishable` key 前端暴露是设计意图，
  数据隔离由 RLS 策略负责

**多租户 RLS 的隔离模式**（基于调研结果）：

每个工作区（workspace）有一个 `workspace_id`，每张用户数据表带此列：

```sql
-- 模板，由平台在 migration 时注入，agent 不可覆盖
CREATE POLICY "workspace_isolation_select"
ON public.items FOR SELECT
TO authenticated
USING (workspace_id = current_setting('app.workspace_id')::uuid);

CREATE POLICY "workspace_isolation_insert"
ON public.items FOR INSERT
TO authenticated
WITH CHECK (workspace_id = current_setting('app.workspace_id')::uuid);
```

`current_setting('app.workspace_id')` 由服务端（沙箱内的 API 中间件）
在每个请求的 Supabase 会话里用 `SET LOCAL app.workspace_id = '...'` 设置，
前端不知道这个值，也没有办法绕过它。

**但这里有一个重要的 RLS 安全陷阱**，官方文档明确指出：

> *"Danger: A table in an exposed schema without RLS is readable and writable by any role
> with a grant on it. Enable RLS on every table in an exposed schema. On projects that still
> grant `anon` and `authenticated` by default, revoke those grants. **Adding policies doesn't
> remove them.** A table protected only by policies still hands `anon` an insert path if you
> never revoke the grant."*

这意味着：**agent 如果只写 RLS 策略而不撤销 grant，表仍然是不安全的**。

### agent 生成的 schema 必须经过安全门控

这是本票最关键的结论：**agent 生成的 SQL migration 不能直接信任**。

我们需要两道门控，按顺序执行：

**门控 1：RLS 模板注入（由平台强制，不经过 agent）**

平台维护一套不可覆盖的 migration 模板，在 agent 生成的 migration
之前执行（或 wrap 它）：

```sql
-- 平台强制前置 migration，agent 的 CREATE TABLE 之后自动追加：
ALTER TABLE public.{table_name} ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.{table_name} FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.{table_name} TO authenticated;
-- 然后注入 workspace_isolation 策略
```

实现方式：agent 的 `run_migration` tool 接受 SQL，但执行前用 AST 解析
（或简单的正则）提取所有 `CREATE TABLE` 语句，并追加上面的模板。
Agent 无法 opt-out 这个步骤。

**门控 2：Security Advisor 扫描**

Migration 执行后，调用 Supabase Security Advisor API 确认无问题：

```typescript
// Supabase Management API
const result = await fetch(
  `https://api.supabase.com/v1/projects/${projectRef}/advisors/security`,
  { headers: { Authorization: `Bearer ${managementToken}` } }
);
// 如果有 LINT_0024_PERMISSIVE_RLS_POLICY 或 rls_disabled_in_public，
// 回滚 migration 并拒绝展示应用
```

也可以在 CI 里用 `rlsgate`（开源静态扫描器，无需 DB 连接，
专为 vibe-coded app 设计，会检测 `USING(true)` 和 secret key 泄漏）：
`npx rlsgate ./supabase/migrations` — 来源：github.com/GerardoRdz96/rlsgate

**关于 `supabase db advisors --local` 的已知 bug**：

GitHub issue #5868 确认 `--local` 模式漏掉了 `rls_disabled_in_public` 等
API-exposure 类 lint，会给出 false all-clear。
**不能用本地 CLI 作为唯一门控，必须配合线上 Management API 或 rlsgate。**

### 密钥处理

**`publishable` key（旧称 `anon` key）**：

可以出现在前端生成代码里——这是 Supabase 的设计意图：
> *"`SUPABASE_PUBLISHABLE_KEYS`: The publishable keys JSON dictionary for your Supabase API.
> This is safe to use in a browser when you have Row Level Security enabled"*
> — Supabase Edge Functions 环境变量文档

**`secret` key（旧称 `service_role` key）**：

绝不进前端、绝不进 agent 生成的代码。需要 secret key 的操作
（Stripe webhook、发邮件、绕过 RLS 的管理操作）通过以下路径实现：

```
前端 → [E2B 沙箱内的 API 服务器] → Supabase（用 secret key）
                                  → 第三方 API（Stripe 等）
```

沙箱内 API 服务器在启动时从沙箱环境变量读取 secret key，
不写入任何文件、不出现在 agent 的文件系统视图里。

平台在 provision 沙箱时注入：
```typescript
const sandbox = await Sandbox.create({
  env: {
    SUPABASE_URL: projectUrl,
    SUPABASE_PUBLISHABLE_KEY: publishableKey,   // 安全：前端也可用
    SUPABASE_SECRET_KEY: secretKey,             // 只存在于沙箱环境变量，不写文件
  }
});
```

agent 的 system prompt 明确禁止：
- `console.log` / `process.env` 输出 secret key
- 把 secret key 写入任何文件
- 在前端代码里使用 `SUPABASE_SECRET_KEY`

**`rlsgate` 的静态扫描**会检测 secret key 是否出现在前端 bundle——
这是第三道门控（可在 deploy 前或沙箱构建后跑）。

### 生成时机：混合策略

- **基础 schema（auth 集成、workspace 隔离表）**：构建时，作为平台 migration 模板
- **用户数据表**：agent 在生成代码的同时生成 migration，通过 `run_migration` tool 执行
- **无后端应用**：跳过 Supabase provision，直接 localStorage。
  Agent 根据用户需求判断是否需要后端（"要能登录" / "数据要保存" = 需要；
  纯展示页 = 不需要），并在沙箱内向用户说明 localStorage 的持久性限制

### 需要 Stripe / 真正服务端的场景

- Stripe webhook 在 MVP 范围外（ticket 10 Out of Scope：计费与订阅体系）
- 一般性服务端逻辑（如调第三方 API）通过沙箱内 Express API 服务 + 沙箱环境变量实现
- 若用户需要真正的持久服务端（如不依赖 E2B 的部署），MVP 明确告知：
  "预览可用，持久部署请导出代码后自行部署"

### 安全边界总结

| 层 | 能做的 | 不能做的 |
|---|---|---|
| Agent 生成的前端代码 | 使用 `publishable` key 调 Supabase | 持有 `secret` key；直接调需要服务端权限的操作 |
| 沙箱内 API 服务 | 用 `secret` key 调 Supabase；调第三方 API | 把 key 写入文件；对外暴露 key |
| RLS 模板（平台） | 强制 workspace 隔离 | 被 agent 覆盖 |
| Security Advisor | 检测 permissive policy | 检测业务逻辑错误 |
| rlsgate | 检测 policy 缺失 + secret key 泄漏 | 运行时验证 |

### 连带影响

- **ticket 09（生成循环 UX）**：需要展示 migration 执行状态（成功/失败/安全扫描结果）
- **ticket 13（GC 策略）**：需要清理的不只是 E2B 沙箱和 Supabase auth 用户，
  还有共享项目里的各 workspace 数据（RLS 行 + schema）。
  注意：共享项目不能直接删表（会影响其他 workspace），
  清理策略是 `DELETE FROM ... WHERE workspace_id = $1`
- **`docs/03-architecture.md`** 需要更新：加入 RLS 模板注入机制与 rlsgate CI 门控

### 证据

- <https://supabase.com/docs/guides/database/postgres/row-level-security> —
  grants vs policies 的双层检查、"adding policies doesn't remove grants"、
  视图绕过 RLS 的陷阱
- <https://supabase.com/docs/guides/database/database-advisors> —
  Security Advisor 可通过 MCP / CLI / Management API 调用
- <https://supabase.github.io/server/documents/environment-variables.html> —
  `SUPABASE_SECRET_KEYS` 在 Edge Functions 里自动可用，不需要配置
- <https://github.com/GerardoRdz96/rlsgate> —
  专为 vibe-coded app 设计的静态 RLS + secret key 扫描器
- <https://github.com/supabase/cli/issues/5868> —
  `supabase db advisors --local` 漏掉 API-exposure 类 lint 的已知 bug
- <https://docs.e2b.dev/network/public-url> — E2B `getHost()` 机制
