# 06 — Orchestrator 接口：单 agent 多角色，可升级为真并行

Type: grilling
Status: open
Blocked by: —

## Question

Q7 裁定"先单 agent 多角色，接口留出升级到真并行的余地"。需要把这个"余地"
落成具体的接口设计。

待定的决策：

- **角色的表达**：一个角色由什么定义——system prompt？工具白名单？模型偏好？
  上下文切片策略？这些如何组合成一个可声明的实体？
- **上下文隔离**：单 agent 切换角色时，会话历史如何组织才不会互相污染？
  （Emma 写 PRD 时不该看到 David 的抓取日志？还是应该看到？）
- **真并行时的合并**：多个 agent 同时产出，结果如何合并？冲突如何裁决？
  （Emma 说用 A 方案，Bob 说 A 不可行——谁说了算？由 Mike 仲裁还是回到用户？）
- **UI 呈现**："Emma 正在撰写 PRD"这类状态由谁驱动——是 orchestrator 发出的事件，
  还是前端根据当前角色推断？这决定了并行时 UI 能否自然扩展。
- **升级接缝**：接口上具体哪个位置是"从串行换并行"的替换点？
  能否做到改一处实现而不动调用方？
- 是否复用现成的 agent 框架（LangGraph、Mastra、Vercel AI SDK 的 agent 原语）
  还是自研一个薄的 orchestrator？取舍在哪？

建议先读 `docs/03-architecture.md` 的 3.2 节（Orchestration Service）作为讨论起点。

## Answer

<!-- filled on resolution -->
