# 02 — 生产删除器、删除入口与 cron 定时

**What to build:** Deleters 的生产实现（E2B kill by metadata / 共享项目 DELETE WHERE workspace_id / 平台库 SQL / Supabase admin 删用户），缺 key 的系统显式 no-op 并在队列行注明。用户删除项目的路由立即按序入队（事件驱动）。长驻进程内的每日定时 sweep。

**Blocked by:** 01 — deletion_queue、超龄推导与 sweep 引擎

**Status:** ready-for-agent

- [ ] 四个生产删除器；E2B 定位用 Sandbox.list({metadata:{workspace_id}})
- [ ] 缺 key → 该删除器 no-op 且队列行注明（降级诚实）
- [ ] DELETE /api/workspace 路由：入队四行，立即回收
- [ ] 进程内每日定时器调 sweep（Railway 单机结论；换 cron service 是部署配置不是代码）
- [ ] 保留期 30/14 是环境变量
