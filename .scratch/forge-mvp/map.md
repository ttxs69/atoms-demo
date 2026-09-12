# Forge MVP — Wayfinding Map

`wayfinder:map`

## Destination

一个陌生人能公开访问、用自然语言生成并预览 Web 应用的核心闭环 —— 含账号与用量限制。

远期目标是完整可上线的多智能体 Vibe Coding 产品；本地图只走到上面那条闭环为止。

## Notes

- **仓库**：`/Users/sarace/dev/probe/atoms_demo`。不是 git 仓库、未配置 issue tracker，
  按 wayfinder 约定回落到 **local markdown tracker**（`.scratch/`）。
- **原料**（来自对 help.atoms.dev 全量 62 篇官方文档的逆向）：
  - `docs/01-atoms-core-features.md` — 核心功能总结
  - `docs/02-prd.md` — PRD（含 9 条与 Atoms 的差异化清单、5 个开放问题）
  - `docs/03-architecture.md` — 架构设计（含 4 处未决的技术选型）
  - `research/atoms-help-articles/` — 62 篇英文原文语料
- **时间盒**：一个周末
- **资源**：AI agent 写代码，LLM 预算不设限
- **每个 session 应加载的技能**：`/grilling`、`/domain-modeling`；问题落在"长什么样 / 怎么表现"时用 `/prototype`
- **技术栈基线**：TypeScript + React + Tailwind + shadcn/ui
- **术语表**：本 effort 的 `CONTEXT.md` 尚未建立，`/domain-modeling` 在术语首次定型时创建

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
- **资源**：AI agent 实现，LLM 预算不设限，时间盒一个周末
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

- [Orchestrator 接口](issues/06-orchestrator-interface.md) — **Mastra** 作为框架（其 `AgentNetwork`
  已 deprecated，官方改推 supervisor 模式，我们直接采用）；一个角色 = 一个 Agent 实例
  （instructions + tools 白名单 + model）；共享 message history 不做隔离；
  **并行按操作类别分区**：只读分析类自由并行，设计推理类（`@pm`/`@arch`）串行、保持两个角色不合并，
  写入单写者；冲突由 Mike 汇总后呈现两个意见并给出推荐，不自动裁决；
  **生成协议改用原生 tool call**（撤回 bolt.new XML 方案）；SSE 事件流带 `agentHandle` 分路

## Not yet specified

- **生成内容的滥用检测** —— 终点是"陌生人公开生成"，意味着有人会生成钓鱼页、挖矿脚本。
  检测放在生成时还是发布时？靠模型自查还是规则？目前还看不清该问什么。
  改用 E2B 后这件事**变重了**：代码在我们的机器上跑，滥用是我们的账单和我们的 IP 声誉
- **沙箱回收策略** —— E2B 的 paused 沙箱无 TTL、不自动删除，只有显式 `kill()` 才释放。
  Hobby 层 10 GiB 存储会被无限累积占满。什么条件下回收、回收前是否通知用户、
  用户如何取回工作成果 —— 等 MVP 范围裁剪定了留存承诺再具体化
- **出站控制与资源配额** —— 风险回到平台侧后重新出现。E2B 支持 per-sandbox egress 控制，
  但要控到什么程度取决于滥用检测的结论
- 自定义域名是否纳入本地图
- LLM 账单的成本归因与防刷机制（与「平台账号与用量限制」有重叠，等那张票落地后再看是否需要独立成票）
- 生成的代码如何交付给用户（下载 zip / 接 GitHub / 留在平台）
- **只读并行的并发上限** —— 只读 agent 不占沙箱，受限的是 LLM API rate limit 而非 E2B 的 20 并发。
  这个数字要等实测，现在填不出来
- **supervisor 的分歧检测如何实现** —— 靠 prompt 让 Mike 自己判断，还是需要结构化输出？
  目前还看不清该问什么
- 帮助文档与 onboarding 是否要做
- 多语言
- 功能发现路径：用户怎么知道可以要什么

## Out of scope

本地图的终点是"闭环 + 账号 + 用量限制"，以下均在其之外（Q6 已裁决）。

- 计费与订阅体系
- Race 模式（token 黑洞，Atoms 自己限定给最高档付费用户）
- 联盟推广、广告投放、GA4 分析、SEO 模块
- 团队协作与角色权限
- 自研 BaaS
- 原生 iOS / Android / 桌面应用
