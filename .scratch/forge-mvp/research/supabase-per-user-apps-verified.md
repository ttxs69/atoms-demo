# Research: Supabase 面向「每用户生成应用」的接入模式 — Ticket 04（核验版）

> 本文替代 `research/supabase-per-user-apps.md`（无工具版）。
> 来源：Supabase 官方文档（supabase.com/docs）。核验日期：2026-09-12。

## Summary

Supabase 官方文档明确描述了两种 Forge 可用的模式，并且提供了一个意外好用的第三条路。
对"零注册的匿名访客"这个场景，摩擦最小的是**平台托管单个 Supabase 项目 + RLS 多租户隔离**，
anon key 暴露在前端是 Supabase 的设计意图，RLS 是唯一的数据隔离边界。
重要发现：Supabase 官方新增了"Supabase for Platforms"文档，
**专门面向"AI Builders 和需要后端的框架"**，提供 Management API 程序化创建项目的能力，
甚至支持后续把项目所有权转移给用户。这是比 Atoms 的 OAuth 模式更干净的一条路。

## Findings

### 1. "Supabase for Platforms"是官方 first-party 能力（直接证据）

**Claim:** Supabase 官方文档有一个专页"Supabase for Platforms"，
明确定位为"AI Builders and frameworks needing a backend"。
平台方可以用自己的 Management API token，程序化地在自己的组织下创建项目，
通过 `POST /v1/projects` 创建、`GET /v1/projects/{ref}/health` 确认就绪。
**Source:** [Supabase for Platforms | Supabase Docs](https://supabase.com/docs/guides/integrations/supabase-for-platforms)
引文：
> *"Supabase is commonly used as a platform by AI Builders and frameworks needing a backend. This document will guide you on best practices when using Supabase for your own platform and assumes that Supabase projects are in a Supabase organization that you own."*
**Support:** direct evidence
**Confidence:** high

**对 Forge 的含义：** 这是 ticket 08 的决策直接输入。我们不必要求用户有 Supabase 账号，
可以用自己的 org 给每个用户创建项目，或用一个共享项目+RLS。

### 2. Management API 关键端点（直接证据）

**Claim:** 以下端点已通过官方文档核实存在：
- `POST /v1/projects` — 创建项目
- `GET /v1/projects/available-regions` — 智能区域选择（americas/emea/apac）
- `GET /v1/projects/{ref}/health` — 检查服务就绪状态（须等 `ACTIVE_HEALTHY`）
- `GET /v1/projects/{ref}/api-keys` — 获取 publishable/secret key
- `POST /v1/projects/{ref}/api-keys` — 启用新式 key 体系（publishable + secret）
- `POST /v1/projects/{ref}/database/migrations` — 执行迁移（自动写入 supabase_migrations，失败回滚）
- `POST /v1/branches/{ref}/merge` — 合并 dev branch 到 production

**Source:** [Supabase for Platforms | Supabase Docs](https://supabase.com/docs/guides/integrations/supabase-for-platforms)
**Support:** direct evidence
**Confidence:** high

### 3. API Key 新模型：publishable + secret（直接证据）

**Claim:** Supabase 已推出新式 key 体系，`publishable` key 取代旧的 `anon` key，
`secret` key 取代旧的 `service_role` key。
如果项目的 `/api-keys` 响应包含 `"publishable"` 和 `"secret"`，则使用新体系；
否则需要 `POST /v1/projects/{ref}/api-keys` 显式启用。
**Source:** 同上，"Recommended API keys"节
引文：
> *"If the response includes 'publishable' and 'secret' keys then you're all set and you should only use those from now on."*
**Support:** direct evidence
**Confidence:** high

**对安全设计的含义：** `publishable` key 放在前端是 Supabase 设计意图，
但 `secret` key 绝对不能出现在前端或任何生成的代码里——这对 ticket 08 的密钥处理流程有直接约束。

### 4. OAuth 模式的 scope 矩阵（直接证据）

**Claim:** Supabase OAuth app 的 scope 按 read/write 二维矩阵定义，
涵盖 Auth、Database、Domains、Edge Functions、Environment、Organizations、
Projects、Rest、Secrets、Storage、Realtime。
**Source:** [Scopes for your OAuth App | Supabase Docs](https://supabase.com/docs/guides/integrations/supabase-oauth-integration/oauth-scopes)
**Support:** direct evidence
**Confidence:** high

### 5. 项目所有权转移：用户可以"认领"平台创建的项目（直接证据）

**Claim:** Supabase 提供了 `GET /v1/oauth/authorize/project-claim` 端点，
允许平台把在自己 org 下创建的项目**转移**给用户自己的 Supabase org，
同时平台仍保留通过 OAuth integration 访问项目的权限。
**Source:** [Supabase for Platforms | Supabase Docs](https://supabase.com/docs/guides/integrations/supabase-for-platforms)，"Transferring a Project"节
引文：
> *"Your users may want to claim the project that currently lives in your org so that they can have more control over it. We've enabled transferring the project from your org to your user's org while you continue to retain access to interact with the project through an OAuth integration."*
**Support:** direct evidence
**Confidence:** high

**对 Forge 的含义：** 这实现了一条"先帮你建，以后你想要就认领"的用户路径，
既消除了初始注册摩擦（平台替用户建），又给高级用户提供了掌控路径。

### 6. 分支工作流（开发分支+合并）（直接证据）

**Claim:** 平台可以用 `POST /v1/projects/{ref}/branches` 在 dev 分支上做所有变更，
确认后 merge 到 production。分支可以视为"临时服务器"，出错可销毁重建。
合并只涉及数据库变更和 Edge Functions。
**Source:** [Supabase for Platforms](https://supabase.com/docs/guides/integrations/supabase-for-platforms)，"Creating a DEV branch"节
**Support:** direct evidence
**Confidence:** high

**对版本回滚的含义（inference）：** 这套 DEV branch + 迁移记录的机制，
可能是"不禁用历史版本"这个架构目标（PRD 差异化清单 #1）的 Supabase 侧实现路径。

### 7. anon key / publishable key 的安全模型（inference，需进一步核实）

**Claim（我的推断，非源文直接陈述）：** anon/publishable key 设计为可在前端暴露，
RLS 策略是数据隔离的唯一防线。Supabase Security Advisor API 
（`GET /v1/projects/{ref}/advisors/security`）可在合并到 production 前自动检查 RLS 策略。
**Source:** 分支工作流节提到"run the security advisor"，但 RLS = 唯一防线这一点是我的推断
**Support:** inference — 从 Supabase 整体设计读出，非单一原文直接声明
**Confidence:** medium（整体架构推断，需要实测验证 RLS 是否有旁路）

## Contradictions
None found in fetched sources.

## Missing evidence
- 免费层的具体项目数上限与 7 天无活动暂停策略（官方文档未在本次抓取中出现）
- Platform Kit（Supabase 提到的可嵌入 UI 组件集）的具体内容
- 共享单项目 + 多租户 RLS 方案的官方最佳实践（本次文档聚焦于"每用户一个项目"模式）

## Sources kept
- https://supabase.com/docs/guides/integrations/supabase-for-platforms — platform 模式全览（决定性）
- https://supabase.com/docs/guides/integrations/build-a-supabase-oauth-integration/oauth-scopes — scope 矩阵

## Next steps
ticket 08 现在可以直接用本文的结论做决策。
核心建议：MVP 用"平台托管单项目 + RLS 多租户"，
"用户认领项目"作为后续的高级选项，而不是 MVP 必须支持。
