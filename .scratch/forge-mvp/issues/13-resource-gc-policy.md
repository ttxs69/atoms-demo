# 13 — 资源 GC 策略

Type: grilling
Status: resolved
Blocked by: 07, 08

## Question

本 ticket 由 ticket 07（账号与用量限制）和 ticket 08（生成的应用如何取得后端）共同触发。
两个外购服务都不替我们回收资源，这已经被记录为一个跨系统的模式：

- **E2B**：paused 沙箱无 TTL、不自动删除，只有显式 `sandbox.kill()` 才释放
- **Supabase**：匿名用户无自动清理，只能手动跑 SQL 删除
  （官方明确：*"Automatic cleanup of anonymous users is currently not available"*）

因此 **GC 是 Forge 自己要写的组件，且它跨两个外部系统**。

待定的决策：保留策略、回收触发、清理顺序、幂等性与失败处理。

## Answer

Resolved 2026-09-12。

### 先修正一个问题陈述里的错误

本票的 Question 部分（以及 map 的对应条目）写着：

> *"E2B：Hobby 层 10 GiB 存储，满了就无法新建沙箱"*

**这与 E2B 官方文档不符**。`docs.e2b.dev/billing` 的 plan 表格：

| 项 | Hobby | Pro |
|---|---|---|
| **Disk size** | 10 GiB | Custom |
| **Paused sandbox retention** | **Unlimited** | Unlimited |
| Max continuous runtime | **1 hour** | 24 hours |
| Concurrent sandboxes | 20 | 1,100+ |
| Base price | $0/mo | $150/mo |

两处关键差异：

1. **`Disk size 10 GiB` 是单个沙箱的磁盘上限，不是账户级共享配额**。
   原表述把 per-sandbox 限制当成了 pooled quota
2. **`Paused sandbox retention: Unlimited`** —— 所有档位都是 unlimited。文档在
   Sandbox persistence 页重复强调：*"A paused sandbox is kept indefinitely. There is no
   time-to-live and no automatic deletion, and E2B never kills a paused sandbox on its own."*

**修正后的结论不是"不用做 GC"，而是"GC 的紧迫性来源变了"**：

- ❌ 旧理解：不做 GC → 存储配额被占满 → 新用户无法使用（**硬故障**）
- ✅ 实际：不做 GC → 沙箱无限累积 → 无人知道有多少、无人能清理（**软腐化**）

这个区别影响优先级判断，但不影响"必须做"——**因为 E2B 明确没有
"auto-kill after N days" 这个配置项**（文档原文：*"There is currently no configurable
'auto-kill after N days' option"*）。不自己写就没有回收路径。

⚠️ 一处保留：Hobby 的 `Disk size 10 GiB` 究竟是否另有账户级聚合配额，
文档没有明说。**实现时应在 console 的 usage tab 确认**——若确实有聚合上限，
GC 的优先级要提到最高。

### 保留策略

#### 匿名用户：30 天无活动

ticket 07 Q8 已定（b：清理从一开始就激活）。本票确定"无活动"的定义。

**定义为「最后一次经由该身份发起的 API 请求」**，实现上就是每次认证请求
更新 `workspaces.last_seen_at`。理由：

- 「最后一次生成」太窄——用户可能反复打开预览、浏览历史却不生成，
  这些是真实的活动信号
- 「最后一次打开预览」抓不到只读历史列表的用户
- 「最后一次 API 请求」是这三者里**唯一同时覆盖读写**的，且实现最简单
  （不需要在每个业务动作里显式埋点，认证中间件统一更新即可）

代价：一次孤立的 API 调用会刷新整个 workspace 的存活期。这在 30 天的尺度上
可以接受——真正的僵尸账户不会定期发请求。

#### 永久用户工作区：沙箱有独立于用户的 TTL

即使用户还在（他是永久用户），**空闲的沙箱也应该回收**。理由：

- paused 沙箱不占计算费（E2B 文档：*"There's no charge for paused or killed sandboxes"*）
  但占我们自己的账号资源与认知负担
- 用户回到一个已被回收的 workspace 时，ticket 09 已确认 **E2B auto-resume 是内置的**
  ——若沙箱还 paused 着，请求到达即唤醒
- 若沙箱已被 kill，退化为"需要重新生成"。这在 ticket 09 的 interrupted 语义里
  是一个已知分支，不是新问题

**沙箱 TTL：14 天无访问即 kill**。比用户的 30 天短——因为回收沙箱的代价是
"下次可能要重新生成"（用户可感知但不致命），而保留沙箱的代价是无限累积。

### 回收触发：(b) 事件驱动 + 定时兜底

**两者都要，分工明确**：

| 触发 | 职责 | 载体 |
|---|---|---|
| 事件驱动 | 用户显式删除项目 → 立即回收 | Next.js Route Handler |
| 定时兜底 | 超龄清理（用户 30 天 / 沙箱 14 天） | Railway cron service（ticket 14 已定） |

