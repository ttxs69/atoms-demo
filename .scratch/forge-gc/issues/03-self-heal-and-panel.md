# 03 — orchestrator 自愈与面板 failed 呈现

**What to build:** GC 与生成循环的唯一交汇点：沙箱被 kill 后，orchestrator 内存里的死 id 必须自愈——该会话下次生成检测 resume 失败即重建沙箱。管理面板加 failed 队列行的呈现与手动重试。

**Blocked by:** 01 — deletion_queue、超龄推导与 sweep 引擎

**Status:** ready-for-agent

- [ ] 死沙箱自愈：resume/write 失败视为沙箱不存在 → 新建 → 会话映射更新（seam A fake 沙箱可驱动）
- [ ] 自愈后的首轮是"首轮语义"（重新规划）而非 iterate
- [ ] 面板：failed 行列表（workspace、target、attempts、last_error）
- [ ] 手动重试：failed → pending 重置计数；无 token 403（沿用）
