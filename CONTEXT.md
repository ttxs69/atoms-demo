# Forge — 领域词汇表（CONTEXT.md）

建立于 2026-09-12，wayfinding 收尾阶段。
每个术语只写**一句话定义**、**容易混淆的邻词**、以及**它为什么存在**。

---

## 产品层

### Forge
正在构建的这个平台本身。用户用来生成应用的地方。
**不是**生成出来的应用。

### Workspace（工作区）
**一个用户的一次生成项目**，连同它的文件、沙箱、对话历史、生成应用的数据库行。
一个用户可以有多个 workspace。
- 混淆邻词：**项目 / project** —— 在 E2B 和 Supabase 的语境里 "project" 指的是
  **平台方**的资源单元（Supabase 项目、E2B 沙箱模板），不是我们的 workspace。
  本仓库一律用 workspace，避免在两个含义间摆动。

### Agent 团队（agent team）
产品层对外的拟人化包装：Mike（负责人）/ Emma（产品经理）/ Alex（工程师）。
用户看到的是"一个团队在给我干活"。
- **术语分界**：agent 团队是**产品层包装**；底层是 **Mastra 的 supervisor + 若干 Agent 实例**，
  跑在同一个 Node 进程里。两者不是一一对应的多进程。
- 相关 ticket：06

### Preview（预览）
沙箱里跑着的开发服务器，通过 E2B 的公开 URL 暴露，在 Forge 界面里以 iframe 呈现。
- 相关 ticket：11（布局）/ 12（沙箱）

---

## 沙箱与执行层

### Sandbox（沙箱）
**E2B 提供的一个 Firecracker microVM**，是生成的应用实际运行的地方。
有 create / running / paused / killed 四个状态。
- **不是** "容器" 也不是 "namespace"——那些是 `docs/archive/03-architecture-v1.md` 旧设计的词，
  已废弃（ticket 12）。
- 关键属性：paused 状态**无限期保留、无 TTL、无自动删除**（ticket 13 的一手来源）

### Pause / Resume / Kill
沙箱的三个生命周期动作。
- **Pause**：保存文件系统**和内存**，计算计费停止。用户下次访问时 auto-resume。
- **Resume**：从 pause 的精确状态恢复；断开的东西（如正在跑的服务）需要客户端重连。
- **Kill**：终结状态，**不可恢复**，由 GC 触发。
- **易混淆点**：`connect()` 会**延长**沙箱寿命，不会重置它到默认值——
  想精确设置要用 `setTimeout()`。且旧版 SDK 的 `connect()` 会覆盖 `autoPause`
  导致沙箱被杀（已在 2026-05-15 修复，必须用最新 SDK）。相关 ticket：09 / 12

---

## 生成循环

### Skeleton-first（骨架先行）
**仅首轮生成**的时序：文件树先以灰色占位全部长出，然后 Alex 逐个填充。
后续迭代不再重复这个动作。
- 它解决的是"长时间无反馈"的焦虑，不是性能问题。相关 ticket：09

### Gate（门控）
**平台强制注入、agent 无法跳过**的检查点。目前有两道，都在数据库变更路径上：
1. RLS 模板注入
2. Supabase Security Advisor 扫描
- **关键区别**：门控失败**不自动重试**，必须用户确认后继续；
  这与构建失败（有界自修复循环可以重试）性质不同。
- 一手来源："adding policies doesn't remove grants"——只写策略不撤销 grant 的表仍不安全。
  相关 ticket：08 / 09

### 有界自修复循环（bounded self-repair loop）
构建/运行出错时，捕获错误 → 注入上下文 → 重试，**最多 N 次后放弃并报告**。
"有界"是关键词——不是无限重试。相关 ticket：10

### interrupted（中断标记）
用户主动停止生成时，已写入的文件**保留**，未完成的助手消息标记为 `interrupted`，
进入下一轮时作为已知状态。相关 ticket：09

### ForgeEvent
对话面板消费的 SSE 事件类型联合。
顶层类型只有：`agent_started` / `text_delta` / `tool_call_start` / `tool_input_delta` /
`tool_result` / `agent_done` / `error`。
- **不要往上加事件**：`plan_ready` / `gate_started` / `sandbox_state` 这三个
  高频瞬时进度事件走 Mastra `writer.custom({ transient: true })`，不持久化，
  也不进这个联合。相关 ticket：06

---

## 身份、额度与回收

