# 14 — 部署形态与运行时架构

Type: grilling
Status: resolved
Blocked by: 06, 07, 08, 10, 12

## Question

本票由「MVP 范围裁剪」之后的一次地图审查触发。**这是一个结构性缺口**：
终点定义（含账号与用量限制 + 生成应用的后端）与 25 项功能清单都已齐备，
但没有任何一张票讨论过**这套东西跑在哪里**。

`docs/03-architecture.md` 里有设计（k8s + 各 namespace + 各 Service），
但那是**基于 WebContainer 与自研 BaaS 的旧设计**，现在已大半失效。

### 已知的运行时组件（从已解决的票推导）

| 组件 | 来源 | 性质 |
|---|---|---|
| Next.js 应用 | ticket 11 | 长驻，认证页必须动态渲染 |
| Orchestrator（Mastra） | ticket 06 | 长驻，持有 SSE 长连接，内存里跑 agent loop |
| LLM Gateway 调用 | ticket 06 | 出站 HTTP，持有 provider API key |
| Supabase 客户端 | ticket 07/08 | 出站 HTTP，持有 management token + secret key |
| E2B SDK 调用 | ticket 12 | 出站 HTTP，持有 E2B API key |
| Postgres（Forge 自己的） | ticket 06/07 | 会话、消息、credits、workspace |
| GC 定时任务 | ticket 13 | 需要长期调度 |
| 发布产物托管 | ticket 12 | 独立注册域（MVP 不做，但架构要留位） |

## Answer

Resolved 2026-09-12。

### 执行环境：Railway 长驻单机

**选 Railway**，理由是三条硬约束在长驻进程里全部自然满足，在 Serverless 里都要绕：

**硬约束 1 — SSE 有时长上限**

Vercel 官方文档的 maxDuration 表格：

| 计划 | 默认 | 最大 | 扩展最大 |
|---|---|---|---|
| Hobby | 300s | **300s（不可提高）** | — |
| Pro | 300s | 800s | 1800s（beta） |

> *"SSE and Vercel's native WebSocket support both run inside a Vercel Function, so both
> inherit its duration limit."* — Ably 文档

一次完整生成链（理解 → 计划 → 写文件 → install → migrate → gate → build）在乐观情况
下也要 1–3 分钟，自修复重试时更长。300s 不够，800s 在极端情况下仍可能不够。

Vercel Workflows 可以绕过时长限制，但它仍在 beta，GA 时间表无公开承诺（GitHub issue #461）。
不适合作为 MVP 的架构支柱。

**硬约束 2 — GC 定时任务需要长期调度**

Railway 的 cron service 是 first-class 概念，和 web service 共享同一个 project、
同一套环境变量和私网。Serverless 的 cron 要么依赖额外服务，要么受执行时长约束。

**硬约束 3 — 密钥必须在服务端**

ticket 07 的 `Sb-Forwarded-For` 需要 secret key，ticket 08 的 secret key 只进沙箱环境变量。
这些密钥都必须在同一个持有它们的进程里使用，不能跨越 Serverless 的无状态边界。

**成本（2026 行情）**：

| 方案 | 月成本 | 备注 |
|---|---|---|
| Railway Hobby | ~$15–20 | Next.js + orchestrator + Postgres，all-in |
| Vercel Pro | $20/seat | 还需独立长驻 orchestrator + SSE 重连机制 |
| Fly.io | ~$15–20 | 类似 Railway，CLI 稍复杂 |
| k8s | $80+ | 严重过度设计，个位数到几十人流量 |

Railway 的 `railway up` 体验与 Vercel 同级，有自动 HTTPS，环境变量 UI，
plus 内置 Postgres 服务——这避免了独立维护一个 Postgres 实例。

### 部署形态

```
Railway project
  ├── web service          Next.js (output: 'standalone') + Mastra orchestrator
  │     ├── /api/generate  SSE endpoint（无时长限制）
  │     ├── /api/auth      Supabase session 读写
  │     └── /              其余页面
  ├── cron service         GC 定时任务（每日 02:00）
  └── Postgres plugin      Forge 自己的 DB（sessions, messages, credits, workspaces）
```

Mastra orchestrator 作为 Next.js 进程内的 module 导入，而不是独立 service——
个位数流量下共享同一个 Node 进程的开销可以接受，且避免了跨 service 的 SSE 转发问题。
若后续扩容需要独立 orchestrator，只需拆出来作为独立 Railway service 即可。

### 认证页动态渲染

**不需要写 `export const dynamic = 'force-dynamic'`**。

Next.js 官方文档（2026-06-09 更新）明确：

