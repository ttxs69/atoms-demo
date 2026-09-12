# 06 — Orchestrator 接口：单 agent 多角色，可升级为真并行

Type: grilling
Status: resolved
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

Resolved 2026-09-12。

### 框架：Mastra

在 AI SDK v5 之上提供 agent 定义、工具调用、循环控制、Observational Memory 等原语，
避免自研调度层。底层仍是 AI SDK，需要时可以剥掉上层。

被否决的选项：LangGraph.js 落后 Python 版 4–8 周且继承 Python 惯用法；
纯 AI SDK 需要自写调度层；完全自研在周末时间盒内风险最高。

**重要发现**：Mastra 自己的 `AgentNetwork`（LLM 自主路由）已 **deprecated**，
官方推荐改用 "supervisor agent + `agent.stream()`/`agent.generate()`"。
即他们走过动态网络这条路，发现固定 supervisor 更可控。我们直接采用后者。

### 角色的表达

一个角色 = 一个 Mastra `Agent` 实例：

```typescript
const alex = new Agent({
  name: 'Alex',
  instructions: 'You are Alex, the full-stack engineer...',
  tools: { write_file: writeFileTool, run_command: runCommandTool },
  model: anthropic('claude-opus-5'),
});
```

三要素：`instructions`（人格与职责）、`tools`（白名单，只有 `@eng` 能写文件）、
`model`（可按角色选不同模型）。角色是**声明式配置**，新增角色不改调度代码。

### 上下文隔离：共享 history

共享同一个 Mastra thread（`threadId = sessionId`），角色仅由 system prompt 区分。

不做隔离是有意的：设计信息应当流向工程实现，Alex 看到 Emma 的需求讨论是收益而非污染。
若日后出现真实污染问题，可加 summary injection，不需重写 orchestrator。

### 并行策略：按操作类别分区，而非一律并行

原判断是"先串行，留接缝"。研究后修正为**部分并行现在就做**，但必须按操作类别切：

| 操作类别 | 角色 | 策略 |
|---|---|---|
| 只读分析 / 检索 | `@research`、`@data`（分析态） | ✅ `Promise.all` 自由并行，不会碰撞 |
| 设计推理 | `@pm`、`@arch` | ⚠️ **串行**（保持两个独立角色，不合并） |
| 工作区写入 | `@eng` | ⚠️ 单写者 |

**为什么设计推理不能并行**（这是本票最重要的结论）：

`@pm` 和 `@arch` 推理的是**同一个设计**。并行跑会产出两份半一致的答案，
外加一个协调问题——而这恰好制造出 Q4 想避免的那种"冲突"，
且这种冲突是我们强行并行造出来的，不是真实的意见分歧。

引 aiarch.dev 的复盘结论：*"Partition the writes, not the thinking."*
以及并行写同一工作区的真实风险：*"A filesystem write has no base... The previous
contents are gone and the operating system reports success, because the write did succeed."*
——**丢失的写入是静默的**，没有报错、没有冲突标记、没有失败的测试。

**保持两个角色而不合并**：拟人化角色是产品核心叙事（Atoms 的护城河），
合并 `@pm` 和 `@arch` 会削弱它。串行只损失一点延迟，而设计推理本来就不该并行。

### 升级接缝

`runAgent(handle, ctx)` 返回 `Promise<stream>`。调用方从 `await` 单个改为
`Promise.all` 多个即为并行，对 `runAgent` 内部完全透明。这不是额外代码，只是命名约定。

fan-out 的实际位置是 **supervisor agent 的一次 tool call**（把下游 agent 作为工具调用），
结果收集也在 supervisor 的同一个 step 内，因此 supervisor 在下一个 step 能看到全部结果。

### 冲突呈现

Supervisor（Mike）汇总 → 检测分歧 → **呈现两个意见 + 给出推荐** → 交用户裁决。

不自动裁决（用户可能不知道自己的需求被曲解了），但也不沉默——必须给推荐及其依据。
用户是 in-the-loop 的审阅者，不是等待自动答案的人。

派发采用**确定性顺序**：并行 agent 读派发时刻的历史快照，
结果收齐后按固定角色顺序（pm → arch → eng）一次性追加。
同一输入永远产出同一份历史，这是版本快照与重放的前提。

### message 持久化

职责切分（`threadId = session.id` 对应，无关联表）：

- **Mastra memory** 管"模型看什么"——Observational Memory 用后台 agent 维护摘要日志
  取代原始消息，压缩长对话上下文
