# 09 — 生成循环的用户体验

Type: prototype
Status: resolved
Blocked by: —

## Question

依赖 ticket 03（业界做法）与 ticket 06（orchestrator 接口）。
用 `/prototype` 产出一个可反应的原型，把讨论从抽象拉到具体。

待定的决策：

- 用户按下发送之后，**他看到什么**？流式吐代码？只显示"正在生成"？
  显示文件树逐文件长出？显示角色台词？
- **等待长度的感知管理**：一次生成几十秒到几分钟，如何让等待可忍受且可信任？
- **进度是真是假**：如果模型一次性返回全量代码，就没有真实进度可报——
  要不要为此拆分成多轮（先生成骨架、再逐文件填充）以换取真实进度？
- **失败与部分成功**：生成到一半失败，用户看到什么？已生成的文件保留吗？
- **中断**：能否中途停止？停止后保留什么？
- **迭代修改**：第二次修改时，用户看到的是 diff 还是新版预览？
  如何让他知道"改了什么"而不被代码淹没？
- 代码生成过程的可见性：全透明（终端日志）还是适度隐藏？
  目标用户是非技术人员，`docs/01` 显示 Atoms 把日志放在 Terminal 面板而非主视图。

产出一个低保真原型（界面截图 / 线框 / 可交互 stub 均可），链接到本 ticket。

## Answer

Resolved 2026-09-12。

### 原型

`prototypes/generation-loop.mjs`（分支 `prototype/generation-loop-ux`，commit `1835cd6`）

一个可运行的状态机，6 个变体全部跑通：

```
node prototypes/generation-loop.mjs happy       # 顺利路径
node prototypes/generation-loop.mjs autofix     # 构建失败 → 自修复
node prototypes/generation-loop.mjs interrupt   # 用户中途停止
node prototypes/generation-loop.mjs iterate     # 第二轮修改
node prototypes/generation-loop.mjs rlsfail     # 安全门控拒绝
node prototypes/generation-loop.mjs exhausted   # 额度不足
SPEED=0 node prototypes/generation-loop.mjs all # 全部，无延时
```

**为什么做成可运行状态机而不是静态线框**：ticket 09 的核心是**时间维度**
——等多久、进度是否真实、失败保留什么、中断后剩什么。静态图看不出这些。
事实证明这个选择是对的：三个缺失事件和两条缺失状态边都是"跑起来"才发现的。

### 状态机

```
idle → submitting → reserving → sandbox_booting → understanding → planning
     → generating → [installing] → [migrating → gating] → building → previewing
     → settling → idle_iterate ⟲

分支：
  submitting  → blocked_credits          额度不足，任务不启动
  generating  → interrupted              用户停止
  generating  → building                 第二轮修改跳过 npm install ★
  building    → failed → autofixing ⟲    有界重试，上限 3 次
  autofixing  → gave_up                  超上限，停下并报告
  gating      → gate_failed              安全门控拒绝，不自动重试
```

★ 这条边是跑 `iterate` 变体才发现的：第二轮修改若无新依赖应跳过 `npm install`，
否则每轮改都白等 2 秒。

### 决策

#### 用户看到什么：骨架先行，但只在首轮（Q1=c）

首轮生成：Emma 出 spec 后**立刻给出文件清单**，文件树先以灰色占位长出，
再由 Alex 逐个填充（`·` → `▶` → `✓`）。代价是多一次 LLM 往返（约 1.8 秒），
换来等待过程有形状——用户看到的是"4 个文件，正在写第 2 个"，而不是一个转圈。

后续修改**不预出清单**，直接开写。理由：修改范围小，且用户已有预览可看，焦虑低。

#### 进度是真的

骨架先行让进度成为真实信号（文件数是已知的分母）。
不做假进度条——`docs/01` 记录 Atoms 的做法是把日志放 Terminal 面板而非主视图，
我们采用同样的分层：主视图给**语义化状态**（"Alex 正在写 src/App.tsx"），
完整日志折叠在可展开的 ACTIVITY 区。

#### 失败与部分成功：保留已生成的文件

构建失败时已写入的文件全部保留，错误以人话呈现 + 原始错误附后：

```
出了点问题，Alex 正在自己修。
TS2304: Cannot find name "TodoItem" — src/App.tsx:14
[ 查看完整日志 ]
```

自修复上限 3 次，超限进入 `gave_up`，明确告知而非无限转圈。

#### 中断：保留文件，partial message 标记 interrupted（Q3=b）

**沙箱侧不需要写恢复逻辑**——E2B 的 auto-resume 会在请求到达时自动唤醒暂停的沙箱：

> *"a paused sandbox wakes up when activity arrives, so your code doesn't have to check
> or manage sandbox state"* — E2B auto-resume 文档

> *"Each time the sandbox resumes, it gets a fresh timeout (at least 5 minutes...) — so the
> sandbox keeps cycling between running and paused as long as activity arrives."*

