# 02 — WebContainer 商业化许可与成本

Type: research
Status: resolved
Blocked by: —

## Question

终点要求"一个**陌生人**能公开访问"，这构成商业用途。需要弄清许可边界。

具体要回答：

- 免费层与付费层的分界在哪？原型 / 个人项目 / 商业项目的官方定义分别是什么？
- 对外运营的 Demo 或产品是否需要商业 license？判定标准是"收费"还是"公开访问"？
- 定价模型：按域名？按 MAU？按实例？大概量级是多少？
- license 申请流程与周期
- 是否存在自托管 / 开源的替代实现（若许可不可接受时的退路）
- 许可是否限制修改 WebContainer 源码、是否要求署名 / 商标展示

同时对比托管沙箱（E2B、Vercel Sandbox、Daytona、Modal）的定价与隔离模型，
作为"WebContainer 许可不可接受"时的备选。

## Answer

Resolved 2026-09-12. Sources: webcontainers.io/enterprise, stackblitz.com/terms-of-service,
e2b.dev/pricing, e2b.dev/enterprise.

**This resolution triggers a new decision: Q5 (sandbox strategy) must be revisited.**

WebContainer requires a commercial license for "production usage in a commercial, for-profit setting"
where you are "meeting the needs of your customers, prospective customers, and/or employees"
(webcontainers.io/enterprise, direct quote). Our destination — a stranger publicly accesses and
generates — squarely meets this definition. License pricing is NOT public (contact sales only),
meaning it cannot be obtained within a one-weekend timeframe.

StackBlitz Terms of Service confirms: without Teams/Enterprise plan, the license is "limited to
personal use and not for resale or further distribution."

WebContainer has no self-hosted fallback: the runtime depends on StackBlitz-hosted proxies
(confirmed from npm page).

E2B (Firecracker microVM, server-side) has fully public pricing: Hobby tier is $0/month with
$100 one-time credits (~600 sandbox-hours at default 2vCPU/4GiB spec), no credit card required,
20 concurrent sandboxes, 1hr session max.

Three paths forward (see map for new decision ticket):
1. E2B — public pricing, instant signup, week-zero viable, risk moves back to server-side
2. WebContainer + stay in POC mode — doesn't satisfy "stranger publicly accesses"
3. WebContainer + parallel license negotiation — possible but not guaranteed to close in one weekend

Full verified brief: `.scratch/forge-mvp/research/webcontainer-licensing-verified.md`