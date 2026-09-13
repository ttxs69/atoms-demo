# forge-app-backend — 生成应用的后端：数据库、登录与两道门控

Status: ready-for-agent
来源：`.scratch/forge-mvp/issues/08-generated-app-backend.md`（wayfinder 决策票）
+ core-loop 已落地的 `GatePort` 注入接缝与 `gating → gate_failed` 状态机边
+ forge-accounts 已确立的"平台自己的 Supabase 项目 ≠ 生成应用的共享项目"界碑
术语：`CONTEXT.md`。**两个 Supabase 项目**：平台项目（账号/额度，accounts 的）
和**共享项目**（本 spec：所有生成应用的数据，RLS 多租户隔离）。

---

## Problem Statement

用户说"做一个能记笔记的应用，要能登录、数据要保存"，Forge 现在只能给他一个
localStorage 应用——数据存在浏览器里，换设备就没、没法分享、谈不上"登录"。

Alex 也不是不能写数据库代码——问题是**谁替用户管数据库**：每用户开一个
Supabase 项目要分钟级 provision 还要求用户有账号（与"打开即用"相背）。
而且一旦生成的代码直接碰共享数据库，一段错误或恶意的 RLS 策略就可能
把**别人**的应用数据暴露出来——这不是模型写错代码的问题，是平台必须
**结构性杜绝**的事。

## Solution

需要持久化的应用自动获得后端：**平台共享的 Supabase 项目** + **RLS 多租户**
（每个 workspace 的行只能被该 workspace 的用户访问）。模型照常写迁移 SQL，
但**平台代为执行**——每条迁移都被强制注入平台模板（enable RLS、revoke、
workspace 隔离），agent 无法 opt-out；执行后 Security Advisor 扫描作第二道
门控。任何一道不过：已回滚、未暴露、停下等用户确认（呈现已由 core-loop
ticket 11 建好）。

生成的应用代码只拿到 **publishable key**（这本来就是它该出现在前端的形态），
应用内登录走共享项目的 auth；secret key **永远不进沙箱、不进生成代码**——
迁移由平台服务端执行，这比早先把 secret 放沙箱环境变量的设想更收紧了一档
（E2B 架构下平台可以直接代跑，没必要给沙箱提权）。

对用户而言：说一句"要能保存"，应用就真的能保存、能登录，且他知道——
因为界面明确告诉他——数据隔离是被平台保证的，不是模型自觉的。

## User Stories

### 触发与获得后端

1. 作为用户，我说"做个应用，数据要保存"，我想应用自动获得真数据库，这样我不需要知道数据库是什么
2. 作为用户，我说"要能登录"，我想应用自带登录功能，这样我的数据只有我能看
3. 作为用户，我的应用不需要保存数据时（一个小玩具），我想它继续用 localStorage，不为我用不到的东西付复杂度
4. 作为用户，我想知道我的应用是不是有后端（存云端还是存浏览器），这样我清楚数据在哪

### 迁移与门控

5. 作为用户，模型写的数据库改动经过平台强制安全模板，这样即使它写错也不会暴露我的数据
6. 作为用户，安全扫描不过时应用不会上线一个"看起来好了但实际不安全"的状态，这样我不会被假象欺骗
7. 作为用户，门控失败时我看到"已回滚、未对外暴露任何数据"，这样我知道失败是安全的
8. 作为用户，我选择"让 Alex 重写"后模型拿到失败原因，这样修复有方向
9. 作为用户，未通过门控的迁移不影响我已能跑的应用的其他部分（已写文件保留）

### 隔离

10. 作为用户，我的应用数据只有我的 workspace 能访问，这样别人生成的应用读不走
11. 作为用户，我的应用里登录的"我"（应用内身份）与其他应用用户互相隔离，这样共享项目不串数据
12. 作为平台，任何生成应用都不能绕过 workspace 隔离列与 RLS，这样共享项目成立

### 应用内登录

13. 作为生成应用的用户，我打开应用能注册/登录，这样我的数据跟我的账号走
14. 作为生成应用的用户，未登录时我看到受保护内容被挡住，这样"登录有用"是可感知的
15. 作为生成应用的用户，我退出后数据还在，这样登录不是一次性的

### 平台运维

16. 作为平台，共享项目是全局一次 provision 的，这样不随用户数线性膨胀
17. 作为平台，所有迁移都有审计记录（谁、何时、什么 SQL、过没过门），这样出事可追
18. 作为平台，应用的 Supabase 连接参数以构建期环境变量注入，这样 key 不落生成代码仓库

## Implementation Decisions

### 已就位的接缝（本 spec 直接落实现）

- **`GatePort`**：core-loop ticket 11 建的注入端口（`check(sandboxId) →
  ok | {code, detail}`），orchestrator 在 install 与 build 之间调用，
  `gate_failed` 终止且零重试、`gateFailedSessions` 注入重写上下文——
  全部已有测试锁住。本 spec 落**生产实现**
