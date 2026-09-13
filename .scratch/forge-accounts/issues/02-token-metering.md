# 02 — token 计量贯通

**What to build:** settle(actual) 从硬编码 0 变成真值。模型流的 finish usage 被提取、按轮累计、传进结算与 agent_done.creditsUsed。这是对 core-loop 事件契约的唯一扩展：ModelChunk 增加 usage 分块。

**Blocked by:** None — can start immediately.

**Status:** done

- [ ] ModelChunk ∪ {type:'usage'; input; output}；适配器从 fullStream 的 finish 部分提取
- [ ] orchestrator 按轮累计 usage；agent_done.creditsUsed 与 settle 调用都用真值
- [ ] FakeModel 支持脚本化 usage 分块
- [ ] 现有 seam 测试更新（FakeCredits 的 settle 断言从 0 变为脚本值）
- [ ] 中断路径按已发生的轮次用量结算（不足一轮记 0，与现有行为一致）
