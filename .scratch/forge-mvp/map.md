# Forge MVP — Wayfinding Map

`wayfinder:map`

## Destination

一个陌生人能公开访问、用自然语言**生成、多轮修改**并预览 Web 应用的核心闭环 ——
含账号与用量限制，且生成的应用可用数据库与登录。

远期目标是完整可上线的多智能体 Vibe Coding 产品；本地图只走到上面那条闭环为止。

> 时间盒在「MVP 范围裁剪」中由 1 个周末修订为 3–5 个周末。
> 两处增补（多轮修改 + 应用后端）是 grilling 中明确保留的，代价是时间盒修订。

## Notes

- **仓库**：`/Users/sarace/dev/probe/atoms_demo`。不是 git 仓库、未配置 issue tracker，
  按 wayfinder 约定回落到 **local markdown tracker**（`.scratch/`）。
  ⚠️ 这里原文写着“不是 git 仓库”，但在 charting 之后建了：现在是 git 仓库，
  remote `git@github.com:ttxs69/atoms-demo.git`，工作在 `main` 上。
- **原料**（来自对 help.atoms.dev 全量 62 篇官方文档的逆向）：
  - `docs/01-atoms-core-features.md` — 核心功能总结
  - `docs/02-prd.md` — PRD（含 9 条与 Atoms 的差异化清单、5 个开放问题）
  - `docs/03-architecture.md` — 架构设计（含 4 处未决的技术选型）
  - `research/atoms-help-articles/` — 62 篇英文原文语料
- **时间盒**：3–5 个周末（2026-09-12 由「MVP 范围裁剪」修订，原估值在不知道 WebContainer
  license 问题、GC 须自建、schema 一致性约束之前定的）
- **资源**：AI agent 写代码，LLM 预算不设限
- **每个 session 应加载的技能**：`/grilling`、`/domain-modeling`；问题落在"长什么样 / 怎么表现"时用 `/prototype`
- **技术栈基线**：TypeScript + React + Tailwind + shadcn/ui
- **术语表**：`CONTEXT.md`（仓库根）已于 2026-09-12 建立——
  产品层 / 沙箱 / 生成循环 / 身份额度回收 / 部署 / 状态可见性六组的唯一定义源

### ⚠️ 派子 agent 时必须显式加载 extension

2026-09-12 的教训：`researcher` 子 agent 的 frontmatter 声明了 `web_search` / `source_check`
等工具名，但**声明工具名不等于加载注册它们的 extension**（`pi-subagents/docs/agents.md:410`）。
5 个子 agent 全部静默降级为无联网，产出了看起来完整但实为模型记忆的简报。

**修复**：派 subagent 时显式传 `extensions: ["npm:pi-web-access"]`。
未确认子 agent 实际调用过检索工具之前，不要采信其"研究"结论。

### Standing preferences

- 优先"从架构里删掉问题"而不是"防御问题"——但**必须核验该问题是否真被删掉，而非转移**
- 拟人化角色是产品层包装，不必然对应架构层多进程
- 交付物是**决策**，不是代码；动手写实现意味着已经走到地图边缘
- 一手来源优先。任何未经 `source_check` 的许可、定价、安全结论不得进入 `docs/`

## Settled before charting

这 8 条在 charting 前的 grilling 中已锁定。其中两条的**理由**已被后续研究证伪，
决策本身仍成立，但理由需要订正（见下方标注）。

- **终点形态**：远期是完整可上线产品；本地图收窄为可验收的闭环
- **范围边界**：核心闭环 + 后端（数据库 / 认证）
- **用途**：对外 Demo，须扛住陌生人的恶意输入
- **资源**：AI agent 实现，LLM 预算不设限，时间盒 3–5 个周末（已修订）
- **沙箱策略**：~~WebContainer~~ → **E2B**。
  原决策的两条腿都被研究打断（安全理由只有一半成立、商业 license 是公开对外的硬前提），
  已由「沙箱策略重新裁决」改判。
