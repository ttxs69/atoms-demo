# forge-gc — 资源回收：跨 E2B、共享 Supabase 与平台库的删除队列

Status: ready-for-agent
来源：`.scratch/forge-mvp/issues/13-resource-gc-policy.md`（wayfinder 决策票）
+ forge-accounts 的平台 Postgres（quota/credit_ledger）与 E2B metadata 打标
+ forge-app-backend 的共享项目 workspace_id 列（GC 的删行谓词）
+ 管理面板（failed 行的呈现面）
术语：`CONTEXT.md` 的 GC / deletion_queue / workspace 条目。

---

## Problem Statement

两个外购服务都不替 Forge 回收资源——这是贯穿整个 wayfinding 的跨系统模式：
E2B 的 paused 沙箱**无限期保留**（官方明确没有 auto-kill 配置项），
Supabase 的匿名用户**没有自动清理**（官方原话 "currently not available"）。

后果不是硬故障（磁盘配额是 per-sandbox 的，早前"池满即失效"的理解已在
wayfinder 里订正），而是**软腐化**：沙箱与匿名账户无限累积、没人知道
有多少、没人能清理——平台账单与数据面慢慢变成一片没人管得了的荒地。

用户视角的问题更直接：一个试用一次再没回来的人，他的沙箱和数据**永远**
占着位置；而他若 30 天后回来，体验应当是"重新生成"而不是面对一堆
无名尸体。

## Solution

Forge 自己写 GC，跨三个系统按依赖序清理：**事件驱动**（用户显式删除项目
→ 立即回收）+ **定时兜底**（每日扫描超龄）。所有删除进一张持久化的
`deletion_queue`（两阶段状态机：待办→完成/失败），幂等可重试，
失败行浮出到管理面板。

保留策略（wayfinder 已定）：
- **匿名身份 30 天无活动** → 整 workspace 清理
- **沙箱 14 天无访问** → kill（比身份短：回收代价是"可能要重新生成"，可接受）

"无活动"**从账本推导**：某身份最近一条 credit_ledger 行的时间。不建新表——
生成即活动，账本就是活动日志（实现票里把这个推导写成纯函数并测边界）。

## User Stories

### 定时兜底

1. 作为平台，我要每日扫描超龄的匿名身份与沙箱，这样软腐化不会无限累积
2. 作为平台，我要清理严格按依赖序进行（沙箱 → 共享项目行 → 平台行 → auth 用户最后），这样不会产生孤儿引用
3. 作为平台，我要每步删除幂等（kill 不存在的沙箱、删零行都不报错），这样重跑安全
4. 作为平台，我要失败的删除行指数退避重试、5 次后转 failed 并浮出，这样我不需要人肉盯
5. 作为平台，我要队列状态可查，这样"有多少待清、卡在哪"一眼可见

### 事件驱动

6. 作为用户，我删除项目时资源立即进入回收，这样不是等第二天的扫描
7. 作为用户，我删除后刷新看不到项目残留，这样删除是可信的

### 回访体验

8. 作为 30 天没来的匿名用户，我回来时被明确告知需要重新生成，这样不是面对坏掉的预览
9. 作为 14 天没来的用户，我的沙箱被回收但身份还在，这样额度与升级路径无损

### 面板

10. 作为管理员，我要在面板看到 failed 的队列行，这样卡住的清理有人跟进
11. 作为管理员，我要能手动重试 failed 行，这样瞬时故障不用等下一轮

## Implementation Decisions

### 队列表（平台 Postgres，与账本同库）

`deletion_queue(id, workspace_id, target, state, attempts, last_error,
next_retry_at, created_at, updated_at)`，`target ∈ {sandbox,
supabase_rows, forge_rows, auth_user}`，`state ∈ {pending, done, failed}`。
每 `(workspace_id, target)` 独立成行独立重试——**存在的理由是幂等**：
外部 API 会失败，必须能区分"还没删"与"删了没记录"。

### 清理顺序（依赖序，绝不变）

1. `sandbox` —— `kill(sandboxId)`（唯一释放外部资源的动作，最先）
2. `supabase_rows` —— 共享项目 `DELETE WHERE workspace_id = $1`
   （**不是 drop schema**：共享项目多租户，没有 per-app schema）
