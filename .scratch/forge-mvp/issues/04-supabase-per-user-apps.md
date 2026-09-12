# 04 — Supabase 面向「每用户生成应用」的接入模式

Type: research
Status: resolved
Blocked by: —

## Question

Q8 裁定"生成的应用需要数据库和认证"。Atoms 的做法是 Supabase OAuth——
用户授权后平台代表他选项目、自动建表。需要弄清官方支持哪些模式及其限制。

具体要回答：

- **OAuth 模式**：Supabase 官方文档如何描述第三方应用代表用户操作其项目？
  有哪些 OAuth scope？平台能否读写用户的数据库、创建表、管理 Auth 用户？
  这与 Atoms 文档描述的流程（选组织 → Authorize → 选/建项目 → 自动抓取表与 RLS）是否吻合？
- OAuth 绑定是否强制 1:1（Atoms 文档提到 "organization has been bound by another user"）？
- **共享单项目 + RLS 多租户**：是否可行？如何按用户隔离数据？官方推荐做法？
- **Management API**：能否程序化创建项目 / 组织？配额限制？需要什么级别的 token？
- 免费层的项目数与暂停策略（Atoms 文档提到 7 天无活动自动暂停）
- 对"访客即时生成应用、不想注册任何账号"这个场景，哪种模式摩擦最小？
- anon key 暴露给浏览器是设计如此吗？RLS 是否是唯一防线？

注意区分：这是**生成的应用**的后端，不是平台自己的账号系统（后者见 ticket 07）。

## Answer

Resolved 2026-09-12. Source: supabase.com/docs/guides/integrations/supabase-for-platforms.

**Supabase has a dedicated 'for Platforms' pattern explicitly targeting "AI Builders and
frameworks needing a backend."** This is a first-party official capability.

Key facts from official docs:
- Platform can use its own Management API token to programmatically create projects in its own org
  via `POST /v1/projects`. New projects need health polling before use (`ACTIVE_HEALTHY`).
- New key model: `publishable` + `secret` keys (replacing anon/service_role). Publishable key
  is designed to be exposed in browser code; secret key must never reach the frontend.
- `POST /v1/projects/{ref}/database/migrations` auto-records migrations and rolls back on failure —
  this enables schema-with-version-snapshot (addressing PRD diff #1 about history versions).
- Project transfer: `GET /v1/oauth/authorize/project-claim` lets users later claim ownership
  of a platform-created project — "generate first, claim later" UX is officially supported.

For zero-friction anonymous visitors: platform-hosted shared project + RLS multi-tenancy has least
friction. User-owned OAuth projects require a Supabase account + org — too much friction for MVP.

Full verified brief: `.scratch/forge-mvp/research/supabase-per-user-apps-verified.md`