- **"可上线"定义**：闭环 + 账号 + 用量限制（**不含计费**）
- **多智能体**：~~先单 agent 多角色~~ → **部分并行现在就做**，按操作类别分区
  （已由「Orchestrator 接口」细化）。
  ⚠️ 原理由"Lovable 明确否决了多智能体"**是错的**（他们已上线 subagents，
  见「代码生成循环的业界做法」）。真正的依据是：并行的风险不在机制而在**合并写**——
  文件系统写入没有 base，丢失的写入是静默的；且推理同一设计的两个角色并行会制造假冲突。
- **后端归属**：生成的应用与平台本身都需要

## Decisions so far

- [WebContainer 能力边界](issues/01-webcontainer-capabilities.md) — Vite+React+Tailwind+shadcn/ui
  栈确认可跑（纯 JS 无 native addon）；native addon 一律禁用（sharp/bcrypt/better-sqlite3/Prisma 原生引擎）；
  宿主页面必须配 COOP/COEP 响应头（技术结论成立，但该沙箱方案已被「沙箱策略重新裁决」放弃，原因是许可而非技术）
- [WebContainer 商业化许可与成本](issues/02-webcontainer-licensing.md) — 对外公开运营需商业 license，
  判定标准是**服务对象**而非是否收钱；license 定价不公开、需洽谈，周末内无法闭合；
  无自托管退路。E2B 定价公开可即时用：Hobby $0/月 + $100 一次性额度 ≈ 600 沙箱小时
- [代码生成循环的业界做法](issues/03-codegen-loop-prior-art.md) — bolt.new 的
  `<boltArtifact>` / `<boltAction>` XML 协议开源可直接复用（整文件重写，非行级 diff）；
  上下文管理无 RAG，文件树 + 预算降级即可；**"Lovable 否决多智能体"是错的**，两家殊途同归
- [Supabase 面向「每用户生成应用」的接入模式](issues/04-supabase-per-user-apps.md) —
  官方有专门面向 "AI Builders" 的 Platforms 模式；平台可用自己的 org 程序化建项目；
  `publishable` key 前端暴露是设计意图、`secret` key 绝不可进前端；
  迁移 API 自动记录且失败回滚；支持用户事后"认领"项目
- [浏览器内执行不可信代码的威胁模型](issues/05-browser-untrusted-code-threat-model.md) —
  "问题从根上消失"只有一半成立：服务端执行风险确实消除，但风险**转移**给访客；
  预览跑在独立 origin 是关键的结构性保护；
  **硬约束：发布产物必须放独立域**，否则恶意生成代码可触达 Forge 会话

- [沙箱策略重新裁决](issues/12-sandbox-readjudication.md) — **改用 E2B**（Firecracker microVM，
  公开定价，Hobby $0/月 + $100 一次性额度 ≈ 600 沙箱小时，覆盖预期的个位数到几十人流量）；
  pause/resume 无限期保留工作区，解决「用户回来继续改」；
  **发布产物放独立注册域下的子域**（形如 `abc123.forge-app.com`），
  按注册域切断 cookie 作用域；威胁模型随之从访客侧回到平台侧

- [平台账号与用量限制](issues/07-accounts-and-usage-limits.md) — **「陌生人公开访问」 = 访问成果与生成能力都开放**；
  Supabase Auth 匿名登录作为身份锚点（JWT 带 `is_anonymous`，可升级为永久账户）；
  内部 token 精确计量 / 外部抽象点数展示；**预扣+结算必须数据库原子**（行锁 + 幂等键）；
  防刷三层：Supabase 自带 IP 限流 30/时 + Turnstile invisible + 额度按 `userId` 分桶；
  额度耗尽硬拦截并给出下一步；每日重置不累积；匿名用户 30 天无活动清理。
  情景约束：认证页必须动态渲染（Next.js 静态缓存安全隐患）；代理后面需 `Sb-Forwarded-For` + secret key

