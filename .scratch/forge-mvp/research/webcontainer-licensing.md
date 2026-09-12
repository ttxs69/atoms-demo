# Research: WebContainer 商业化许可与成本

> 本文解决 TICKET 02 — WebContainer commercial licensing and cost（`.scratch/forge-mvp/issues/02-webcontainer-licensing.md`）。

---

## ⚠️ 检索能力缺失声明（先读这一段）

**本次运行没有任何联网检索工具。** 可用工具只有 `read` / `write` / `contact_supervisor`：
没有 `web_search`、没有网页抓取、没有 `source_check`。

因此本文 **不包含任何一手来源核验**。下面所有关于许可条款、定价、隔离模型的陈述，
都是 **模型记忆（recollection）**，不是抓取到的原文，可能已过期或本来就是错的。
本票据原本要求"pricing/licensing 用 source_check 核验并引用原文段落"——**这一条没有做到**。

- 我 **没有** 引用任何原文段落，因为我无法抓取原文；凭记忆"引用"等于编造引文。
- 下文 URL 一律标注为 **待核验目标（verification target）**，不是支撑论断的 citation。
- 每条数字都带 `[未核验]` 标记。**任何一条都不足以直接用于签约或架构定稿。**

结论定性：**本文可用于"排列决策空间、定出下一步要问谁"，不可用于"确认成本与合规"。**
真正的 go/no-go 必须先跑一遍第 6 节的核验清单。

---

## Summary

WebContainer 的免费/付费边界，据我的记忆是按 **用途性质 + 部署 origin** 划的，不是单纯按"是否收费"：
个人 / 开源 / 原型免费，商业用途需要单独商业 license，且自有域名上跑需要注册 origin 拿 API key。
**商业 license 价格我记忆中不公开（走 contact sales），因此按票据要求：不估算。**
对 Forge 而言最关键的是：我们的终点（陌生人公开访问 + 账号 + 用量限制）**落在免费与商业的模糊带上**，
而这个边界只有 StackBlitz 的条款原文说得清——恰恰是本次无法核验的部分。
架构上的可行解不依赖许可结论：**把 sandbox 抽象成可替换适配器**，先用 WebContainer 出 demo，
同时保证 E2B / Vercel Sandbox 能在不重写 orchestrator 的前提下顶上。

---

## Findings

### A. WebContainer 许可边界

1. **Claim:** WebContainer API 对个人 / 开源 / 原型用途免费，商业用途需要单独商业 license。
   **Sources:** 无（待核验目标：`https://webcontainers.io/enterprise`、`https://webcontainers.io/terms`）。
   **Support:** researcher recollection（**非** direct evidence，**非** source interpretation——我没读到源）。
   **Confidence:** low-medium。
   我对"存在免费/商业двух层结构"这件事本身有较强印象；对**每一层的官方措辞**没有可信记忆。

2. **Claim:** 免费使用需要为部署 origin 注册 API key；localhost 与 StackBlitz 自家托管环境不需要。
   **Sources:** 无（待核验目标：`https://webcontainers.io/guides/quickstart`、API key 申请入口）。
   **Support:** researcher recollection。
   **Confidence:** low-medium。
   **对 Forge 的直接含义（inference）：** 若成立，则"公开访问"这个动作本身就触发注册流程，
   因为我们会跑在自有域名上。注册 ≠ 商业 license，但它是 StackBlitz 看见我们用途的时刻。

3. **Claim:** "收费" 与 "公开访问" 哪个触发商业 license —— **无法回答。**
   **Sources:** 无。
   **Support:** missing evidence。
   **Confidence:** n/a。
   这是本票据最核心的一问，也是最不能靠记忆答的一问。我的**猜测**（明确标注为 inference）是
   条款更可能用 "commercial use" 这类宽口径措辞，而非"是否向终端用户收款"这种窄口径，
   意味着一个公开运营的产品 demo 即使不收钱也可能被认定商业。**但这只是猜测，必须读原文。**

