# forge-accounts — 匿名身份、额度计量与防刷

Status: ready-for-agent
来源：`.scratch/forge-mvp/issues/07-accounts-and-usage-limits.md`（wayfinder 决策票）
+ `.scratch/forge-core-loop/` 落地后的真实代码（CreditsPort 两阶段接口、
blocked_credits 事件、UNMETERED_CREDITS 占位、无认证的 sessionId）
术语：`CONTEXT.md`。注意本文档里有两个 Supabase 项目：
**平台自己的**（Forge 的用户与额度，本 spec）和**生成应用共享的**
（forge-app-backend 的范围）。绝不混用。

---

## Problem Statement

一个陌生人打开 Forge，现在可以直接生成——**但"打开即用"目前等于"无身份无限用"**：
生成端点接受客户端自报的任意 sessionId，额度检查是个恒放行的占位符，
结算记录的是 0。一旦公开部署，LLM 和沙箱账单就是裸奔的，
而且没有任何办法区分两个访客、限制任何一个。

用户视角的问题则是反过来的：他不想注册就想试试，试得满意了想保住成果。
所以他需要的是**无感的身份**（打开就有、不填任何东西）、
**看得懂的额度**（"今天还能生成几次"而不是 token 数字）、
用完时**明确的下一步**（明天恢复 / 升级保存），以及试用后
**把匿名身份升级成永久账户**的路径。

## Solution

打开页面即**无感匿名登录**（Supabase anonymous sign-in，零表单零点击），
浏览器拿到 httpOnly 会话 cookie。看不见的 Cloudflare Turnstile
挡住脚本滥用。每次生成前，服务端在**平台自己的 Postgres** 里原子预扣
当日额度；跑完按**真实 token 用量**结算并退还差额。额度每日重置、
不累积，用完硬拦截并告知"明天 N 点恢复"——或去升级永久账户。
匿名身份可随时用邮箱升级，数据无缝保留。另有一个受 token 保护的
极简管理页：活跃会话数、今日生成次数、封禁列表。

生成端点不再信任客户端自报的 sessionId——身份来自会话 cookie 里的
Supabase 用户。

## User Stories

### 无感身份

1. 作为第一次打开 Forge 的人，我想什么都不填就获得一个身份，这样我能立刻开始生成
2. 作为试用中的访客，我想刷新页面后仍然是同一个身份，这样我的额度和工作区还在
3. 作为换了浏览器的访客，我接受匿名身份找不回来（这是匿名的代价，我理解）
4. 作为访客，我想知道界面不会突然要求我注册，这样试用中没有打断
5. 作为关心隐私的访客，我想知道匿名身份没有收集我的任何个人信息

### 额度可见与计量

6. 作为用户，我想看到今天还剩多少额度（抽象点数或次数），这样我知道能不能再生成
7. 作为用户，我想每次生成后看到剩余额度的变化，这样计量对我可信
8. 作为用户，我想中断的生成只按实际消耗结算，这样我没跑完的部分不算钱
9. 作为用户，我想额度用完时被明确告知"明天 N 点恢复"，而不是莫名其妙地失败
10. 作为用户，我想看到额度明天会重置且不累积，这样我不会误以为能攒额度
11. 作为用户，我只想看到点数，不想看到 token、模型名这类术语

### 防刷（系统视角，用户无感）

12. 作为平台，我要每个匿名身份有独立额度桶，这样刷子开小号也一桶一扣
13. 作为平台，我要预扣在数据库里原子完成（行锁 + 幂等键），这样并发提交不会穿透上限
14. 作为平台，我要重复提交（双击、网络重试）只扣一次，这样计量不出错账
15. 作为平台，我要匿名登录端点被 Turnstile 保护，这样脚本不能批量造号
16. 作为平台，我要 Supabase 自带 IP 限流生效（Sb-Forwarded-For 转发真实 IP），这样共享代理的限流桶不串
17. 作为平台，我要真实 token 用量被计量并进结算，这样"按量"是事实不是估计

### 升级为永久账户

18. 作为满意了的匿名用户，我想只填一个邮箱就升级成永久账户，这样我的工作区换设备也能找回
19. 作为升级中的用户，我想升级时额度、工作区、对话全部保留，这样升级没有代价
20. 作为升级完成的用户，我想看到身份状态的变化（匿名 → 已绑定邮箱），这样我知道升级成功了