- [Orchestrator 接口](issues/06-orchestrator-interface.md) — **Mastra** 作为框架（其 `AgentNetwork`
  已 deprecated，官方改推 supervisor 模式，我们直接采用）；一个角色 = 一个 Agent 实例
  （instructions + tools 白名单 + model）；共享 message history 不做隔离；
  **并行按操作类别分区**：只读分析类自由并行，设计推理类（`@pm`/`@arch`）串行、保持两个角色不合并，
  写入单写者；冲突由 Mike 汇总后呈现两个意见并给出推荐，不自动裁决；
  **生成协议改用原生 tool call**（撤回 bolt.new XML 方案）；SSE 事件流带 `agentHandle` 分路。
  回填：`plan_ready` / `gate_started` / `sandbox_state` 三个额外事件用
  Mastra `writer.custom({ transient: true })` 实现，不扩展顶层 `ForgeEvent` 类型

- [生成的应用如何取得数据库与登录](issues/08-generated-app-backend.md) — **共享 Supabase 项目 + RLS 多租户**
  （每用户独立项目需 Supabase 账号 + 分钟级 provision，与“打开即用”相背）；
  E2B 沙箱封住了 WebContainer 留下的“无服务端”缺口：secret key 只活在沙箱环境变量里，不写文件；
  **两道强制安全门控**：平台注入 RLS 模板（agent 不可 opt-out）+ Security Advisor 扫描。
  关键认知（官方原文）：*“adding policies doesn't remove grants”*——只写策略不撤销 grant 的表仍不安全。
  已知 bug：`supabase db advisors --local` 漏掉 `rls_disabled_in_public`（issue #5868），不能当作唯一门控

- [生成循环的用户体验](issues/09-generation-loop-ux.md) — 框架：**骨架先行（仅首轮）**，
  文件树先以灰色占位长出再逐个填充；安全门控失败**不自动重试**（与构建失败性质不同）；
  中断保留已写文件且 partial message 标记 `interrupted`；第二轮修改跳过 install。
  **E2B auto-resume 是内置的**——请求到达时沙箱自动唤醒，不需写恢复逻辑。
  实现约束：必须用最新 E2B SDK（issue #875：`connect` 会覆盖 `autoPause` 导致沙箱被杀，已于 2026-05-15 修复）

- [对话 + 预览界面布局](issues/11-workspace-ui-layout.md) — **B 双栏分屏**为主形态（左对话右预览），
  吸收 A 的收起能力：生成早期预览收起，首个文件写入后展开（与骨架先行时序对齐）。
  移动端退化为对话单栏 + 预览全屏覆盖。三层状态可见性（顶栏 pill / 消息头 pill / ACTIVITY 折叠区）。
  空状态只放三个具体样例 + “不需要写代码，也不需要注册”——把已实现的事实当信任锚。
  **iframe 可嵌入性已验证**（curl 实测）：`*.e2b.app` 响应头 `access-control-allow-origin: *`，
  无 `X-Frame-Options`、无 CSP `frame-ancestors`；B 方案前提成立，实现时无需回退

- [MVP 范围裁剪](issues/10-mvp-scope-cut.md) — 路线 B；5 个决策：多轮迭代有/版本回滚无、
  不做发布、不做点选编辑、3 个角色（`@lead`+`@pm`+`@eng`）、应用后端有。
  输出 25 项必做功能清单；**时间盒由 1 个周末修订为 3–5 个周末**
  （原估值在不知道 license 问题、GC 须自建、schema 一致性约束之前定的）

