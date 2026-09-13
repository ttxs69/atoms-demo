# 04 — prompt 走向与真实端到端

**What to build:** Emma/Alex 的指令长出持久化路径：需要保存/登录的应用走迁移目录 + env 连 Supabase，玩具应用继续 localStorage。共享项目 provision 后跑真实 e2e：迁移、门控、双 workspace 隔离（A 的应用读不到 B 的行）。

**Blocked by:** 02 — 管线接线；03 — 生产 GatePort 与构建期 env 注入

**Status:** ready-for-agent

- [ ] Emma 规划区分持久化/本地两条路；持久化时计划含 supabase/migrations
- [ ] Alex 指令：持久化应用用 import.meta.env 连接，绝不硬编码、不写 secret
- [ ] 真实 e2e（待人工 provision）："做个能登录的笔记应用"全链路：迁移→门控→build→预览内登录→写数据→另一 workspace 读不到
- [ ] 门控失败 e2e：构造过宽策略 → 卡片文案与回滚实际一致