- **自己的 Postgres 表** 管账单与版本绑定——`credits_used`、`model_id`、
  `agent_handle`、`version_snapshot_id`

理由：credits 与版本绑定是核心域数据，不是附属信息（ticket 12 的 pause/resume
与版本快照都要用）。全用 Mastra memory 会导致在两处建模同一件事。

⚠️ Mastra 官方文档警告了直接在前端暴露 memory 的安全风险，memory 访问必须在服务端。

### 生成协议：原生 tool call

**撤回**此前"直接复用 bolt.new `<boltArtifact>` XML 协议"的建议。
那是 2024 年的方案，当时原生 tool calling 还不成熟。

```typescript
const writeFileTool = createTool({
  id: 'write_file',
  inputSchema: z.object({ path: z.string(), content: z.string() }),
  execute: async ({ path, content }) => {
    await sandbox.files.write(path, content);
    return { ok: true, path };
  },
});
```

理由：schema 校验省掉整类调试时间（畸形/截断 XML 的失败模式消失）。
流式可见性不丢——AI SDK v5 有 `tool-call-streaming-start` 事件与 args delta 流，
"代码逐行出现"的观感可以保留。

### UI 事件流

Orchestrator 显式发事件，前端纯渲染：

```typescript
type ForgeEvent =
  | { type: 'agent_started';     agentHandle: string; messageId: string }
  | { type: 'text_delta';        agentHandle: string; delta: string }
  | { type: 'tool_call_start';   toolName: string; toolCallId: string }
  | { type: 'tool_input_delta';  toolCallId: string; argsDelta: string }
  | { type: 'tool_result';       toolCallId: string; result: unknown }
  | { type: 'agent_done';        agentHandle: string; creditsUsed: number }
  | { type: 'error';             agentHandle: string; message: string };
```

`agentHandle` 使前端在并行时天然分路渲染，无需改动。
事件结构直接映射 AI SDK v5 的 `TextStreamPart` 类型；
Mastra 本身即 SSE-first（`agent.stream()` 返回 async iterable），方向一致。

否决"前端按 message 元数据推断"：单 agent 下够用，一上并行就要重写。

#### 回填：「生成循环的用户体验」原型发现的额外事件

原型（`prototypes/generation-loop.mjs`）跑出三个**契约里没有但必须发**的事件：

| 事件 | 为什么需要 |
|---|---|
| `plan_ready` | 骨架先行的触发点：Emma 出 spec 后立即给出文件清单，文件树先以灰色占位长出。没有它，首个文件写完前只有 spinner |
| `gate_started` | ticket 08 的两道门控（migration + Security Advisor）合计 5–15 秒，静默会被当成卡死 |
| `sandbox_state` | E2B resume 需"正在恢复"反馈（约 1 秒，但不能无声） |

**这三个不需要扩展上面的顶层 `ForgeEvent` 类型。** Mastra 支持工具内部往当前流写自定义事件：

```typescript
execute: async ({ inputData, writer }) => {
  await writer.write({ type: 'custom-event', status: 'pending' })
  const response = await fetch(url)
  await writer.write({ type: 'custom-event', status: 'success' })
}
```

并且有 **transient chunk** 概念——跳过持久化，专为"高频、量大、只在当下有意义"的
进度更新设计（`writer.custom({ ..., transient: true })`）。
三个事件都属于这一类：用 transient 发即可，不占存储、刷新后不重现。

来源：<https://mastra.ai/en/docs/streaming/overview>

### 数据流总览

```
Mastra
  └─ supervisor agent (Mike) —— 调度 + 冲突汇总 + 推荐
       ├─ 只读角色 (@research, @data)  → Promise.all 并行
       ├─ 设计角色 (@pm → @arch)       → 串行
       └─ 写入角色 (@eng)              → 单写者
            └─ write_file / run_command (原生 tool) → E2B sandbox
  ├─ Mastra memory      → context window 管理
  └─ 自己的 Postgres    → credits / version 绑定
       └─ SSE ForgeEvent 流 → 前端渲染
```

### 下游影响

- ticket 09（生成循环 UX）：已解决，并回填了三个额外事件（见上）
- ticket 10（MVP 范围裁剪）：已解决

### 新增的 fog

- 只读并行的**并发上限**：E2B Hobby 层 20 并发是沙箱限制，但只读 agent 不占沙箱，
  受限的是 LLM API rate limit。这个数字要等实测
- supervisor 的**分歧检测**如何实现：靠 prompt 让 Mike 自己判断，还是需要结构化输出？
  目前还看不清该问什么
