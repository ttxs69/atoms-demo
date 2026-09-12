# Research: WebContainer 商业化许可与成本 — Ticket 02（核验版）

> 本文替代 `research/webcontainer-licensing.md`（无工具版）。
> 来源：webcontainers.io/enterprise、stackblitz.com/terms-of-service、npmjs.com/@webcontainer/api、
> e2b.dev/pricing、e2b.dev/enterprise。核验日期：2026-09-12。

## Summary

**这是一个可能推翻 Q5 沙箱决策的发现。** WebContainer 的官方条款明确：
「production 用途 + 商业营利用途」需要 license，判定标准是**是否服务你的客户/潜在客户/员工**，
而不是是否收钱。Forge 的终点是"陌生人公开访问并生成"，字面上正落在需要 license 的区域。
而 license 定价**不公开**（走联系销售），这意味着一个周末内无法完成合规闭环。

对照之下，E2B 的定价**完全公开且可即时注册**：Hobby 层 $0/月 + 一次性 $100 用量额度、
无需信用卡、20 并发、每会话最长 1 小时。按公开费率折算，默认规格沙箱约 **$0.166/小时**，
$100 额度约等于 **600 沙箱小时**——对一个周末的 demo 绰绰有余。

## Findings

### 1. WebContainer 商业 license 的触发条件（官方直接证据）