> *"`cookies` is a Request-time API whose returned values cannot be known ahead of time.
> **Using it in a layout or page will opt a route into dynamic rendering.**"*

任何调用了 `await cookies()` 的 Server Component（包括通过 `createServerClient`
读取 Supabase session）会自动触发动态渲染——这正是 Supabase 官方推荐的使用方式。

需要注意的只有一种情况：**既不读 cookies、又不应被缓存的路由**（如管理面板的数据查询）。
这类路由用 `fetch(..., { cache: 'no-store' })` 或响应头 `Cache-Control: no-store` 解决。

注：GitHub issue #65170 报告了 `force-dynamic` 在 v14.2.0 下的 data cache bug，
已在同周期修复。说明 `force-dynamic` 的语义历史上有过不稳定，避免依赖它更稳健。

### 平台密钥存放

**Railway 环境变量**（`railway variables set KEY=value`）。

进程级隔离是合理的安全边界：密钥只在 Railway 控制台和 `railway` CLI 下可见，
不出现在代码仓库里，不出现在日志里。

密钥清单（全部服务端，不进前端）：
- `E2B_API_KEY` — E2B 沙箱创建与管理
- `SUPABASE_MANAGEMENT_TOKEN` — 生成应用的 Supabase 项目 provision
- `SUPABASE_SECRET_KEY` — 注入生成应用的 E2B 沙箱环境变量（ticket 08）
- `LLM_PROVIDER_KEY` — Anthropic / OpenAI provider
- `DATABASE_URL` — Forge 自己的 Postgres（Railway 自动注入）

引入 Vault / Doppler 是为未来的多环境、轮换、审计准备的——MVP 规模下是过度设计。

### `Sb-Forwarded-For` 落地

ticket 07 指出代理后面 Supabase 会看到代理 IP，需要转发真实 IP + secret key：

```typescript
// Next.js Route Handler（服务端，持有 SUPABASE_SECRET_KEY）
const supabase = createClient(url, process.env.SUPABASE_SECRET_KEY!, {
  global: {
    headers: {
      'Sb-Forwarded-For': request.headers.get('x-forwarded-for') ?? '',
    },
  },
});
```

Railway 的反向代理会正确设置 `x-forwarded-for`，无需额外配置。
这段代码只出现在 Route Handler 里，不在客户端组件里——secret key 保持服务端。

### 可观测性

最小可观测性，零额外服务：

- **Railway 内置日志**：结构化日志到 stdout，Railway 控制台可查、可搜索、可导出
- **ticket 07 的管理面板** 扩展一栏"最近错误"：从 Postgres 的 `error_log` 表读取
- **Railway 内置 metrics**：CPU / 内存 / 响应时间，用于检测失控的 E2B 账单

不引入 Sentry——两个理由：个位数流量下错误率低；出错时 Railway 日志 + Postgres
记录的 session 状态已经够用来重现问题。

### 从 `docs/03-architecture.md` 迁移

旧设计（k8s + 各 namespace）有以下内容需要更新：
- § "基础设施层"：k8s → Railway project
- § "沙箱层"：gVisor/k8s pod → E2B（ticket 12 已定）
- § "认证层"：Supabase 按账号 OAuth → 匿名登录 + Turnstile（ticket 07 已定）
- § "BaaS 层"：自研 → Supabase Platforms（ticket 04/08 已定）
- § "发布层"：保留决策（独立注册域子域），删去"周末内实现"的预期

本票不重写 `docs/03-architecture.md`——那是实现阶段的工作，
map 记录"旧架构文档大半已失效"就够了。

### 证据

- <https://vercel.com/docs/functions/configuring-functions/duration> —
  maxDuration 表格；Hobby 300s 硬上限；SSE 继承该限制；Workflows 仍 beta
- <https://github.com/vercel/workflow/discussions/461> —
  Vercel Workflows GA 时间表无公开承诺
- <https://nextjs.org/docs/app/api-reference/functions/cookies> —
  `cookies()` 自动触发动态渲染（2026-06-09 版）
- <https://github.com/vercel/next.js/issues/65170> —
  `force-dynamic` 在 v14.2.0 下曾有 data cache bug（已修复）
- Railway / Fly.io 定价行情（2026）：always-on 单机 $15–20/月

### 下游影响

- **ticket 13（GC）**：cron service 是 Railway 原生概念，确认了实现载体
- **`docs/03-architecture.md`**：旧架构文档大半失效，实现时需重写
- **ticket 07 的 `Sb-Forwarded-For`**：落地方式已明确（Route Handler + secret key）