- [部署形态与运行时架构](issues/14-deployment-runtime.md) — **Railway 长驻单机**
  （Next.js standalone + Mastra orchestrator 同进程 + cron service + Postgres plugin）。
  决定性依据：**Vercel Hobby 的 maxDuration 是 300s 硬上限、Pro 800s，且 SSE 继承该限制**——
  一次完整生成链 1–3 分钟起，自修复重试后更长，Serverless 撑不住；Vercel Workflows 仍 beta 无 GA 承诺。
  Railway 另有两个天然契合：cron 是 first-class（GC 的载体）、Postgres 同区（credits 行锁延迟低）。月成本 ~$15–20。
  **认证页不需要 `force-dynamic`**：Next.js 官方文档明确 `cookies()` 自动触发动态渲染，
  Supabase 的 `createServerClient` 本就读 cookies；要防的只有“既不读 cookies 又不应被缓存”的路由。
  平台密钥走 Railway 环境变量（进程级隔离即合理边界，Vault 是过度设计）；
  可观测性 = Railway 内置日志 + ticket 07 管理页加一栏最近错误，不引入 Sentry。
  **`docs/03-architecture.md` 大半已失效**（k8s / 自研 BaaS / WebContainer 三个前提都被推翻），实现时需重写

## Not yet specified

- **生成内容的滥用检测** —— 终点是"陌生人公开生成"，意味着有人会生成钓鱼页、挖矿脚本。
  检测放在生成时还是发布时？靠模型自查还是规则？目前还看不清该问什么。
  改用 E2B 后这件事**变重了**：代码在我们的机器上跑，滥用是我们的账单和我们的 IP 声誉
- ~~资源 GC 策略~~ —— 已在 ticket 13 中解决
  （匿名用户 30 天无活动清理；沙箱 14 天无访问 kill；事件驱动 + Railway cron 兜底；
  两阶段 deletion_queue 保幂等；沙箱创建时必须打 `metadata: { workspace_id }`）
- **出站控制与资源配额** —— 风险回到平台侧后重新出现。E2B 支持 per-sandbox egress 控制，
  但要控到什么程度取决于滥用检测的结论
- 自定义域名是否纳入本地图
- ~~LLM 账单的成本归因与防刷机制~~ —— 已在「平台账号与用量限制」中解决
  （数据库原子预扣+结算、幂等键、三层防刷）
- 生成的代码如何交付给用户（下载 zip / 接 GitHub / 留在平台）
- **只读并行的并发上限** —— 只读 agent 不占沙箱，受限的是 LLM API rate limit 而非 E2B 的 20 并发。
  这个数字要等实测，现在填不出来
- **supervisor 的分歧检测如何实现** —— 靠 prompt 让 Mike 自己判断，还是需要结构化输出？
  目前还看不清该问什么
- 帮助文档与 onboarding 是否要做
- 多语言
- 功能发现路径：用户怎么知道可以要什么

## Out of scope

本地图的终点是「闭环 + 账号 + 用量限制 + 应用后端」，以下均在其之外。

**由「MVP 范围裁剪」（Q1/Q3/Q4 降级选择）明确划出：**

- **版本回滚**（含 diff 视图与版本历史 UI）—— 多轮修改保留，回滚不做。
  根本原因：回滚要求 schema down-migration 可逆性验证，与生成应用后端合并后
  精确复现 Atoms 踩过的坑（接入 Cloud 后禁用历史版本）。
- **点选编辑 / App Viewer 属性面板** —— 纯自然语言修改已满足需求。
- **发布到永久子域** —— 架构决策已就位，实现推后；终点原文是「预览」。
- **五个未上场的角色**：`@arch`（Bob）、`@data`（David）、`@research`（Iris）、
  `@seo`（Sarah）、`@ads`（Adrian）—— 角色是声明式配置，随时可加。
- **GitHub 集成与导出**
- **自定义域名**

**charting 时已划出：**

- 计费与订阅体系
- Race 模式（token 黑洞，Atoms 自己限定给最高档付费用户）
- 联盟推广、广告投放、GA4 分析、SEO 模块
- 团队协作与角色权限
- 自研 BaaS
- 原生 iOS / Android / 桌面应用
