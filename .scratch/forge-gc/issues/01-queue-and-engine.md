# 01 — deletion_queue、超龄推导与 sweep 引擎

**What to build:** GC 的核心闭环。队列表（每 workspace×target 一行，两阶段状态）；"无活动"从账本行推导的纯函数（30 天身份/14 天沙箱，边界测死）；sweep 引擎查超龄入队、按依赖序（沙箱→共享行→平台行→auth 用户）执行 pending 行、指数退避、5 次转 failed。引擎不 import 任何外部 SDK——全部走注入的假删除器。

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] deletion_queue 表迁移；幂等入队（重复 sweep 不重不漏）
- [ ] 超龄推导纯函数：30 天无账本行→身份过期；29 天→不过期；沙箱 14 天同理
- [ ] 依赖序：一次 sweep 内四类 target 按序执行（假删除器录调用序断言）
- [ ] 某删除器抛错 → attempts+1、next_retry_at 后移；到点重试；5 次转 failed
- [ ] done 行不再执行；全部 pglite 真 PG 语义