### 管理面板

21. 作为平台管理员，我想一眼看到当前活跃会话数和今日生成次数，这样异常流量能被发现
22. 作为平台管理员，我想能封禁滥用的用户或 IP，这样攻击面可控
23. 作为平台管理员，我只想用单个 token 访问这个页面，这样不需要一套权限系统

### 边界

24. 作为用户，我想额度不足时连沙箱都不会被创建，这样一次被拦的请求没有副作用
25. 作为用户，我想生成端点拒绝没有会话的请求，这样别人不能冒用我的身份
26. 作为双开标签页的用户，我想同一身份的并发提交被串行计量，这样不会绕过分桶

## Implementation Decisions

### 已就位的接缝（core-loop 铺好的，本 spec 直接落实现）

- `CreditsPort`（两阶段）：`reserve(sessionId, estimate) → {ok, resetsAt?}`、
  `settle(sessionId, actual)`。orchestrator 已在**沙箱创建之前**预留、
  中断和成功路径都会结算、`blocked_credits` transient 已通到 UI 横幅
- 生成路由的 `UNMETERED_CREDITS` 占位实现整体替换
- 现有 `FakeCredits` 继续服务 orchestrator 套件不动

### 额度账本（平台自己的 Postgres，非任何 Supabase）

Railway Postgres plugin（`DATABASE_URL`，ticket 14 已定）。表结构语义：

- `quota(user_id, day, reserved, spent)`，主键 `(user_id, day)`——
  **按日分桶的行天然实现"每日重置不累积"**：新的一天是新行，旧行自然失效
- `credit_ledger(id, user_id, day, kind, amount, idempotency_key, created_at)`，
  `kind ∈ {reserve, settle, refund}`，`idempotency_key` 唯一约束
- 预扣原子性：事务内 `SELECT … FOR UPDATE` 该用户的当日行
  （不存在则先 `INSERT ON CONFLICT DO NOTHING`），校验
  `reserved + spent + estimate ≤ DAILY_CAP` 后更新；账本插入带
  幂等键，重复键命中即返回首次结果（exactly-once 扣减）
- 结算：`reserved -= estimate`、`spent += actual`、差额隐式退还
  （reserved 释放即额度回来）；中断路径 actual < estimate 同理
- `DAILY_CAP` 是环境变量（点数单位，不是 token——见下）

### 计量单位：内部 token，外部点数

- **内部**：模型流的真实 usage（输入 + 输出 token）进结算
- **外部**：`DAILY_CAP` 与 UI 展示都是抽象点数；换算规则
  （例如 1 点 = 10k token）是环境变量，代码里只有点数
- **token 计量的接口补全**（这是对 core-loop 契约的唯一扩展）：
  模型适配器从流的 finish 部分提取 usage，`ModelChunk` 增加
  `{ type: 'usage'; input: number; output: number }`；orchestrator
  按轮累计，`agent_done.creditsUsed` 与 `settle(actual)` 从此是真值
  （现在硬编码 0）。`FakeModel` 支持脚本化 usage

### 匿名身份：Supabase Auth（平台自己的项目）

- 页面加载时客户端静默 `signInAnonymously()`；服务端把会话设为
  httpOnly cookie
- **生成路由不再接受客户端 sessionId**：从会话 cookie 验出的
  Supabase user id 就是 sessionId（orchestrator 接缝签名不变，
  只是值的来源变了）
- 无会话 / 过期会话的请求 → 401
- 认证涉及的页面保持动态渲染：读 cookies 的路由天然动态
  （Next.js 官方语义，ticket 14 已核），页面级显式确认不进静态优化
- **Sb-Forwarded-For**：服务端持有的 Supabase 调用一律带
  `x-forwarded-for` 转发真实 IP，且用 secret key（该头 publishable
  key 不支持）——否则全部访客共享一个限流桶
- 升级：`updateUser({ email })`，匿名 → 永久数据无缝（Supabase 原生）；
  只做邮箱占位级验证（不发验证邮件也允许升级——Demo 规模的取舍，
  邮件服务是日后项）

### Turnstile：注入端口