4. **Claim:** 原型 / 个人 / 商业的官方定义 —— **无法回答，未找到可引用定义。**
   **Support:** missing evidence。

5. **Claim:** 定价模型（按域名 / 按 MAU / 按实例）与量级 —— **我的记忆是不公开定价、走销售洽谈。**
   **Sources:** 无。
   **Support:** researcher recollection。
   **Confidence:** low。
   **按票据规则，此处不给任何数字。** 若核验后确实不公开，则"成本"在周末窗口内是**不可知量**，
   这本身就是一个应当影响选型的事实。

6. **Claim:** 申请流程与周期 —— **无法回答。** 记忆中是表单 / 邮件联系销售，**周期无可信记忆**。
   **Support:** missing evidence。
   **对周末时间盒的含义（inference）：** 任何需要人工洽谈的流程，**周期都长于一个周末**。
   所以"周末内拿到商业 license"应当默认视为不可行，方案必须在免费层或替代品上闭环。

7. **Claim:** WebContainer 运行时是闭源专有的，不存在自托管 / 开源等价实现；npm 上的
   `@webcontainer/api` 是客户端封装，核心运行时不随之开源。
   **Sources:** 无（待核验目标：npm `@webcontainer/api` 页面与其 LICENSE、`https://webcontainers.io`）。
   **Support:** researcher recollection。
   **Confidence:** medium。
   **推论：** 若成立，则"许可不可接受"时**没有 WebContainer 侧的退路**，
   只能换成 findings B 里的服务端沙箱。这使 sandbox 适配层从"nice to have"变成**必要设计**。

8. **Claim:** 是否限制修改源码 / 是否要求署名或商标展示 —— **无法回答。**
   **Support:** missing evidence。
   记忆中此类 SDK 常见"不得移除版权声明 / 不得逆向"条款，但我**没有** WebContainer 具体条款的可信记忆。
   注意这一条与 PRD 里"Pro/Max 去角标"的产品设计直接冲突风险相关，值得优先核验。

### B. 替代沙箱（服务端执行不可信代码）

以下四项 **全部 `[未核验]`**，定价数字我一律不写具体值，只写计费**维度**——
维度的记忆比数字可靠，且维度才是架构选型真正关心的东西。

9. **Claim:** E2B 主打"安全运行 AI 生成代码"，隔离模型为 Firecracker microVM，核心开源。
   **Sources:** 无（待核验：`https://e2b.dev`、其 GitHub LICENSE、pricing 页）。
   **Support:** recollection。**Confidence:** medium（对"显式营销 untrusted code"这点印象较强）。
   **计费维度记忆：** 免费额度 + 订阅层 + 按 vCPU/RAM·时长 计量。**具体数字不给。**

10. **Claim:** Vercel Sandbox 为运行不可信 / AI 生成代码设计，基于 microVM，按活跃 CPU + 内存计费，有单次最长运行时长上限。
    **Sources:** 无（待核验：`https://vercel.com/docs/vercel-sandbox`、Vercel pricing）。
    **Support:** recollection。**Confidence:** low-medium。
    时间上限的**具体值**我不确定，但"存在硬性上限"这点需要核验——它决定能否托长时预览。

11. **Claim:** Daytona 提供 AI agent 用沙箱，主打极快冷启动，按资源·时长计费。
    **Sources:** 无（待核验：`https://daytona.io`、其 repo LICENSE）。
    **Support:** recollection。**Confidence:** low。
    Daytona 有过从"开发环境管理器"到"AI sandbox"的定位迁移，我的记忆可能对应旧定位，**尤其需要重新核验**。

12. **Claim:** Modal 提供 `Sandbox` 原语用于跑不可信代码，gVisor 隔离，按秒计费且费率公开。
    **Sources:** 无（待核验：`https://modal.com/docs/guide/sandbox`、`https://modal.com/pricing`）。
    **Support:** recollection。**Confidence:** low-medium。
    "费率公开"这一点若成立，Modal 是四者中**成本最可预先计算**的，对预算建模有价值。

