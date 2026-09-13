# 02 — 管线接线：迁移发现 → migrating → 门控

**What to build:** orchestrator 管线补上声明的 migrating 状态。项目里出现 supabase/migrations/*.sql 时：install 后读出迁移、走（注入的）门控、通过才 build。门控失败走已有 gate_failed 路径（零重试、文件保留、重写上下文）。

**Blocked by:** 01 — RLS 模板注入器与无 RLS 检测器

**Status:** ready-for-agent

- [ ] 有迁移文件 → 事件流出现 migrating 步骤；无迁移 → 管线不变
- [ ] 迁移内容经注入器变换后交给 GatePort（假门控断言收到的是注入后 SQL）
- [ ] 门控失败：无 build、无 autofix、已写文件保留、gate_failed 携带 code/detail（ticket 11 断言全适用）
- [ ] FakeSandbox 内存 fs 放 SQL 文件即可驱动（seam A）