- `CaptchaPort { verify(token: string): Promise<boolean> }`
- 生产实现调 Cloudflare siteverify（invisible widget、免费层不限次数）
- 匿名登录与生成提交两个入口都挂；token 由前端 widget 产出
- 测试注入恒真 fake；**site/secret key 需要人工从 Cloudflare 领取**
  （与 E2B key 同类的 `.env` 人工步骤）

### 管理面板：单 token 保护

- 环境变量 `ADMIN_TOKEN`；请求头携带即通过，无用户体系
- 展示：活跃会话数（近 N 分钟有事件的身份）、今日生成次数
  （当日 ledger 聚合）、封禁列表（读表）
- 封禁 = 表里一行 + 生成路由预留前检查；解封同页

### 明确不做（防刷的第三层之外）

不降级模型、不排队、不做按量计费、不做多设备匿名迁移
（匿名丢了就丢了——升级才是保存路径，这正是产品叙事）。

## Testing Decisions

### 两个接缝（已与用户确认）

**A. `CreditsPort`（既有接缝）——额度原子性。**
真 Postgres 语义用 **pglite**（@electric-sql/pglite，WASM 编译的真 PG）：
同一套 SQL，测试内存态每例新建实例，毫秒级；生产同 SQL 跑 Railway。

断言外部行为：
- 当日首次预留成功；累计到上限后 reserve 拒绝且带 resetsAt
- 相同幂等键重复预留只扣一次，返回首次结果
- settle 释放 reserved、累计 spent；中断（actual=0）全额退还
- 跨日：新的一天新行，旧额度不带入（不累积）
- 结算后额度立即回补（退还差额可再用于下一次 reserve）

**关于并发的诚实边界**：pglite 是单连接，无法真并发。行锁的正确性
由 `FOR UPDATE` 的 SQL 语义保证；测试用两个顺序事务 + 中间状态
断言模拟交错序列（事务一预留未结算时事务二的上限校验行为）。
真并发留给生产观测，不在测试里假装覆盖。

**B. 生成路由处理函数（新接缝，最高处可用）。**
Next 路由处理函数是普通导出函数——直接以 `Request` 调用，无需服务器：
- 无会话 cookie → 401，orchestrator 不被触达（fake 计数验证）
- 有效会话 → 以 cookie 中的 user id 作为 sessionId 透传
- 请求体里就算带了 sessionId 也被忽略（身份只认 cookie）

### Prior art

`test/pipeline.test.ts` 的 seam 风格（外部行为断言 + 全 fake 注入）；
`FakeCredits` 的既有断言模式；`GatePort` 注入的先例（forge-app-backend 同法）。

### 不测

- Turnstile 的真实 siteverify（外部服务；端口注入 + 恒真 fake）
- Supabase Auth 的匿名登录本身（外部服务；路由只测 cookie 验签分支，
  验签函数以 fake secret 可测）
- 管理面板 UI（读表聚合的逻辑以纯函数测）

## Out of Scope

- **计费/付费/订阅**——"可上线定义"明确不含
- **匿名内容滥用检测**（map 未决项，独立于身份额度）
- **30 天匿名清理**——forge-gc 的范围（本 spec 的 `last_seen_at`
  列为它留好数据）
- **生成应用的用户系统**——forge-app-backend（共享 Supabase 项目）
- **邮件验证流转、发信供应商**——升级先占位级验证
- **多因素、OAuth 登录**——升级只走邮箱
- 暗色模式、多语言等界面项

## Further Notes

### 人工步骤（.env，与 E2B key 同类）

`SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SECRET_KEY`
（平台自己的项目——需要先在 Supabase 建它，与生成应用的共享项目无关）、
`TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY`（Cloudflare 领取）、
`ADMIN_TOKEN`（自生成）、`DAILY_CAP`、`POINTS_PER_10K_TOKENS`、
`DATABASE_URL`（Railway 自动注入）。

### 实现顺序建议（to-tickets 的切分参考）

1. 账本 + PostgresCreditsPort（纯后端，接缝 A 全覆盖）
2. token 计量贯通（usage chunk → 累计 → settle 真值）
3. 匿名会话 + 路由换血（接缝 B；Turnstile 端口同票）
4. 升级 + 管理面板（薄）