### 匿名身份（anonymous identity）
Supabase Auth 的匿名登录用户。JWT 带 `is_anonymous: true`，
可通过邮箱 `updateUser()` **升级为永久账户**（身份 ID 不变）。
- 它是"不需要注册就能试"这个产品承诺的技术基础。相关 ticket：07 / 11
- **升级是唯一的保存路径**：匿名身份清缓存即丢，所以首次预览出现时
  主动弹"留个邮箱保住它"的邀请——不是埋在顶栏等人发现的按钮。
  （2026-09-13 决策：维持匿名制，触发点是身份 bug 而非概念问题）

### Credit（额度）
**对外**抽象成点数展示给用户的计量单位。
- **术语分界**：`Credit` 是**外部**概念；内部是 token 的**精确计量**。
  两者是抽象关系，不是同一个数的两个名字。
- **预扣 + 结算**：生成前用数据库行锁 + 幂等键**原子预扣**，
  完成后按实际用量结算退差。相关 ticket：07

### GC（垃圾回收）
Forge **自己写**的跨系统回收组件。E2B 和 Supabase 都不替我们回收。
- **关键区分**：不是"存储满了会硬故障"，而是"资源无限累积、无回收路径的软腐化"。
  E2B 的 paused 沙箱保留期是 Unlimited，且官方明确**没有** auto-kill 配置项。
- 保留策略：匿名 workspace **30 天**无活动；沙箱**14 天**无访问。
- 载体：事件驱动 + Railway cron 兜底 + Postgres `deletion_queue` 两阶段状态机。
- **前置条件**：沙箱创建时必须打 `metadata: { workspace_id }`，
  否则 `Sandbox.list()` 无法定位沙箱。相关 ticket：12 / 13

### deletion_queue
Postgres 里的一张表，GC 的持久化工作队列。
每行是 `(workspace_id, target)`，target ∈ {sandbox, supabase_rows, forge_rows, auth_user}。
存在的理由是**幂等性**——外部 API 会失败，需要能区分"还没删"和"删了但没记录"。相关 ticket：13

---

## 持久化

### 事件日志（journal）
`project_events` 表里按回合折叠好的对话记录，一条消息一行，`seq` 为重放游标。
- **不是**原始事件流：`text_delta` 是线上编码，落库前已在服务端折叠成完整消息（docs/04 §3.2）。
- 为什么存在：刷新后重建对话的唯一真相；transient 事件按契约不落库。

### 快照（snapshot）
成功回合后写入 `project-snapshots` 桶的 `{ path → content }` JSON，按 **workspace id** 命名，latest-wins。
- **不是** zip 导出（那是给用户的下载物）；`project_files` 行是它的镜像 manifest（syncProjectFiles 同步，详情页读）。
- 为什么存在：沙箱死亡后的冷恢复真相；键与 deletion_queue 一致，GC 按行删对象（docs/04 §3.3）。

## 部署层

### 长驻单机（long-running single host）
Forge 的运行时形态：**Railway** 上的一个 Node 进程同时跑 Next.js 和 Mastra orchestrator，
外加一个 cron service 和一个 Postgres plugin。
- 为什么不是 Serverless：**SSE 继承函数时长限制**（Vercel Hobby 300s 硬上限、Pro 800s），
  一次完整生成链 1–3 分钟起，自修复重试后更长。相关 ticket：14
- **不是** k8s（旧设计），也不是多 service 微服务。

### 发布产物独立域（separate registered domain for published output）
若日后做发布，产物必须放在**独立注册域**下的子域（形如 `abc123.forge-app.com`），
不能放在 Forge 主域的路径下。
- **为什么**：cookie 作用域按注册域切分。同注册域下，恶意生成代码可以触达 Forge 会话。
  这是**硬安全约束**，不是偏好。相关 ticket：05 / 12

### Sb-Forwarded-For
Supabase 认识的一个请求头，用来在反向代理后面传递**真实访客 IP**。
- **必须配合 secret key 使用**，因此只能在服务端（Route Handler）设置。相关 ticket：07 / 14

---

## 状态与可见性

### 三层状态可见性
ticket 11 定下的三个显示层次，各有分工，**不要合并**：
1. 顶栏 pill —— 全局状态（生成中 / 运行中 / 需要确认）
2. 消息头部 pill —— 当前动作（"正在写 src/App.tsx"）
3. ACTIVITY 折叠区 —— 完整事件日志

第三层默认折叠：非技术用户不需要看日志，但需要**知道日志存在**（可展开 = 可验证）。

---

## 待固化（尚未有定论，写下来避免被当成已定）

- **滥用检测**：终点是陌生人公开生成，但目前不知道检测放在生成时还是发布时
- **出站控制与资源配额**：取决于滥用检测的结论
- **只读并行的并发上限**：受 LLM API rate limit 限制而非 E2B 并发，需实测
- **supervisor 的分歧检测**：靠 prompt 还是结构化输出，未定
