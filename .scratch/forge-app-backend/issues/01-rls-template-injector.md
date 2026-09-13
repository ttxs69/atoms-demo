# 01 — RLS 模板注入器与无 RLS 检测器（纯函数）

**What to build:** 本 spec 安全主张的核心，两个纯函数。注入器：给定模型的迁移 SQL，对每张 CREATE TABLE 追加平台模板——workspace_id 列（默认当前 workspace）、ENABLE ROW LEVEL SECURITY、REVOKE ALL FROM anon/authenticated、平台 workspace_isolation 策略——**追加在模型 SQL 之后，模型无法移除**。检测器：给定最终 schema 描述，存在无 RLS 的表即失败并指名表。

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] 处理 CREATE TABLE 全形态（IF NOT EXISTS、schema 限定名、多语句文件）；解析不了的形态直接报错，不静默漏注
- [ ] 模型 SQL 里自带的 GRANT 语句被模板的 REVOKE 覆盖（追加在后）
- [ ] 模型写的额外策略保留（追加不替代），但平台策略不可删除
- [ ] 检测器：无 RLS 表 → 失败并指名；全有 → 通过
- [ ] 纯函数测试逐条对着官方教训断言（"adding policies doesn't remove grants"）
