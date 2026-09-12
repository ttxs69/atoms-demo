# 01 — 走通骨架：三个端口、事件契约、测试台

**What to build:** 还没有任何用户可见的东西。这张票交付的是**后面每一张票赖以被测试的那条接缝**。

`Orchestrator.run(sessionId, userInput)` 存在，返回一个事件流。喂给它一个最简输入，
它能流出 `agent_started` → `text_delta` → `agent_done`。驱动它的是一个脚本化的假模型，
写入落在一个假沙箱的内存文件系统里。`npm test` 能跑，且是绿的。

这张票同时定下三个端口的形状——沙箱、模型、额度。它们是 orchestrator 唯一的外部依赖，
把它们定义成端口的目的很实际：**后面每张票都能在不碰真实 E2B、不烧 token 的前提下被完整测试**。

**Blocked by:** None — can start immediately.

**Status:** done

状态机（来自原型 `prototypes/generation-loop.mjs`，本票只需建到 `understanding` 为止，
但类型要能表达完整的图，因为后面的票逐条填这些边）：

```
idle → submitting → reserving → sandbox_booting → understanding → planning
     → generating → [installing] → [migrating → gating] → building → previewing
     → settling → idle_iterate ⟲

分支：
  submitting  → blocked_credits          额度不足，任务不启动
  generating  → interrupted              用户停止
  generating  → building                 第二轮修改跳过依赖安装
  building    → failed → autofixing ⟲    有界重试，上限 3 次
  autofixing  → gave_up                  超上限，停下并报告
  gating      → gate_failed              安全门控拒绝，不自动重试
```

- [ ] `ForgeEvent` 的七个顶层事件类型全部定义，每个都带 `agentHandle`
- [ ] 三个端口有明确接口：沙箱（创建 / 写文件 / 执行命令 / 暂停 / 恢复 / 杀掉）、模型（给角色和消息、拿回流式响应）、额度（预留 / 结算）
- [ ] 假沙箱持有一个真实的内存文件系统——`write_file` 真的写进去，之后能读出来断言
- [ ] 假沙箱能被指示让某条命令失败（后面 05 要用这个驱动自修复）
- [ ] 假模型由一段预设的 tool call 序列驱动，同一序列永远产出同一事件流
- [ ] `run()` 对一个最简输入流出完整的 `agent_started` → `agent_done`
- [ ] 测试跑在毫秒级，不需要网络，不花钱
- [ ] `npm test` 是绿的
- [ ] 术语与 `CONTEXT.md` 一致——尤其是 workspace 不叫 project