13. **Claim（架构性，明确标注为 researcher inference，不是来源结论）:**
    WebContainer 与上述四者**不是同类风险模型**。WebContainer 在**访客浏览器**内执行，
    宿主侧算力成本≈0、且不可信代码的爆炸半径主要由浏览器沙箱承担；
    E2B / Vercel / Daytona / Modal 在**我们的服务端**执行，成本随用量线性增长，但隔离由我们控制。
    **一个容易被忽略的安全点：** WebContainer 方案里，生成的代码若与主站同 origin，
    等价于在我们域上执行任意脚本（可触达同源 cookie / storage）。
    因此**预览必须隔离到独立 origin**，并配好 COOP/COEP 跨域隔离头。
    这条与许可无关，但会影响域名与部署拓扑，**应尽早定**。

---

## Contradictions

**None found** —— 但请注意这不是"证据一致"，而是**根本没有取到证据**，无从对照。
把这一行读成"无冲突"是误读。

---

## Missing evidence

按重要性排序，全部因无检索工具而未验证：

1. 商业 license 的**触发条件原文**（收费 vs 公开访问）—— 决定 Forge 是否合规。**最高优先。**
2. 原型 / 个人 / 商业的**官方定义**。
3. 商业 license **定价模型与量级**（是否公开亦未确认）。
4. **申请流程与周期** —— 决定周末时间盒内是否可能走完。
5. 是否要求**署名 / 保留商标**、是否**禁止修改**运行时 —— 与"去角标"产品需求潜在冲突。
6. 免费层是否有**硬性用量上限**（并发、构建数、带宽）。
7. 四个替代品的**当前**定价数字与隔离模型细节；Daytona 定位是否已变。
8. WebContainer 免费层是否允许"我们把它作为产品的一部分卖给终端用户"这种**转售式**用法。

---

## Sources

- **Kept:** 无。本次运行未取得任何一手来源。
- **Rejected/deprioritized:** 不适用——没有执行检索，无来源可筛。
- **待核验目标清单**（下一次带检索工具时按此顺序打，全部要求读原文并 `source_check`）：
  - `https://webcontainers.io/enterprise` — 商业层入口与是否公开定价
  - `https://webcontainers.io/terms` — 许可触发条件、署名、修改限制（**决策核心**）
  - `https://webcontainers.io/guides/quickstart` — API key 与 origin 注册机制
  - npm `@webcontainer/api` 的 LICENSE — 判定闭源/自托管可能性
  - `https://e2b.dev` + repo LICENSE + pricing
  - `https://vercel.com/docs/vercel-sandbox` + Vercel pricing
  - `https://daytona.io` + repo LICENSE（**定位可能已变，重新读**）
  - `https://modal.com/docs/guide/sandbox` + `https://modal.com/pricing`

---

## Next steps

最有用的后续动作，按顺序：

1. **带检索工具重跑本票据。** 本文的 finding 1/2/5/6/7 全部是记忆，必须换成原文引用。
   在此之前不要把任何数字写进 `docs/03-architecture.md`。
2. **先读 terms，再读 pricing。** 触发条件（免费还是要谈）决定后面要不要看价钱。
3. **不阻塞地推进架构解耦：** 把 Runner 抽成 `SandboxAdapter` 接口
   （`create / writeFiles / exec / previewUrl / dispose`），WebContainer 与服务端沙箱各实现一份。
   这一步**不依赖许可结论**，且是许可结论不利时唯一的退路，建议现在就做。
4. **并行确认预览 origin 隔离方案**（独立域 + COOP/COEP），与许可无关但影响部署拓扑。
5. 若第 2 步显示需要人工洽谈：**当作周末内不可得**，MVP 直接按替代沙箱或"仅本人可访问的预览"降级设计，
   并把公开访问作为许可落地后的第二阶段。
