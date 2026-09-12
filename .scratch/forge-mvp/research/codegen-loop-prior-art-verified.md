# Research: 代码生成循环的业界做法 — Ticket 03（核验版）

> 本文替代 `research/codegen-loop-prior-art.md`（无工具版）。
> 来源：GitHub stackblitz/bolt.new 源码（`app/lib/runtime/message-parser.ts`、
> `types/actions.ts`）、bolt.new 官方文档 PR #11137、Lovable 官方博客。核验日期：2026-09-12。

## Summary

bolt.new 的生成循环有一个**可以直接照抄的结构化输出协议**：模型输出单个
`<boltArtifact>` 包裹块，内部是一串 `<boltAction type="file" filePath="...">` 与
`<boltAction type="shell">` 子节点，**每个 file action 携带该文件的完整新内容**（整文件重写，
不是行级 diff）。这个协议在开源代码库里有完整实现，可以直接复用。

**Lovable 的"否决多智能体"说法被证伪为过时信息。** 他们 2024/2025 年确实走过单 agent 路线，
但官方博客已发布《Introducing subagents》，明确说主 agent 现在会**创建 subagents 并行**做
研究、探索与检索。所以"Lovable 否决多智能体"这个前提是错的——两家最终都走向了多 agent，
差别只在编排风格：Lovable 是**主 agent 动态派生子 agent**，Atoms/Forge 是**预定义角色静态编排**。

## Findings

### 1. bolt.new 的 artifact 协议（开源代码直接证据）

**Claim:** bolt.new 的模型输出协议为 XML 风格包裹块：
- `<boltArtifact>` —— 整个响应一个，包裹所有动作
- `<boltAction type="file" filePath="...">` —— 文件写入，内含该文件**完整内容**
- `<boltAction type="shell">` —— 执行 shell 命令（npm install、启动 dev server）
- `<boltThinking>` —— 可选，动作之前的思考块

**Source:** [bolt.new `app/lib/runtime/message-parser.ts`](https://github.com/stackblitz/bolt.new/blob/main/app/lib/runtime/message-parser.ts)
源码中可直接读到解析器常量：
```ts
const ARTIFACT_TAG_OPEN = '<boltArtifact';
const ARTIFACT_TAG_CLOSE = '</boltArtifact>';
const ARTIFACT_ACTION_TAG_OPEN = '<boltAction';
```
以及类型定义 `ActionType, BoltAction, BoltActionData, FileAction, ShellAction`。
**Support:** direct evidence — 开源代码中的解析器与类型定义
**Confidence:** high

**对 Forge 的含义：** 这套协议已被生产验证、代码开源可读，是生成循环**可以直接采用的起点**，
不必从零设计输出格式。

### 2. 整文件重写 vs 增量 diff 的取舍

**Claim:** 新文件的默认策略是**整文件重写**，而非行级 diff。代价是 token 消耗更高、
大文件有截断风险；收益是模型无法产出语法上不合法的"半个补丁"。
**Source:** [bolt.new PR #11137 — agent architecture documentation](https://github.com/stackblitz/bolt.new/pull/11137)
（该 PR 系统性补上了 artifact / action / action state / WebContainer 的架构文档）
**Support:** interpretation — 从解析器实现与 PR 描述的架构推断设计意图
**Confidence:** medium

### 3. 上下文管理：无 RAG，靠文件树 + 全量注入的预算降级

**Claim:** bolt.new 的基础架构中**没有语义检索**。策略是：在 token 预算内注入全部文件内容；
超出预算后降级为"注入完整文件树（路径 + 大小）+ 仅当前请求涉及的文件注入完整内容"。
**Source:** [bolt.new PR #11137](https://github.com/stackblitz/bolt.new/pull/11137)、
[DeepWiki: stackblitz/bolt.new](https://deepwiki.com/stackblitz/bolt.new)
**Support:** interpretation — 从架构文档与其对 StreamingMessageParser / ActionRunner 的描述推断
**Confidence:** medium

**对 Forge 的含义：** 周末规模下**不要做 RAG**。文件树 + 预算降级已经够用，
且实现复杂度低一个数量级。

### 4. Lovable 的多智能体立场（官方博客，证伪原假设）

**Claim:** Lovable **没有**否决多智能体。其官方博客《Introducing subagents》明确宣布主 agent
会创建 subagents 并行工作，且明确说明部分工作路由到更便宜的模型以降低账单。

**Source:** [Introducing subagents: Lovable is now better at multitasking](https://lovable.dev/blog/subagents-in-lovable)
引文（页面 meta description 与正文）：
> *"Lovable can now create subagents to help it research, explore, and search your project in parallel. The result is faster builds, sharper answers on bigger projects, and often a lower bill since lighter work gets routed to cheaper models."*

**Support:** direct evidence — 官方博客
**Confidence:** high

**修正：** charting 时我提出的"Lovable 明确否决了复杂多智能体架构"是**过时信息**。
真实图景是两家殊途同归，差别在编排形态：

| | Lovable | Atoms / Forge |
|---|---|---|
| 子 agent 来源 | 主 agent **运行时动态派生** | **预定义角色**（Emma/Bob/Alex…） |
| 触发方式 | 主 agent 自主判断需要 | 用户 `@` 提及或 Mike 分派 |
| 面向的用户心智 | "一个聪明的工程师" | "一支有名字的团队" |
| 成本优化手段 | 轻活路由到便宜模型 | 模式切换（Solo/Team）控制激活角色数 |

这个对比对 ticket 06（Orchestrator 接口）是直接输入：**动态派生 vs 静态角色**是一个真实的设计岔路，
不是一条路已被否决。

### 5. 已知失败模式与缓解（部分为推断）

**Claim:** 结构性文件输出 + 有界重试是四家平台的共同收敛点。无约束的重试螺旋比干净失败更伤害体验。
**Source:** 综合 bolt.new 架构文档与公开工程文章
**Support:** inference — 未见单一权威来源把这一点写成明文结论
**Confidence:** medium

## Contradictions

**已解决一处：** charting 时的前提"Lovable 否决多智能体"与 Lovable 官方博客直接矛盾。
以官方博客为准，原前提作废。此前给用户的陈述需要更正。

## Missing evidence
- 各平台的**具体重试次数上限**与放弃信号（未见官方明文）
- Lovable subagents 的具体实现细节（是否有角色定义、上下文如何隔离）
- 幻觉包名的防护机制（是否有 registry 校验层）

## Sources kept
- https://github.com/stackblitz/bolt.new/blob/main/app/lib/runtime/message-parser.ts — artifact 协议源码（决定性）
- https://github.com/stackblitz/bolt.new/pull/11137 — agent 架构文档
- https://lovable.dev/blog/subagents-in-lovable — 证伪"否决多智能体"
- https://deepwiki.com/stackblitz/bolt.new — 架构概览

## Sources rejected
- 各类第三方"$85,000 经验教训"二手转述 — SEO 聚合站，非一手

## Next steps
ticket 06 应把 **"动态派生 subagent vs 预定义角色"** 作为核心决策项，
并直接以 bolt.new 的 artifact 协议作为输出格式的起点。
