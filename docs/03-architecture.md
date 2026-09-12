# 架构设计:多智能体 Vibe Coding 平台（Forge）

- 版本：v1.0
- 依据：`docs/01-atoms-core-features.md`、`docs/02-prd.md`
- 抓取时间：2026-09-12

---

## 1. 整体架构概览

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Client Layer                                  │
│   Web App (Next.js)  │  Desktop (Electron)  │  CLI  │  IDE Extension │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ HTTPS / WebSocket
┌──────────────────────────────▼───────────────────────────────────────┐
│                          API Gateway                                  │
│   Auth middleware · Rate limiting · Request routing                   │
└──┬───────────────────┬──────────────────┬───────────────────────────┘
   │                   │                  │
   ▼                   ▼                  ▼
┌──────────┐  ┌──────────────────┐  ┌──────────────────────────────┐
│  Chat &  │  │  Orchestration   │  │  Build & Sandbox Service     │
│ Session  │  │  Service         │  │  (Forge Runner)              │
│ Service  │  │  (Agent Router)  │  │  Container pool · VFS ·      │
│          │  │  Task DAG ·      │  │  Preview server ·            │
│ Message  │  │  Streaming SSE   │  │  Terminal log stream         │
│ history  │  │  Parallel exec   │  │                              │
└────┬─────┘  └────────┬─────────┘  └──────────────┬───────────────┘
     │                 │                            │
     ▼                 ▼                            ▼
┌────────────────────────────────────────────────────────────────────┐
│                          Core Data Store                            │
│   PostgreSQL (primary)  │  Redis (cache / pubsub / locks)          │
│   Object Storage (code snapshots, user assets, exports)            │
└────────────────────────────────────────────────────────────────────┘
     │
     ▼
┌────────────────────────────────────────────────────────────────────┐
│                       Platform Services                             │
│  LLM Gateway · BaaS (Postgres/Auth/Functions/Storage) ·            │
│  Billing & Credits · Secret Vault · Notification ·                 │
│  Connector Hub (GitHub/Supabase/Stripe/Linear…) ·                 │
│  Growth (SEO/GA4/Ads) · Help Center · Analytics                    │
└────────────────────────────────────────────────────────────────────┘
```

---

## 2. 前端（Web App）

### 2.1 技术选型

| 层 | 选型 | 理由 |
|---|---|---|
| 框架 | **Next.js 15 App Router** | RSC 支持流式渲染（与 Atoms 相同技术，验证可行）；Islands 架构便于将编辑器等重交互组件独立 |
| 状态 | **Zustand + React Query** | Zustand 管理会话/UI 全局状态；React Query 管理服务端数据缓存与同步 |
| 实时通信 | **Server-Sent Events (SSE)** | 智能体日志流、进度流单向推送；比 WebSocket 更简单且对 CDN 友好 |
| 代码编辑器 | **Monaco Editor** | VS Code 同源；语法高亮、diff 视图、语言服务协议 |
| 样式 | **Tailwind CSS v4 + CSS 变量 token** | 与 Atoms 相同体系；设计 token 通过 `--color-*` 等 CSS 自定义属性暴露；暗/亮双主题纯 token 切换 |
| 组件库 | **shadcn/ui**（Radix 原语 + 自定义 token） | 无样式基础组件 + 完整可访问性；所有组件引用 token 而非字面量颜色 |
| 国际化 | **next-intl** | App Router 原生 `[locale]` 段；翻译文件按功能域拆分，懒加载 |
| 构建 | **Turborepo monorepo** | `apps/web`、`apps/desktop`(Electron)、`packages/ui`、`packages/sdk` 共享组件与类型 |

### 2.2 路由结构

```
app/
  [locale]/
    page.tsx                  # 着陆页 + 首次输入
    (auth)/
      login/ register/ ...
    (app)/
      layout.tsx              # 全局导航 + 工作区 context
      workspace/[workspaceId]/
        page.tsx              # 项目列表
        projects/[projectId]/
          page.tsx            # 会话主界面（对话 + 预览 + 编辑器）
    community/                # 社区广场 App World
    settings/                 # 账户、计费、集成、域名
    help/                     # 帮助中心
      articles/[slug]/