3. `forge_rows` —— 平台库该 workspace 的 quota/ledger 行
4. `auth_user` —— **最后**：平台项目的匿名用户删除（否则 RLS 引用的
   user_id 成孤儿外键意义上的悬空）

### 触发

- **事件驱动**：删除项目的路由直接按序入队四行（立即回收的入口）
- **cron 兜底**：每日扫描——匿名身份 30 天无账本活动 → 全量入队；
  沙箱 14 天无访问 → 仅入 sandbox 行。载体是长驻进程内的定时器
  （Railway 单机部署下与 web 同进程，ticket 14 的结论；不需要独立
  cron service——实现时若发现 Railway 的 cron service 更顺手，切换
  是纯部署配置，不动代码）
- 沙箱定位靠 `Sandbox.list({ metadata: { workspace_id } })`——
  这就是 ticket 02 起每个沙箱都打 metadata 的原因

### 删除器端口（注入，测试假体）

`Deleters { killSandbox(workspaceId), deleteSharedRows(workspaceId),
deleteForgeRows(workspaceId), deleteAuthUser(workspaceId) }`。
生产实现分别包 E2B SDK、共享项目 pg 连接、平台库 SQL、平台 Supabase
admin API。缺 key 的系统（如未 provision 共享项目）对应删除器为
显式 no-op 并在队列行注明——降级诚实。

### 引擎（纯决策 + 序）

`gcEngine.sweep(now)`：查超龄（纯函数：账本行 → 过期身份/沙箱清单）、
入队、按序执行 pending 行（含指数退避判断：`attempts < 5 且
next_retry_at ≤ now` 才执行）、失败计数与转 failed。一次 sweep 的
外部调用全部通过 Deleters 端口——**引擎不 import 任何外部 SDK**。

### 集成注意（写给实现者）

- orchestrator 的内存 `sandboxBySession` 在沙箱被 kill 后持有死 id：
  下次该会话的生成必须能自愈（resume 失败 → 重建沙箱）。实现票里加
  一条自愈路径与测试，这是 GC 与生成循环的唯一交汇点
- 30 天回访的"需要重新生成"文案挂在现有 blocked/错误路径上，
  不新开 UI 状态

## Testing Decisions

### 接缝（已与用户确认）

**GC 引擎 + pglite + 假删除器**。账本与队列表照常 pglite 真 PG 语义；
外部动作用注入的假 Deleters（记录调用序）。

断言外部行为：
- 超龄推导：30 天无账本行 → 身份过期；29 天 → 不过期（纯函数边界）
- 顺序：一次 sweep 里四类 target 按依赖序执行（假删除器录到的调用序）
- 幂等：同一 workspace 重复 sweep 不重复入队、done 行不再执行
- 失败：某删除器抛错 → 行退避计数 +1、next_retry_at 后移；5 次转
  failed；面板可查（复用 admin 聚合）
- kill 沙箱后该会话再生成 → 沙箱重建（orchestrator 自愈，接 seam A
  的既有 fake 沙箱模式）

### 不测

- E2B/Supabase API 本身（外部服务，生产实现薄包）
- 真 E2B kill（花钱且依赖 key 在场——留人工 e2e，先例同 Turnstile）

### Prior art

credits 套件（pglite 模式）、pipeline 套件（注入假体模式）、admin
聚合（面板读取）。

## Out of Scope

- **发布产物托管**的清理（发布本身 Out of scope）
- **平台自己的 Postgres 行的软删/归档**——直接删，Demo 规模无审计需求
- **回收的确认通知**（邮件/站内信）——无通知渠道，面板可见即可
- **手动指定保留期**（per-user 配置）——两个常量（30/14）走环境变量
- **用量统计/成本归因**——Supabase/E2B dashboard 覆盖

## Further Notes

### 切分参考（to-tickets）

1. 队列表 + 超龄推导纯函数 + 引擎 sweep（假删除器，核心闭环）
2. 生产删除器 + 事件驱动入口（删除项目路由）+ cron 定时器
3. orchestrator 自愈（死沙箱重建）+ 面板 failed 行呈现与手动重试
