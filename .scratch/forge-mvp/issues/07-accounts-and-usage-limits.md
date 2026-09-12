# 07 — 平台账号与用量限制

Type: grilling
Status: resolved
Blocked by: —

## Question

Q6 裁定"可上线"= 闭环 + 账号 + 用量限制（不含计费）。这一层要能防住滥用。

待定的决策：

- **账号体系**：自建 / Clerk / Supabase Auth / Auth.js？判定标准是"周末能落地"
  且"与已有的 Supabase 决策不冲突"。
- **限额的计量单位**：生成次数？token？会话时长？并发数？哪个对用户可解释、
  对平台可控？
- **执行位置**：LLM 调用是平台的账单，限额必须在服务端执行——具体拦在哪一层
  （API gateway / orchestrator / LLM gateway）？
- **防刷**：未登录能否试用？试用额度多大？如何防止批量注册刷额度
  （邮箱验证？设备指纹？IP 限流？turnstile？）？
- **额度用尽的表现**：硬拦截并提示？降级到更便宜的模型？排队？
- 一个真实约束：终点要求"**陌生人**能公开访问"。如果必须登录才能生成，
  还算"陌生人能公开访问"吗？——这个歧义需要裁决：是**访问成果**开放，
  还是**生成能力**开放？
- 是否需要管理员后台来看用量与封禁？

## Answer

Resolved 2026-09-12。

### 先解决那个歧义

「陌生人能公开访问」= **两者都开放**。Supabase 匿名登录让我们能在
**不要求事先注册**的前提下施加用量限制——访客打开即可生成，同时每个访客有可挂额度的身份锚点。

官方文档把我们这个用例写进了适用场景清单：
> *"Anonymous sign-ins can be used to build: ... **Full-feature demos without collecting
> personal information**. Temporary or throw-away accounts"*
> — <https://supabase.com/docs/guides/auth/auth-anonymous>

### 账号体系：Supabase Auth（Q1=a）

- `signInAnonymously()` 创建匿名用户，行为与永久用户相同（登出/清缓存/换设备后找不回）
- JWT 带 **`is_anonymous` 声明**，RLS 策略可据此区分权限——权限控制的实现点
- **可升级为永久用户**：邮箱走 `updateUser()`，OAuth 走 `linkIdentity()`
  （需在项目开启 manual linking）。升级时数据无缝保留

选它的理由不只是"少一个供应商"：**匿名→永久的升级路径**是本产品的核心体验
（试用后想保存），Supabase 原生支持，用 Clerk 要自己写身份合并逻辑。

⚠️ **架构约束（官方警告）**：
> *"The Supabase team has received reports of **user metadata being cached across unique
> anonymous users as a result of Next.js static page rendering**. For the best user
> experience, use dynamic page rendering."*

所有涉及认证的页面**必须动态渲染**，不能进入 Next.js 静态优化。
这是真实的安全隐患——静态渲染会把 A 访客的匿名会话缓存给 B 访客。

⚠️ **部署约束**：服务端在代理后面时，Supabase 看到的是代理 IP，
需要用 `Sb-Forwarded-For` 头转发真实 IP，且**该功能需要 secret API key**
（publishable/anon key 不支持）。不配置会导致所有访客共享同一个限流桶。

### 限额单位：内部 token 计量，对外抽象点数（Q2=d）

服务端按实际 token 消耗精确扣减，前端只展示抽象额度（"已用 30%"），不暴露 token 数字。

理由：目标用户是非技术人群，token 对他们不可解释。
而 Atoms 的反面教材是把 credits 规则做得过于透明——7 篇文档解释
daily/subscription/bonus 三类 × 结转规则 × 扣减顺序，反而制造理解负担
（且其文档内部还出现 15 vs 7.5 credits/天的自相矛盾，见 `docs/01-atoms-core-features.md`）。

**内部精确、外部抽象**是正确方向。这也是 ticket 06 里"`credits_used` 存自己的 Postgres 表"的落地形态。

### 限额执行：预扣 + 事后结算，且必须数据库原子（Q3=c + 调研修正）

问题的本质被 `tokengate` 的 README 说得最准：
> *"The core problem with rate-limiting LLM traffic is that **you don't know what a request
> costs until it finishes**. A prompt might generate 50 tokens or 5,000. Request-count limits
> don't protect your spend, and post-hoc token counting lets bursts blow through your budget
> before the meter catches up."*
> — <https://github.com/jackChallis/tokengate>（Apache-2.0）

采用 **two-phase accounting**：提交时按保守上界预扣，跑完按实际用量结算并退还差额。
这是唯一能同时满足"不中途断掉用户"和"并发下不超额"的方案。
（Atoms 的文档明确写了 credits 用完时生成可能失败——那是要避免的体验。）

**调研发现的实现陷阱**，这一条修正了原建议：
> *"**Not distributed** — state is in-process. For multi-replica services, run it per-replica
> with a divided budget, or put it in the one process that fronts the model."*

内存态计数器在多副本部署下失效。因此预扣**必须是数据库原子操作**：