**agent 侧**：那条被中断的助手消息**保留并标记 `interrupted`**，
下轮 prompt 里明确告知"上一轮在此处被中断"。理由：Mastra 共享 thread
本来就要存这条消息，标记比删除便宜；且模型知道"上次到哪了"直接提升续写质量。
不做摘要改写（要额外一次 LLM 调用，不值）。

额度按**实际用量**结算，冻结差额退还（ticket 07 的两阶段记账）：

```
已生成的文件保留了，未开始的没有产生消耗。
只按已用的 6 点结算。
[ 继续刚才的 ]   [ 换个方向重来 ]
```

#### 安全门控失败：停下，不自动重试（Q2=a）

这是与构建失败**性质不同**的失败，必须区别对待。构建失败是技术问题，
自修复合理；安全门控失败意味着**生成的数据隔离策略不安全**，自动重试有
掩盖问题的风险——用户不该在不知情的情况下拿到"看起来成功了"的应用。

```
安全检查未通过

检测到一条过宽的数据访问策略，已回滚，未对外暴露任何数据。
Alex 会重写这部分——安全问题不自动重试，需要你确认后继续。
[ 让 Alex 重写 ]   [ 查看详情 ]
```

注意措辞里明确了"已回滚，未对外暴露任何数据"——用户需要知道失败是**安全的**。

无外部先例可引用（web_search provider 全部不可用，且无厂商文档覆盖
"AI 生成的 RLS 策略被拒绝后如何呈现"这一场景）。这是纯设计判断，非调研结论。

#### 迭代修改：用"本轮动了哪些文件"替代 diff

ticket 10 砍掉了 diff 视图（Q1 降级）。但用户仍需知道"改了什么"，
否则会担心别的部分被动过。方案是在计划阶段就说明范围，完成后复述：

```
只需要改 src/MoodCard.tsx —— 其余文件不动。
...
本轮改了 1 个文件：src/MoodCard.tsx
```

这是**补偿方案而非等价替代**。如果日后 diff 视图重回范围，应替换掉它。

#### 额度不足：任务不启动

```
本次预计消耗约 18，当前余额 4。
明天 0:00 恢复每日额度，或升级账户立即继续。
——注意：任务未启动，不会产生半成品，也不扣额度。
```

最后一句是关键：用户需要确知**没有产生任何消耗**。

### 原型发现的契约缺口

#### 三个事件（回填至 ticket 06）

| 事件 | 为什么需要 |
|---|---|
| `plan_ready` | 骨架先行的触发点。没有它，首个文件写完前只有 spinner |
| `gate_started` | migration + Security Advisor 合计 5–15 秒，静默会被当成卡死 |
| `sandbox_state` | resume 时需要"正在恢复"反馈（约 1 秒但不能无声） |

**实现方式已确认无需扩展顶层契约**。Mastra 支持工具内部往当前流写自定义事件：

```typescript
execute: async ({ inputData, writer }) => {
  await writer.write({ type: 'custom-event', status: 'pending' })
  const response = await fetch(url)
  await writer.write({ type: 'custom-event', status: 'success' })
}
```

且有 **transient chunk** 概念——跳过持久化，专为"高频、量大、只在当下有意义"
的进度更新设计。三个事件都属于这一类，用 transient 发即可，不占存储。

#### 两条状态边

- `generating → building`（第二轮修改跳过 install）
- `building → failed`（自修复入口）

### ⚠️ 实现约束：E2B SDK 版本

E2B issue #875：用 `autoPause` 创建的沙箱，`connect` 时会覆盖该设置
**导致沙箱被杀掉**。已于 2026-05-15 修复，维护者结论是
*"This should have been fixed - please update to the latest SDK version!"*

**必须锁最新 SDK 版本**，否则 resume 路径会静默销毁用户的工作区——
而这正是本票"中断后恢复"依赖的路径。

### 证据

- <https://mastra.ai/en/docs/streaming/overview> — 工具内 custom event、transient chunk
- <https://www.e2b.dev/docs/sandbox/auto-resume> — 活动到达自动唤醒、每次 resume 获得新超时
- <https://github.com/e2b-dev/E2B/issues/875> — `connect` 覆盖 `autoPause` 导致沙箱被杀（已修）

### 下游影响

- **ticket 06** 需回填：三个事件用 Mastra custom event + transient chunk 实现，
  不扩展 `ForgeEvent` 顶层类型
- **ticket 11**（界面布局）可以直接用本原型 `iterate` 变体的界面作为起点：
  文件树 + 流式写入区 + ACTIVITY 折叠区 + 预览区的四分结构已在原型中验证
- **ticket 13**（GC）：`interrupted` 状态的会话也需要纳入清理判断
  ——中断后未继续的工作区同样占用沙箱