ticket 14 已确认 Railway 的 cron 是 first-class 概念，与 web service 共享
同一 project、同一套环境变量和私网——**这解决了"定时任务跑在哪"的问题**。

不选 (a) 纯定时：粒度粗，用户删了项目还要等最多 24 小时。
不选 (c) 仅手动：不可持续，且 ticket 07 已定清理第一版就真实运行。

### 清理顺序

原 Question 列出的顺序基本正确，但需要按 ticket 08 的共享 Supabase 架构修正：

| 顺序 | 动作 | 修正说明 |
|---|---|---|
| 1 | `sandbox.kill(sandboxId)` | **提到最前**——这是唯一停止外部资源占用的动作，先做 |
| 2 | 生成应用的 Supabase 数据行 | ticket 08 是**共享项目 + RLS**，所以是 `DELETE WHERE workspace_id`，**不是 drop schema** |
| 3 | Forge 自己的 Postgres 记录 | workspace / session / message / credit_transactions |
| 4 | Supabase auth 用户 | **最后**——否则 RLS 策略引用的 user_id 变成孤儿外键 |

与原顺序的两处差异：

- 原顺序把「生成应用的 Supabase schema」放第一位，但 ticket 08 已改为共享项目
  多租户，**没有 per-app schema 可删**。这是模式变更带来的连带修正
- 原顺序把沙箱放第二位，本票提到第一位——沙箱是唯一持续占用 E2B 账号资源的对象

### 幂等性与失败处理：两阶段状态机

外部 API 会失败（E2B 503、Supabase rate limit）。简单的"跑一遍脚本"不够，
因为无法区分"还没删"和"删了但没记录"。

**用 Postgres 表做持久化的删除队列**：

```
deletion_queue
  id             uuid pk
  workspace_id   uuid
  target         enum(sandbox, supabase_rows, forge_rows, auth_user)
  state          enum(pending, done, failed)
  attempts       int
  last_error     text
  next_retry_at  timestamptz
```

每个 `(workspace_id, target)` 是独立一行，独立重试。这样：

- **幂等**：每个 target 的删除动作本身是幂等的（`kill` 不存在的沙箱、
  `DELETE` 零行，都不报错），加上状态标记，重跑安全
- **可观测**：`failed` 且 `attempts > N` 的行就是需要人工介入的信号，
  正好可以接到 ticket 14 定的管理面板"最近错误"那一栏
- **可断点续传**：进程重启不会丢失进度

重试策略：指数退避，`attempts >= 5` 后转 `failed` 并停止自动重试
（避免对已挂掉的 E2B 无限重试）。

### 一个新增的实现约束：沙箱必须打 metadata

ticket 12 定了用 E2B，但没有规定**创建沙箱时要不要打标签**。本票发现了这个需求：

E2B 的 `Sandbox.list()` 支持按 metadata 键值对过滤，**过滤在服务端执行**：

```typescript
// 创建时
await Sandbox.create({ metadata: { workspace_id: ws.id } })

// GC 时：找到所有属于已知 workspace 的沙箱
const sandboxes = await Sandbox.list({
  metadata: { workspace_id: ws.id },
  state: ['paused', 'running'],
})
```

**没有 metadata 就只能列出账号下所有沙箱，无法区分哪些是 Forge 的、属于谁**。
所以 `metadata: { workspace_id }` 是 GC 能工作的前提，应该作为 ticket 12
的实现约束回填。

顺带：`Sandbox.list()` 也支持 `order` 和分页（默认/最大 100 per page），
规模不大时一次拉完即可。

### 证据

- <https://docs.e2b.dev/billing> — plan 表格：Disk size 10 GiB（per-sandbox）、
  Paused sandbox retention **Unlimited**、Max continuous runtime Hobby 1 hour /
  Pro 24 hours、并发 20 / 1100+
- <https://docs.e2b.dev/sandbox/persistence> — *"A paused sandbox is kept indefinitely.
  There is no time-to-live and no automatic deletion"*；
  *"There is currently no configurable 'auto-kill after N days' option"*；
  pause 拒服务时返回 503 `ServiceBusyError`，沙箱保持运行
- <https://docs.e2b.dev/sandbox/list> — `Sandbox.list()` 支持按 state / metadata /
  template / start-time 过滤，服务端执行；默认与最大 100 per page

### 下游影响

- **ticket 12 需回填**：E2B 沙箱创建时必须带 `metadata: { workspace_id }`，
  否则 GC 无法定位沙箱。这是 GC 的前置条件
- **map 的 Question 级错误已修正**：E2B Hobby 不是"10 GiB 池满即失效"，
  而是"无限累积、无自动回收"
- **ticket 07 的管理面板**：需要能看到 `deletion_queue` 里的 failed 行
- **ticket 14 的 cron service**：本票确认了它是 GC 定时兜底的载体
- **max continuous runtime 1 hour（Hobby）**：一次生成远低于此，但若未来出现
  长时间运行的用户进程（如常驻 dev server 被频繁访问而不 pause），
  可能撞上 1 小时上限。当前架构下沙箱在生成结束即 pause，不构成问题