```

### 2.3 会话主界面布局

```
┌──────────────┬────────────────────────────┬──────────────┐
│ Sidebar      │  Chat Column               │ App Viewer   │
│              │                            │ (Preview)    │
│ Project list │  Message thread            │              │
│ Version hist │  [Agent msg with avatar]   │ Desktop/Tab/ │
│ File tree    │  [User msg]                │ Mobile views │
│              │  [Agent: 🔧 Building…]     │              │
│              │  Input box                 │──────────────│
│              │  [Mode][Model][@][#][+Add] │ Editor tab   │
│              │                            │ Terminal tab │
│              │                            │ Console tab  │
└──────────────┴────────────────────────────┴──────────────┘
```

三栏布局，响应式：移动端叠加为底部 Sheet；中宽屏隐藏 Sidebar，顶部 tabs 切换；全宽桌面三栏同时展示。

### 2.4 设计 Token 体系

```css
/* 中性色阶（OKLCH，lightness 均匀步进） */
--neutral-0:  oklch(0.98 0.002 260);   /* off-white surface */
--neutral-1:  oklch(0.94 0.003 260);
--neutral-2:  oklch(0.88 0.004 260);
--neutral-3:  oklch(0.74 0.006 260);
--neutral-4:  oklch(0.56 0.007 260);
--neutral-5:  oklch(0.40 0.007 260);
--neutral-6:  oklch(0.28 0.006 260);
--neutral-7:  oklch(0.18 0.005 260);   /* off-black text */
--neutral-8:  oklch(0.12 0.004 260);

/* 主品牌色 */
--accent-hue:       265;
--accent-default:   oklch(0.60 0.22 var(--accent-hue));
--accent-hover:     oklch(0.56 0.24 var(--accent-hue));
--accent-subtle:    oklch(0.94 0.04  var(--accent-hue));

/* 语义角色 token */
--color-surface:       var(--neutral-0);
--color-surface-raised:var(--neutral-1);
--color-border:        var(--neutral-2);
--color-text-muted:    var(--neutral-4);
--color-text-body:     var(--neutral-7);
--color-brand:         var(--accent-default);

/* 暗模式 token 集（独立lightness决策，非 invert） */
@media (prefers-color-scheme: dark) {
  --color-surface:       oklch(0.14 0.005 260);
  --color-surface-raised:oklch(0.18 0.005 260);
  --color-border:        oklch(0.26 0.006 260);
  --color-text-muted:    oklch(0.60 0.006 260);
  --color-text-body:     oklch(0.94 0.003 260);
  --accent-default:      oklch(0.70 0.18  var(--accent-hue)); /* 暗模式降 chroma + 升 lightness */
}
```

WCAG AA 验证：`--color-text-body` 在 `--color-surface` 上 ≥ 4.5:1（两套主题均需实测）。

---

## 3. 后端服务分解

### 3.1 Chat & Session Service

职责：管理对话历史、消息路由、WebSocket/SSE 连接、会话版本快照。

- **技术**：Node.js（Fastify）+ PostgreSQL + Redis pubsub
- **消息格式**：每条消息含 `id、role(user|agent)、agentHandle、content、toolCalls[]、tokens、creditsUsed、createdAt`
- **SSE 流**：`/api/sessions/:id/stream` — 智能体执行时持续推送 `{type: "token|tool_call|tool_result|done|error", ...}` 事件
- **版本快照**：每次构建完成时将工作区文件快照（tar.gz）写入对象存储，记录 `versionId、snapshotKey、schemaVersion`；与数据库 migration hash 绑定

### 3.2 Orchestration Service（Agent Router）

职责：理解用户意图、构造任务 DAG、并行调度多智能体、汇总结果。

```
User Message
     │
     ▼
 Intent Parser (LLM call: classify intent, extract @mentions, extract #refs)
     │
     ▼
 Task Planner  →  DAG of sub-tasks (each with assigned agent, context slice, tools)
     │
     ▼
 Parallel Executor
     ├── Agent Worker A (@pm)  → LLM Gateway → tools → result stream
     ├── Agent Worker B (@arch) → LLM Gateway → tools → result stream
     └── Agent Worker C (@eng)  → LLM Gateway → tools → Sandbox → result stream
     │
     ▼
 Result Aggregator → stream back via SSE
```

- 每个 Agent Worker 是无状态的，context slice 由 Orchestrator 组装（角色 system prompt + 会话摘要 + 相关文件片段 + 工具列表）
- 工具集按角色白名单控制：`@eng` 可调 sandbox；`@pm` 只能读写文档；`@research` 可调网络搜索
- Race 模式：同一 context slice 发给 N 个 LLM Gateway 实例，结果流并行返回，选定后其余快照标记为 `discarded`

### 3.3 LLM Gateway

职责：统一的 LLM API 调用入口，负责路由、计费、限流、重试、降级。

```
┌─────────────────────────────────────────────────────┐
│                    LLM Gateway                       │
│                                                      │
│  Router  →  [ Claude / GPT / Gemini / Qwen / DS ]  │
│                  ↑                                   │
│  Auto mode: task_type → model preference map         │
│  Manual mode: user-specified model override          │
│                                                      │
│  Metering: token in/out per call → credit deduction  │
│  Retry: exponential backoff on 429/503               │
│  Fallback: primary fail → secondary model            │
└─────────────────────────────────────────────────────┘
```

- 模型配置存 DB，上线/下线/权重调整无需部署
- 每次调用记录 `modelId、tokensIn、tokensOut、latencyMs、creditsCharged、agentHandle、sessionId`
- **执行前预估**：通过 session context 长度 + 任务类型 → 给出预估 token 区间 → 换算为 credits 区间，在前端展示

### 3.4 Build & Sandbox Service（Forge Runner）

职责：为每个构建任务提供隔离的执行环境，运行智能体生成的代码，暴露预览 URL 与日志流。

#### 沙箱隔离方案

```
每个任务 ─────► 独立 Linux 容器（gVisor 或 Firecracker microVM）
                  ├── 只读根文件系统 + 可写 /workspace overlay
                  ├── 用户空间网络（只允许 npm registry / 白名单外部 API）
                  ├── CPU 2 core / 2 GB RAM / 10 GB tmpfs 硬限
                  ├── Seccomp profile（禁止 ptrace / mount 等危险 syscall）
                  └── 超时 TTL（默认 10 分钟，Race 模式 20 分钟）
```

- **预览服务**：容器内启动 dev server（默认端口 3000），由 Runner 的反向代理以 `/preview/:sandboxId/` 路径暴露；支持 desktop/tablet/mobile 视口模拟（通过 User-Agent 注入）
- **Terminal 流**：容器 stdout/stderr 通过 Unix socket → Runner → SSE 推给前端，延迟 < 500ms
- **工作区持久化**：任务结束时将 `/workspace` 打包进对象存储，下次恢复时挂载；容器本身无状态，池化复用
- **Issue Report 触发**：Runner 监听构建进程退出码与 stderr 模式（如 `ERROR: Build failed`），生成结构化错误报告 `{type, file, line, stack, suggestionQuery}` 推给前端；前端展示 Resolve 按钮，用户点击后把错误报告作为额外 context 重新入队 Orchestration Service

#### 容器池管理

```
Cold pool (pre-warmed, ~5 containers ready)
     │
     ▼ claim on task start (< 200ms 响应)
Active container (task running)
     │
     ▼ task ends
Recycle → wipe /workspace → return to warm pool
          (or terminate if pool full / container unhealthy)
```

### 3.5 BaaS Service（内置后端）

为用户项目提供数据库、认证、文件存储、Serverless 函数、密钥管理。

```
User project in sandbox
     │  calls Forge BaaS SDK (injected into template)
     ▼
BaaS API (per-project isolated namespace)
     ├── Database  → Supabase-compatible Postgres (per-project schema)
     ├── Auth      → JWT-based sessions, OAuth providers (Google/GitHub)
     ├── Storage   → S3-compatible object store (per-project bucket)
     ├── Functions → Deno Deploy (edge runtime, close to user)
     └── Secrets   → Vault (encrypted at rest, injected at runtime)
```

**数据库迁移随版本快照**：每个版本快照包含 `schema_migrations[]`（ddl diff），版本回滚时先执行 down migration 再切换代码快照，解决 Atoms 接入自研 Cloud 后禁用历史版本的问题。

**密钥注入流程**：
```
智能体检测到需要密钥
     ↓
前端弹出专用 SecretInput 组件（不经过对话输入框）
     ↓
客户端加密（ECDH + AES-256-GCM）后传输
     ↓
BaaS Service 存 Vault（服务端二次加密，平台侧不可解密）
     ↓
函数执行时，Runner 从 Vault 读取并注入环境变量
     ↓
函数进程沙箱内可用；日志脱敏管道过滤所有密钥格式
```

**输入框侧主动拦截**（对 Atoms 的改进）：
前端聊天输入框挂载正则检测器（客户端），匹配常见密钥格式（`sk-...`、`AKIA...`、`ghp_...`、`-----BEGIN * PRIVATE KEY-----` 等），检出后拦截发送并弹出引导 toast。

---

## 4. 数据模型（核心实体）

```sql
-- 工作区
CREATE TABLE workspaces (
  id          uuid PRIMARY KEY,
  name        text NOT NULL,
  owner_id    uuid REFERENCES users(id),
  plan        text NOT NULL,             -- 'free' | 'pro' | 'max'
  credits_balance int DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

-- 成员
CREATE TABLE workspace_members (
  workspace_id uuid REFERENCES workspaces(id),
  user_id      uuid REFERENCES users(id),
  role         text NOT NULL,            -- 'owner' | 'editor' | 'viewer'
  PRIMARY KEY (workspace_id, user_id)
);

-- 项目
CREATE TABLE projects (
  id           uuid PRIMARY KEY,
  workspace_id uuid REFERENCES workspaces(id),
  title        text,
  mode         text NOT NULL,           -- 'solo' | 'team' | 'research'
  visibility   text DEFAULT 'private',  -- 'private' | 'secret' | 'public'
  published_url text,
  primary_domain text,
  created_at   timestamptz DEFAULT now()
);

-- 版本快照
CREATE TABLE project_versions (
  id            uuid PRIMARY KEY,
  project_id    uuid REFERENCES projects(id),
  snapshot_key  text NOT NULL,          -- object storage key
  schema_migrations jsonb DEFAULT '[]',  -- DDL diffs for BaaS DB
  created_at    timestamptz DEFAULT now(),
  created_by    uuid REFERENCES users(id)
);

-- 会话（= 一个多轮对话，对应一个项目）
CREATE TABLE sessions (
  id           uuid PRIMARY KEY,
  project_id   uuid REFERENCES projects(id),
  title        text,
  status       text DEFAULT 'active',
  active_version_id uuid REFERENCES project_versions(id),
  credits_used  int DEFAULT 0,
  created_at   timestamptz DEFAULT now()
);

-- 消息
CREATE TABLE messages (
  id           uuid PRIMARY KEY,
  session_id   uuid REFERENCES sessions(id),
  role         text NOT NULL,           -- 'user' | 'agent'
  agent_handle text,                    -- '@eng' | '@pm' | …
  content      text,
  tool_calls   jsonb DEFAULT '[]',
  credits_used int DEFAULT 0,
  model_id     text,
  created_at   timestamptz DEFAULT now()
);

-- 构建任务
CREATE TABLE build_tasks (
  id            uuid PRIMARY KEY,
  session_id    uuid REFERENCES sessions(id),
  message_id    uuid REFERENCES messages(id),
  status        text DEFAULT 'pending', -- 'pending'|'running'|'success'|'failed'
  sandbox_id    text,
  error_report  jsonb,
  started_at    timestamptz,
  finished_at   timestamptz
);

-- Credits 流水
CREATE TABLE credit_transactions (
  id           uuid PRIMARY KEY,
  workspace_id uuid REFERENCES workspaces(id),
  user_id      uuid REFERENCES users(id),
  type         text,                    -- 'daily_gift'|'subscription'|'bonus'|'usage'|'refund'
  amount       int NOT NULL,            -- 正=入账，负=扣减
  ref_id       text,                    -- message_id / subscription_id / …
  created_at   timestamptz DEFAULT now()
);
```

---

## 5. 关键技术决策

### 5.1 沙箱技术选型

| 选项 | 隔离强度 | 启动速度 | 运维复杂度 | 推荐场景 |
|---|---|---|---|---|
| Docker + seccomp | 中 | 快 (< 1s) | 低 | MVP / 小规模 |
| gVisor (runsc) | 高（Kernel 拦截） | 中 (1–2s) | 中 | 推荐 v1 正式版 |
| Firecracker microVM | 极高 | 中 (150ms 冷启动) | 高 | v2 大规模 |
| WebAssembly (WASI) | 高但受限 | 极快 | 低 | 纯静态/前端项目子集 |

**决策**：v1 用 gVisor，池化预热解决冷启动延迟；v2 迁移 Firecracker。

### 5.2 预览URL策略

每个沙箱分配子路径 `/preview/{sandboxId}/`，不分配独立域名（避免 DNS 延迟）。优先级反向代理：
```
Nginx/Caddy → /preview/{id}/* → sandbox_ip:3000
```

发布后的 Publish URL 是另一套部署管道（CDN 分发静态资源 + Serverless 函数）。

### 5.3 SSE vs WebSocket

选 **SSE**：智能体输出是单向流，SSE 足够；更容易穿透反向代理和 CDN；HTTP/2 下多路复用。
用户输入（消息发送）走普通 HTTP POST；只有日志/token 流走 SSE。

### 5.4 Race 模式并发控制

```
Race 任务提交
     ↓
同时创建 N 个 build_tasks，status='pending'
     ↓
N 个 sandbox 并行启动
     ↓
前端 UI：N 列并排，各列独立流式日志
     ↓
用户选定其中一列（或让 Agent 根据预设标准择优）
     ↓
selected task → status='accepted'，version snapshot 正常保存
other tasks  → status='discarded'，snapshot 标记 TTL=24h 后 GC
```

### 5.5 版本回滚 + 数据库迁移

对 Atoms "接入自研 Cloud 后禁用历史版本"问题的技术解法：

```
版本 V3（当前）: schema migrations [m1, m2, m3], code snapshot S3
版本 V2:         schema migrations [m1, m2],    code snapshot S2
版本 V1:         schema migrations [m1],         code snapshot S1

回滚 V3 → V2:
  1. 执行 down migration m3（从 DB 中取 m3.down SQL）
  2. 将项目 active_version_id 指向 V2
  3. 重新部署 S2 的代码
```

约束：每个 migration 必须有 up/down，CI 验证 down 可逆性。复杂 down migration（如 DROP COLUMN）会生成警告，要求用户确认数据可能丢失。

---

## 6. 安全架构

### 6.1 沙箱安全边界

```
┌── 宿主机（Kubernetes Node）
│   ├── Node-level seccomp + AppArmor 基础防护
│   │
│   └── gVisor 沙箱（每个任务）
│       ├── 独立 Network Namespace（出站白名单：npm/pypi/CDN/用户配置的 API）
│       ├── 独立 PID Namespace
│       ├── 只读根 FS + 可写 overlay（任务结束销毁）
│       ├── CPU/Memory cgroup 硬限
│       └── 禁用 ptrace / mount / mknod / perf_event
```

出站白名单实现：iptables + DNS RPZ（仅解析白名单域名），阻止 SSRF 攻击宿主机元数据服务。

### 6.2 密钥生命周期

```
Secret 创建:  客户端 ECDH 协商 → AES-GCM 加密传输 → Vault 服务端再加密（KMS）
Secret 使用:  Runner 从 Vault 获取明文 → 注入沙箱环境变量 → 沙箱内可用
Secret 泄漏防护:
  - 对话输入正则检测（客户端）
  - LLM context 构建时 Secret 值替换为 {{SECRET_NAME}} 占位符
  - 日志管道 regex 脱敏（覆盖 50+ 常见格式）
  - Vault 访问日志记录"使用了哪个 key"，不记录值
Secret 删除:  Vault 软删 → 24h 后硬删 + KMS key rotation
```

### 6.3 发布前安全扫描

```typescript
// 伪代码：发布前扫描管道
interface ScanResult {
  type: 'secret' | 'pii' | 'dependency_vulnerability'
  severity: 'critical' | 'high' | 'medium'
  location: { file: string; line: number }
  description: string
}

async function preScanBeforePublish(snapshotKey: string): Promise<ScanResult[]> {
  // 1. gitleaks 风格的密钥检测（50+ regex 规则）
  const secretResults = await secretScanner.scan(snapshotKey)
  // 2. 聊天历史中的敏感词检测（API key 格式、个人邮件/电话等 PII）
  const chatResults = await chatScanner.scanHistory(sessionId)
  // 3. 依赖漏洞（npm audit）
  const depResults = await depScanner.audit(snapshotKey)
  return [...secretResults, ...chatResults, ...depResults]
}
```

Critical/High 级别结果 **阻断** 发布流程，强制用户逐条确认；Medium 给出警告但允许继续。

---

## 7. 帮助中心系统

帮助中心本身是一个需要独立开发的子系统，技术方案参照 Atoms 逆向工程结论：

### 7.1 架构

```
Content Pipeline:
  Markdown files (Git-managed) → MDX compiler → JSON articles → CMS API

Help Center Web (Next.js App Router):
  /[locale]/                        → 首页（搜索 + 分类导航）
  /[locale]/articles/[slug]         → 文章页（ToC + AccordionGroup + 相关文章）
  /[locale]/changelog               → 更新日志

Search:
  Typesense (self-hosted) 全文搜索 + 权重配置

AI Assistant (RAG):
  文章内容 → Embedding → Vector DB (pgvector) → 检索 top-k → LLM 生成回答
```

### 7.2 多语言策略

- 内容标识（slug）跨语言共享，如 `/en/articles/quick-start` 与 `/zh/articles/quick-start`
- 机器翻译（DeepL / GPT）作为初稿 → 人工审校关键页面
- i18n 字符串（UI 文案）与内容（文章正文）分离管理

### 7.3 更新日志格式

```markdown
## 2026-09-01

### New Features
- **Feature name**: Description. (link to doc)

### Improvements
- Description.

### Bug Fixes
- Description.
```

---

## 8. 连接器架构（第三方集成）

### 8.1 连接器注册表

```
connector-registry/
  linear/
    manifest.json   # name, auth_type, scopes, mcp_server_url
    icon.svg
  asana/
    manifest.json
  stripe/
    manifest.json
  supabase/
    manifest.json
  github/
    manifest.json
```

每个连接器声明：OAuth 参数、所需 scope、MCP server 地址（或内置实现）、支持的 agent handles。

### 8.2 连接流程（统一 OAuth）

```
用户点"Connect" →
  1. 后端生成 state token（防 CSRF）
  2. 重定向到外部服务 OAuth 授权页
  3. 回调：交换 access_token → 加密存 Vault
  4. 连接器状态更新为 "connected"
  5. Orchestrator 将该连接器的工具注入对应 agent 的工具白名单

智能体使用连接器：
  @lead: "Create a Linear issue from this bug report"
         → Orchestrator 查询 workspace_connectors → Linear connected ✅
         → 调用 linear.createIssue(agentContext, params)
         → Linear MCP Server 处理 → 结果返回 → 展示给用户
```

### 8.3 Stripe 集成改进方案

用 Stripe Connect 代替手工拷贝 4 类凭据的方式：

```
用户点"Connect Stripe" →
  Stripe OAuth → 获取 platform access_token + account_id
     ↓
  智能体问："请选择你要销售的产品和价格"
     ↓
  列出 Stripe Dashboard 中的 Products（通过 Stripe API 拉取）
     ↓
  用户选择 → 智能体自动生成支付代码（无需用户手工填 Price ID）
     ↓
  智能体调用 Stripe API 自动创建 Webhook Endpoint → 回填 URL
     ↓
  测试模式下提供测试链接；一键切换生产模式
```

---

## 9. 计费系统

### 9.1 Credits 扣减流程

```
用户提交任务
     ↓
Orchestrator 预估（context tokens + task_type → 预估 credits 区间）
     ↓
检查 workspace credits_balance ≥ min_estimate
     ↓ 不足 → 返回 INSUFFICIENT_CREDITS，前端展示充值/升级入口
     ↓ 充足 → 冻结 max_estimate 额度（乐观锁）
     ↓
任务执行
     ↓
实际消耗计算（按 LLM token 日志 + sandbox compute 分钟数）
     ↓
写入 credit_transactions（type='usage', amount=负数）
释放冻结 - 实际消耗 = 解冻差额返还
     ↓
前端展示：本次消耗 X credits，剩余 Y credits
```

### 9.2 钱包风控

```
每次消费后检查：
  IF balance < alert_threshold → 发送余额告警通知（邮件 + 站内）
  IF monthly_spend ≥ monthly_limit AND policy='pause' → 暂停该 workspace 所有应用
  IF monthly_spend ≥ monthly_limit AND policy='notify_only' → 发送超限通知，不暂停

暂停前：
  提前 24h 预警（预计何时触顶）
  提前 1h 最终警告
  暂停时项目页显著展示原因 + 一键充值 CTA
```

---

## 10. 部署架构

### 10.1 基础设施

```
Kubernetes (EKS / GKE)
├── Namespace: forge-web        (Next.js, 水平扩展 2-20 pods)
├── Namespace: forge-api        (API Gateway + 各 Service, 水平扩展)
├── Namespace: forge-runner     (沙箱调度器 + gVisor 节点池, 专用 node group)
├── Namespace: forge-baas       (BaaS API, Deno Deploy edge 函数)
└── Namespace: forge-infra      (PostgreSQL / Redis / MinIO / Vault / Typesense)

CDN (CloudFront / Cloudflare)
├── 静态资产 (/_next/static/*)
├── 用户项目 published 站点 (*.forge.world / custom domains)
└── 帮助中心 (help.forge.world)
```

### 10.2 CI/CD

```
PR → GitHub Actions:
  lint → typecheck → unit tests → integration tests (sandbox smoke) → preview deploy

Merge to main → 蓝绿部署:
  build image → push registry → deploy to staging → smoke tests → 切流量到新版本
  旧版本保留 30 分钟 → 无报警则销毁（有报警则一键回滚）
```

### 10.3 可观测性

- **Metrics**：Prometheus + Grafana；核心看板：构建成功率、P50/P95 构建时长、沙箱池利用率、LLM 调用延迟、Credits 消耗速率
- **Traces**：OpenTelemetry → Jaeger；每个 session/build_task 作为 trace root
- **Logs**：结构化 JSON → Loki；敏感字段（密钥值、用户内容）在采集端脱敏
- **Alerts**：构建失败率 > 5% in 5min、P95 构建时长 > 180s、sandbox 池 < 2 warm containers

---

## 11. 关键数据流：从自然语言到可预览 Web App

```
1. 用户输入:"帮我做一个可以记录每日心情的 Web App，能登录，数据要持久化"

2. Chat Service 存储消息 → 推送到 Orchestration Service

3. Intent Parser (LLM call ~200ms):
   → intent: build_app
   → requires_auth: true
   → requires_persistence: true
   → @mentions: []  (未指定，由 Mike 分派)

4. Task Planner 生成 DAG:
   Task A (@pm):  需求分析、撰写 PRD 草稿
   Task B (@arch): 数据模型设计 (User, MoodEntry tables)
   Task C (@eng):  [blocked by A,B] 编码实现
   Task D (BaaS):  [blocked by B] 自动开通 DB + Auth

5. Parallel 执行 A 和 B:
   → A 结果: 功能列表与用户故事
   → B 结果: schema SQL

6. BaaS Service 执行 D (同步 B 完成):
   → 创建 moods 表 (migration m1)
   → 开通 Email Auth

7. Task C 获得 A+B+D 的上下文，@eng 开始编码:
   → Sandbox container 启动 (pool claim < 200ms)
   → 生成 React + Tailwind 代码，调用 Forge BaaS SDK
   → npm install → dev server 启动
   → Terminal 日志流式推给前端

8. App Viewer 展示预览:
   → 用户点击登录区域 → 弹属性面板改按钮颜色
   → 用户说"把标题字体改大一点" → @eng 接收并修改

9. 用户点 Publish:
   → 安全扫描 (无发现)
   → 静态 build → CDN 部署
   → 分配子域 abc123.forge.world
   → 版本快照 V1 落库 (含 schema migration m1)

总耗时目标: P50 < 3 分钟, P95 < 8 分钟
```

---

## 12. 与 Atoms 技术实现对比

| 方面 | Atoms（逆向观察） | Forge（本设计）|
|---|---|---|
| 前端框架 | Next.js App Router + RSC | 相同（验证技术选型合理） |
| 样式体系 | Tailwind + CSS 语义 token（如 `textNeutralWhite60`） | 相同体系，但 token 命名采用语义化角色而非位置描述 |
| 实时推送 | SSE（`self.__next_f.push` RSC 流） | SSE，独立 `/stream` 端点 |
| 内容 CMS | 疑似从 Intercom 迁移 | Git-managed MDX，Typesense 搜索，pgvector RAG |
| 沙箱 | 已是容器环境（文档"不建议嵌套容器"） | gVisor，显式安全边界 |
| BaaS | 自研 Atoms Cloud + Supabase 可选 | 相同双轨，但迁移脚本随版本快照解决历史版本问题 |
| 密钥管理 | Edge Functions Secrets Manager，平台不可读 | 相同原则，增加前端输入拦截 |
| 版本 + BaaS | 接入 Cloud 后禁用历史版本 | 迁移脚本随版本快照，保留完整回滚 |
| Stripe 集成 | 手工拷贝 4 类凭据（15 张截图指引） | Stripe Connect OAuth，自动创建 Webhook |
| 品牌 | 大量 MGX 残留（DNS `_mgx_verify`、`support.mgx.dev`） | 从一开始统一品牌，无历史包袱 |