- 状态机的 `migrating` 状态此前未接；本 spec 把管线补成
  `install → migrating → gating → build`（ticket 11 时 gate 直接跟在 install 后）

### 迁移的发现与应用

- 模型把迁移写成项目里的 `supabase/migrations/*.sql`（Emma 的计划在
  需要持久化时列出该目录）
- **平台代跑**：路由端检测到迁移文件后，读出 SQL，在服务端以
  **secret key**（Supabase SQL/management API）对共享项目执行——
  secret key 不进沙箱、不进生成代码。执行包在事务里，门控不过即回滚
- 执行前对 SQL 做**模板注入**（纯函数，可测）：对每张新建表追加
  `workspace_id` 列（默认当前 workspace）、`ENABLE ROW LEVEL SECURITY`、
  `REVOKE ALL ... FROM anon/authenticated`、以及平台统一的
  `workspace_isolation` 策略——**模型写的策略只是追加，不能替代模板**
- 官方教训落实：*"adding policies doesn't remove grants"*——模板必须
  同时 revoke，只加策略不算数

### 第二道门：Security Advisor 扫描

- 迁移执行后调 Supabase 的 advisor API（linter 扫描），结果里出现
  严重级 finding → 门控失败（code = finding 规则号，detail = 表与策略名，
  正好填 ticket 11 已建的卡片）
- 已知坑（写进实现注意）：`supabase db advisors --local` 漏检
  `rls_disabled_in_public`（官方 issue #5868）——**线上 API 为准，本地
  CLI 不作为唯一依据**；另配一条自研检查（纯函数）：扫描最终 schema
  存在无 RLS 的表 → 直接失败，双保险

### 生成应用的连接与登录

- 注入方式：构建期 env（`VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY`、
  `VITE_WORKSPACE_ID`），由管线在 install 前写入沙箱环境——生成代码里
  `import.meta.env` 读，仓库里无明文 key
- 应用内登录：共享项目的 Supabase Auth（publishable key 面向前端是设计
  意图）；应用用户默认匿名登录（与平台同款模式），RLS 以
  `auth.uid() + workspace_id` 双键隔离
- Alex 的指令更新：需要持久化时写迁移目录 + 用 env 变量连 Supabase，
  不再写 localStorage——由 Emma 的规划决定走哪条路

### 环境变量（人工步骤，先例同 E2B/Turnstile）

共享项目 provision（一次性）：`APPS_SUPABASE_URL`、
`APPS_SUPABASE_PUBLISHABLE_KEY`、`APPS_SUPABASE_SECRET_KEY`。

## Testing Decisions

### 接缝（已与用户确认）

**A. orchestrator 既有接缝**——迁移发现 → `migrating` → `gating` → `build`
的接线与门控失败路径，全部假 GatePort + 假迁移文件（FakeSandbox 内存 fs
里放 SQL 文件即可），断言事件流与回滚语义。Prior art：ticket 11 的三个
gate 测试原样扩展。

**B. 纯函数**——模板注入器（给定模型 SQL → 注入后 SQL：workspace 列、
RLS enable、revoke、策略齐全且**不可被模型 SQL 移除**）与无 RLS 表
检测器。这是本 spec 安全主张的核心，断言逐条对着官方教训写。

**C. 真实端到端**——待共享项目 provision（人工步骤）后补：真迁移、真
advisor、真隔离验证（A workspace 的应用读不到 B 的行）。代码就位即测。

### 不测

- Supabase API 本身（外部服务）
- 生成应用的登录 UI（由模型生成，质量靠 prompt + 门控，不进测试）

## Out of Scope

- **发布产物托管**（独立注册域）——map 的 Out of scope，未动
- **每用户独立项目**——已被 wayfinder 否决（provision 分钟级 + 与打开即用相背）
- **计费/用量归因到生成应用**（apps 的数据库用量）——观测留给
  Supabase dashboard
- **schema 版本回滚**（down migration）——已随版本回滚一起砍
- **应用内 OAuth/邮箱验证流**——匿名登录够 MVP
- **滥用内容检测**——map 未决项，独立存在

## Further Notes

### 切分参考（to-tickets）

1. 模板注入器 + 无 RLS 检测器（纯函数，安全核心）
2. 管线接线：迁移发现 → migrating → 真门控调用（A 接缝）
3. 生产 GatePort（Supabase advisor + 执行回滚）+ env 注入
4. prompt 更新（Emma/Alex 的持久化路径）+ 真实 e2e（待项目）

### 风险提醒（写给实现者）

- 模板注入必须处理模型 SQL 的所有建表形态（`CREATE TABLE`、IF NOT
  EXISTS、schema 限定名）；宁可直接解析失败报错，不要静默漏注
- advisor API 的结果分级（error/warn）只拦 error；warn 进活动日志不拦
- 共享项目的连接数与迁移并发：迁移在管线里天然被单写者队列串行，
  不需要额外锁
