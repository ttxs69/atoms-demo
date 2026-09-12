# 12 — 沙箱策略重新裁决

Type: grilling
Status: resolved
Blocked by: —

## Question

Q5 原本裁定 WebContainer，理由是"服务端零执行，恶意代码问题从根上消失"。
两张 research ticket 把这个决策的两条腿都打断了：

- 「WebContainer 商业化许可与成本」：对外公开运营**需要商业 license**，
  判定标准是服务对象（陌生人 = 潜在客户）而非是否收钱；定价不公开、需销售洽谈，
  **周末时间盒内无法闭合**；且无自托管退路（运行时依赖 StackBlitz 托管代理）。
- 「浏览器内执行不可信代码的威胁模型」：原理由只有一半成立。
  服务端执行风险确实消除，但风险**转移**给访客（挖矿、钓鱼、数据外传），
  而访客恰恰是最无防御能力的一方。

所以需要重新裁决。待定的决策：

- **选哪条路**：
  - **(a) 改用 E2B**：定价公开（Hobby $0/月 + $100 一次性额度 ≈ 600 沙箱小时、
    20 并发、单会话 1 小时上限、无需信用卡），Firecracker microVM 隔离，
    立即可用无合规悬顶。代价：成本模型从"零"变成随用量线性；
    风险回到平台侧，需要自己承担隔离责任；「浏览器内执行不可信代码的威胁模型」需重写。
  - **(b) WebContainer + 停在 POC**：不对外，规避 license。
    但这直接与终点"陌生人能公开访问"冲突 —— 等于改终点。
  - **(c) WebContainer + 并行启动 license 洽谈**：周末先做本地/POC 形态，
    license 落地后再对外。代价：对外时间不可控，且洽谈结果可能是不可接受的价格。
  - **(d) 抽象出 sandbox 适配层**，先用能立刻跑的那个，保留切换能力。
    代价：多一层抽象，周末时间盒内是否划算存疑。

- **如果选 (a)，需要连带重新裁决的**：
  - 生成的应用跑在服务端沙箱里，那"预览"如何暴露给访客？E2B 的端口转发机制是什么形态？
  - 单会话 1 小时上限对"用户回来继续改"这个场景意味着什么？工作区如何持久化与恢复？
  - 20 并发对一个公开 demo 够不够？触顶时的表现是排队还是拒绝？
  - 隔离责任回到我们身上，那 charting 时被"删掉"的那些安全工作（出站白名单、
    资源配额、逃逸防护）现在要做多少？Firecracker 默认给了多少？

- **如果选 (c)，需要明确**：
  - "对外"的定义边界在哪？给三五个朋友看算不算 production commercial use？
  - 洽谈周期的兜底方案是什么？

- **无论选哪个，都要确认**：
  - 「浏览器内执行不可信代码的威胁模型」里那条硬约束——**发布产物必须放独立域**——
    在新方案下是否仍然成立、或者是否变得不必要？

先读这两份核验版简报：
- `.scratch/forge-mvp/research/webcontainer-licensing-verified.md`
- `.scratch/forge-mvp/research/browser-untrusted-code-threat-model-verified.md`

## Answer

Resolved 2026-09-12.

**决策：改用 E2B（路线 a）。发布产物放独立注册域的独立子域（路线 a）。**

### 沙箱：E2B

流量预期：个位数到几十人，峰值并发 < 5。
E2B Hobby 层（$0/月 + $100 一次性额度、20 并发、单次连续运行 1 小时）完全覆盖这个量级。
按默认 2vCPU/4GiB 规格（$0.166/hr）折算，$100 ≈ 600 沙箱小时；
一次生成 + 预览约占 4 分钟，$100 额度约合 9,000 次，Demo 规模下实际花费趋近于零。

**工作区持久化 —— 这是本条决策成立的关键。**
E2B 的 pause/resume 保留 filesystem 与内存状态，且 paused 沙箱**无限期保留**、
无 TTL、无自动删除；resume 约 1 秒。设 `onTimeout: 'pause'` 后，
连续运行 1 小时到期会自动暂停而非销毁，用户下次回来 resume 继续，连续运行计时重置。
这条消除了「1 小时上限意味着会话寿命只有 1 小时」的误解。

**威胁模型位移。** 风险从访客侧回到平台侧：现在是我们承载不可信代码的执行。
Firecracker microVM（KVM，guest 自带内核）提供隔离，但出站控制、资源配额、
滥用检测的责任重新落到我们身上。ticket 05 的访客侧分析作废，需重写。

**未决的运维细节（不阻塞本决策，实现时处理）：**
- 无「N 天后自动清理」配置项。paused 沙箱不会自己过期，只有显式 `kill()` 才删除。
  意味着**我们必须自己写回收策略**，否则沙箱会无限累积占满 Hobby 层的 10 GiB 存储。
- pause 耗时约 4 秒/GiB RAM（4 GiB 沙箱 ≈ 16 秒），且节点快照繁忙时会返回 503
  `ServiceBusyError`，SDK 建议重试。批量生成时的暂停开销需要纳入时序设计。
- resume 后沙箱内的服务能重新访问，但客户端连接需要重连。

### 发布产物：独立注册域的独立子域

每个发布的应用分配形如 `abc123.forge-app.com` 的子域，与 Forge 主域（如 `forge.app`）
落在**不同的注册域**。

为什么必须是不同注册域而不是同一注册域下的子域：cookie 的作用域是按注册域（eTLD+1）划分的，
若主域设了 `Domain=.forge.app` 的 cookie，`user-app.forge.app` 上的 JavaScript
发起的请求会自动携带该 cookie。分开注册域后，浏览器层面直接切断了这条路径，
不需要依赖 `document.domain` 是否被弃用这类细节。

实现成本：一张通配符 TLS 证书覆盖全部子域。

### 连带更新

- **ticket 05** 威胁模型需重写：访客侧风险消失，平台侧攻击面回归
- **ticket 09** 预览机制改变：预览 URL 由 E2B 端口转发暴露
- **ticket 10** 现解锁，可开始

### 证据

- `research/webcontainer-licensing-verified.md` — WebContainer 许可结论、E2B 定价与隔离模型
- `research/browser-untrusted-code-threat-model-verified.md` — 原威胁分析
- <https://e2b.dev/docs/sandbox/persistence> — pause/resume 语义、无限期保留、
  ``onTimeout``、403/503 行为、pause 性能