**Claim:** License 是「production 使用 + 商业营利场景」的必要条件；原型/POC 不需要。
判定措辞是**服务对象**而非**收款行为**。
**Source:** [Commercial Usage — WebContainers](https://webcontainers.io/enterprise)
引文：
> *"Licensing is required for **production** usage of the API in a commercial, for-profit setting. (Prototypes or POCs do not require a commercial license.) If you're using the API to meet the needs of your customers, prospective customers, and/or employees, you need a license to ensure compliance with our Terms of Service."*
**Support:** direct evidence — 官方原文
**Confidence:** high

**对 Forge 的直接含义：** 我们的终点是"一个陌生人能公开访问、用自然语言生成并预览"。
陌生人 = 潜在客户 → 需要 license。**"不收钱"不能豁免，因为条款看的是服务对象。**
唯一的豁免窗口是 prototype/POC 阶段——Charting 阶段目前正处在这个窗口内，但一旦对外，
窗口关闭。

### 2. StackBlitz 服务条款的许可范围（官方直接证据）

**Claim:** 标准条款授予的是「有限、个人、非排他、不可转让」的许可，
商业使用权仅包含在 Teams 或 Enterprise 套餐中；其他用法"限于个人使用，不得转售或再分发"。
**Source:** [Terms of Service — StackBlitz](https://stackblitz.com/terms-of-service)
引文：
> *"we grant to you a limited, personal, non-exclusive, non-transferable license to use our Services. If you are using our Services under the StackBlitz Teams or Enterprise Plans, this license includes the right to use our Services for commercial purposes. For all other uses, the license is limited to personal use and not for resale or further distribution."*
**Support:** direct evidence
**Confidence:** high

### 3. license 定价与流程：不公开（官方直接证据为"缺失"）

**Claim:** 商业 license 定价**未公开**。Enterprise 版的功能清单是公开的（自托管/本地/VPC、
私有 npm registry、SAML2 SSO、优先支持），但价格明确引导至销售洽谈。
**Source:** [Commercial Usage — WebContainers](https://webcontainers.io/enterprise)、
[General FAQs — StackBlitz Docs](https://developer.stackblitz.com/guides/user-guide/general-faqs)
引文（Enterprise 页）：*"Contact us to see if your use case is a good fit and learn more about **our pricing and support options**."*
引文（FAQ）：*"Enterprise Server... is in the works, but not currently available. You can reach out to enterprise@stackblitz.com for details."*
**Support:** direct evidence（证明"未公开"这件事本身）
**Confidence:** high

**对周末时间盒的含义：** 需要人工洽谈 + 销售流程的授权，**在一个周末内不可能走完**。
这不是"贵"的问题，是"来不及"的问题。

### 4. WebContainer 是闭源运行时，且依赖 StackBlitz 托管服务（官方直接证据）

**Claim:** WebContainer API 依赖 StackBlitz 的托管代理与服务端加速才能工作，
使用即表示同意 StackBlitz 标准服务条款。核心运行时不随 npm 包开源。
**Source:** [WebContainer Public API — npm](https://www.npmjs.com/package/@webcontainer/api)
引文：
> *"The WebContainer API relies on hosted proxies and server-side acceleration from StackBlitz to function properly. By integrating the WebContainer API into your project, you are agreeing to StackBlitz's standard Terms of Service."*
**Support:** direct evidence
**Confidence:** high

**含义：** 没有自托管退路。这一条把「sandbox 适配层」从 nice-to-have 变成了必要设计。

### 5. E2B 定价（官方直接证据，公开可核算）

**Claim:** E2B 公开全部定价。Hobby 层 $0/月、一次性 $100 用量额度、无需信用卡、
最多 20 并发沙箱、每会话最长 1 小时、含 10 GiB 存储。
**Source:** [E2B Pricing](https://e2b.dev/pricing)
引文：
> *"Hobby — $0 monthly plan fee. One-time $100 in usage credits. Up to 20 concurrently running sandboxes. Up to 1 hour per sandbox session. 10 GiB of sandbox storage, included. Community support. No credit card required to start."*

**公开费率：**

| 资源 | 费率 |
|---|---:|
| vCPU | $0.000014 / vCPU-秒（≈ $0.0504 / vCPU-小时） |
| RAM | $0.0000045 / GiB-秒（≈ $0.0162 / GiB-小时） |
| 存储 | 免费 |

默认沙箱规格 2 vCPU / 4 GiB（可配 1–8 vCPU、1–8 GiB，无 GPU）。

**核算（我的计算，基于上述公开费率）：**
```
2 vCPU × $0.0504 = $0.1008 / 小时
4 GiB  × $0.0162 = $0.0648 / 小时
合计 ≈ $0.1656 / 小时 / 沙箱

$100 一次性额度 ÷ $0.1656 ≈ 604 沙箱小时
```
**Support:** 费率为 direct evidence；折算为 researcher calculation
**Confidence:** high（费率）；medium（折算，因实际用量取决于并发与时长策略）

**对 Forge 的含义：** 一次生成假设占用沙箱 3 分钟，$$100 额度 ≈ 12,000 次生成。
周末 demo 的沙箱成本在实际意义上为零。

### 6. E2B 隔离模型（官方直接证据）

**Claim:** 每个 agent 会话运行在独立 Firecracker microVM 中，自带 guest kernel，基于 KVM。
沙箱内提权仍需突破 Firecracker 才能触及宿主机。支持 per-sandbox egress 控制，
凭据可保留在 guest 之外。
**Source:** [E2B for Enterprise](https://e2b.dev/enterprise)
引文：
> *"Every agent session runs in its own Firecracker microVM. Control egress per sandbox and keep credentials outside the guest."*
> *"Isolation: a Firecracker microVM with its own guest kernel per session, on KVM. A kernel exploit inside the sandbox still needs a Firecracker escape to reach the host."*
**Support:** direct evidence
**Confidence:** high

## Contradictions

WebContainer 与 E2B 在**安全模型上的方向完全相反**，这是真实的取舍而非冲突：
- WebContainer：用户打开即执行，平台零风险，但风险转移给访客（见 ticket 05）
- E2B：平台侧执行，隔离由我们选择，风险在我们可控边界内，成本随用量线性增长

## Missing evidence
- 商业 license 的具体价格（不公开，只能洽谈）
- 商业 license 的审批周期（决定了它是否可能纳入任何时间盒）
- 是否要求署名或商标展示（与"去角标"需求潜在冲突）
- E2B 免费层是否有除并发/时长外的隐性配额

## Sources kept
- https://webcontainers.io/enterprise — license 触发条件的原文（决定性）
- https://stackblitz.com/terms-of-service — 商业使用权的原文
- https://www.npmjs.com/package/@webcontainer/api — 依赖托管服务、无自托管退路
- https://e2b.dev/pricing — 公开费率与免费层
- https://e2b.dev/enterprise — Firecracker 隔离模型原文

## Next steps
Q5 的沙箱决策需要重新裁决。三条路：
1. **E2B** —— 定价公开、即时可用、$100 免费额度、隔离模型可辩护；代价是成本模型从"零"变成"线性"
2. **WebContainer + 限定为 POC** —— 停在 prototype 窗口内不对外，但那就不再满足 Q6 的"陌生人公开访问"
3. **WebContainer + 启动 license 洽谈并与实现并行** —— 周末内产品可跑在本地/POC 形态，
   对外发布等 license 落地

建议将本 ticket 的结论作为输入，把 Q5 决策作为一个正式的重新裁决项写进地图。