```sql
BEGIN;
SELECT credits_balance FROM workspaces WHERE id = $1 FOR UPDATE;
-- 应用层判断 balance - frozen >= estimate
UPDATE workspaces SET credits_frozen = credits_frozen + $estimate WHERE id = $1;
INSERT INTO credit_transactions
  (workspace_id, type, amount, ref_id, idempotency_key)
VALUES ($1, 'reserve', -$estimate, $sessionId, $key);
COMMIT;
```

**幂等键是必需的**——用户重复点击、网络重试都会导致重复扣费。
行业共识同样指向"数据库事务 + 幂等键实现 exactly-once 扣减"。

### 防刷：匿名认证 + Turnstile + IP 限流（Q4=b）

Supabase 官方把防护列为强制建议而非可选项：
> *"Since anonymous users are stored in your database, bad actors can abuse the endpoint to
> increase your database size drastically. It is **strongly recommended** to enable invisible
> CAPTCHA or Cloudflare Turnstile to prevent abuse for anonymous sign-ins."*

**第一层：Supabase 自带 IP 限流**（无需我们写）
| 操作 | 维度 | 默认值 | 可配 |
|---|---|---|---|
| 匿名登录 | IP | 30 请求/小时 | ✅ |
| 注册/登录 | IP | 30 请求/5 分钟 | ✅ |
| Token 端点 | IP | 150 请求/5 分钟 | ✅ |

用 token bucket 算法。文档特别说明匿名登录是例外：
*"the bucket capacity matches the configured number of anonymous sign-ins per hour."*

**第二层：Cloudflare Turnstile**（invisible 模式，对真人零摩擦）
免费层覆盖"大多数生产应用"，**无限挑战次数（不限流量）**，
每 widget 10 个主机名，WCAG 2.2 AAA。我们只有一个主域，10 个够。
（通配符主机名需企业版——注意这与 ticket 12 的"发布产物用通配符子域"无关，
Turnstile 只挂在 Forge 主站的生成入口上。）

**第三层：额度按 `userId` 分桶**，匿名流量才回落到 IP。
这样家庭/办公室共用 IP 不会互相拖累。匿名身份给了我们可挂额度的锚点——
没有它，IP 限流是唯一手段，而 IP 很容易绕过。

### 额度耗尽：硬拦截 + 明确下一步（Q5=a）

不降级模型（用户会在不被告知的情况下得到更差产出，比明确拒绝更伤信任），
不排队（需要队列基础设施，周末不值）。

文案要做对：「用完」不等于「结束」，必须给出清晰的下一步——
"明天 0 点恢复"或升级入口。

### 额度重置：每日重置，不累积（Q7=a）

每天零点给固定额度，未使用部分**不累积**（否则攒额度批量刷的成本由我们承担）。
不累积这一点要写进 UI 文案，避免用户误期待。

理由：Atoms 已验证每日赠送模式可理解（15/天，月上限 25），
且它给了一句清晰话术。滚动窗口对用户是黑箱；项目制额度容易被开多项目绕过。

### 管理员后台：极简（Q6=b）

一个受保护路由，展示：当前活跃会话数、今日生成次数、被封禁的 IP/用户。
不做完整用量看板与额度手动调整（时间黑洞）。
Supabase dashboard + E2B dashboard 覆盖其余观测需求。

### 匿名用户数据保留：30 天（Q8=b）

匿名用户 30 天无活动即删除，连带其关联项目。

Supabase 明确不提供此能力：
> *"Automatic cleanup of anonymous users is currently not available"*

所以必须自己实现。**用户选择了从一开始就激活清理**，而非先写好不启用——
理由是自律：让保留承诺从第一天就是真实的，而不是一个将来才生效的意图。

### 一个跨系统的模式（值得单独记录）

**外购服务都不替我们回收资源**，这已经出现两次：
- E2B：paused 沙箱无 TTL、不自动删除，只有显式 `kill()` 才释放
- Supabase：匿名用户无自动清理，必须自己跑 SQL

因此 **GC 是 Forge 自己要写的组件，且它跨两个外部系统**。
已graduate 为独立 ticket：`13-resource-gc-policy.md`。

### 证据

- <https://supabase.com/docs/guides/auth/auth-anonymous> — 匿名登录能力、升级路径、
  防滥用建议、无自动清理、Next.js 静态渲染警告
- <https://supabase.com/docs/guides/auth/rate-limits> — 限流矩阵、token bucket、
  `Sb-Forwarded-For` 与 secret key 要求
- <https://developers.cloudflare.com/turnstile/plans/> — 免费层范围与限制
- <https://github.com/jackChallis/tokengate> — two-phase accounting 模式与
  "not distributed" 的实现陷阱

### 下游影响

- **ticket 10（MVP 范围裁剪）**：账号与限额的落地范围现已明确，可直接排期
- **ticket 13（资源 GC 策略）**：本票 graduate 出来的新 ticket
- `docs/03-architecture.md` 需补：认证页面必须动态渲染、`Sb-Forwarded-For` 配置
