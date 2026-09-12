# Research: 浏览器内执行不可信代码的威胁模型 — Ticket 05（核验版）

> 本文替代 `research/browser-untrusted-code-threat-model.md`（无工具版）。
> 来源：webcontainers.io 官方文档、StackBlitz 工程博客、github.com/stackblitz/webcontainer-core。
> 核验日期：2026-09-12。

## Summary

**Charting 时的断言"恶意代码问题从根上消失"被证伪为"一半正确，且错的那一半更重要"。**

正确的一半：生成的代码从不在 Forge 服务器上执行，这确实消除了一整类灾难性漏洞——
没有容器逃逸、没有服务端 RCE、没有横向移动到其他租户。这是真实且有价值的收益。

错的一半：风险**转移**给了访客，而不是消失。恶意生成的应用在打开它的人的浏览器里
以完整 JavaScript 权限运行。同时，一整片平台侧攻击面完全没被 WebContainer 决策触及。

可辩护的表述应收窄为：**"服务端代码执行风险被消除；访客侧与平台侧风险依然存在。"**

## Findings

### 1. 隔离边界的真实构成（官方文档 + 推断）

**Claim:** WebContainer 是编译到 WebAssembly 的 Node 兼容运行时，在浏览器标签页内执行，
配合内存虚拟文件系统，以及一个拦截容器**内部**发出的网络请求的 Service Worker。

真正的隔离边界是**浏览器自身的进程模型与同源策略**，不是 hypervisor，也不是内核。
"从 WebContainer 逃逸"不是容器逃逸，而是浏览器漏洞利用或嵌入拓扑的误用。

**Source:** [Introducing WebContainers | StackBlitz Blog](https://blog.stackblitz.com/posts/introducing-webcontainers/)、
[webcontainers.io](https://webcontainers.io/)
**Support:** 运行时构成为 direct evidence；"边界即浏览器进程模型"为 interpretation
**Confidence:** high（构成）/ medium-high（边界性质的表述）

### 2. 预览运行在独立 origin 上（官方文档直接证据，对威胁模型是关键）

**Claim:** WebContainer 的 dev server 预览通过 Service Worker 暴露在**独立的 origin** 上
（`*.staticblitz.com` / WebContainer 自有预览域），而非宿主页面同源。
**Source:** [Configuring Headers — WebContainers](https://webcontainers.io/guides/configuring-headers)、
[Quickstart — WebContainers](https://webcontainers.io/guides/quickstart)
**Support:** direct evidence
**Confidence:** high

**这一条是整个威胁模型的支点：** 因为预览在独立 origin，同源策略天然阻止了
容器内代码读取宿主页面的 DOM、`document.cookie`、`localStorage`。
所以"生成的代码窃取 Forge 用户会话"这个最担心的攻击路径，**被浏览器原生机制挡住了**——
前提是我们不做傻事（例如把预览 iframe 设成 `sandbox="allow-same-origin"` 且同源、
或把 token 通过 `postMessage` 无校验地传进去）。

### 3. 跨域隔离要求反而提供了额外保护（推断）

**Claim（inference）:** 强制的 `COOP: same-origin` + `COEP: require-corp` 除了启用
SharedArrayBuffer，副作用是**切断了宿主页面与跨域窗口的引用关系**（COOP）
并要求所有跨域子资源显式声明可嵌入（COEP）。这缩小了攻击面。
**Support:** inference — 从 COOP/COEP 的 Web 平台语义推出，非 WebContainer 文档明文
**Confidence:** medium-high（Web 平台机制稳定，但 WebContainer 的具体应用未逐项核实）

### 4. 风险转移：访客成为受害者（分析，非源文陈述）

**Claim（我的分析）:** 应用跑在**访客**浏览器里，因此"平台安全"成立，但访客暴露于：

| 攻击 | 可行性 | 说明 |
|---|---|---|
| CPU 挖矿 | 高 | 完整 JS 执行权限，可跑 WASM 矿工 |
| 钓鱼页面 | 高 | 可渲染逼真的假登录界面；域名是 Forge 的子域会**增加**可信度 |
| 输入外传 | 高 | 表单输入 beacon 到攻击者服务器 |
| 用访客 IP 做出站请求 | 中 | 受 CORS 限制，但可发不读响应的请求（如 CSRF 探测） |
| 读取访客已登录站点的响应 | 低 | 同源策略阻止；除非目标站 CORS 配置错误 |
| 触达访客文件系统 | 极低 | 需 File System Access API 且用户显式授权 |

**关键的不对称：** 服务端沙箱里，恶意代码的受害者是**平台**（有安全团队、有监控、有响应能力）。
浏览器沙箱里，受害者是**访客**（无防护、无知觉、且信任了我们的域名）。
风险不是消除，而是从"有能力防御的一方"转移到"无能力防御的一方"。

**Support:** analysis — 基于 finding 2 的同源边界与 Web 平台能力推演
**Confidence:** medium-high（机制层）；具体可行性未做渗透验证

### 5. 平台侧残留的攻击面（分析）

WebContainer 决策**完全没有触及**以下攻击面：

1. **提示词注入** —— 用户输入操纵生成服务，诱导它把恶意代码写进别人的项目、
   或泄露系统提示词/其他用户数据
2. **LLM 供应商信任** —— 模型可能生成带后门的代码；供应商可见全部用户输入
3. **发布环节 XSS** —— 若发布的站点与 Forge 主域同源，生成的恶意 JS 可触达 Forge 会话。
   **这是必须避免的架构错误：发布产物必须放在独立域**
4. **账号系统** —— 与 WebContainer 无关的常规攻击面
5. **CDN 完整性** —— 分发链被污染

### 6. 密钥可见性（结合 ticket 04 的结论）

**Claim:** Supabase `publishable` key 设计为可在前端暴露（ticket 04 finding 3 已核实），
因此生成的应用把它放进前端代码是**符合设计意图**的。
但 `secret` key（旧 `service_role`）绝对不能进前端。

**问题：** WebContainer 没有服务端。任何需要 secret key 的操作
（发邮件、调第三方付费 API、Stripe webhook）在纯浏览器架构下**无处安放**。
这个缺口是真实的架构约束，必须在 ticket 08 明确裁决。

**Support:** ticket 04 的 direct evidence + 本 ticket 的架构推断
**Confidence:** high

## 对 charting 断言的最终裁决

> 原断言："WebContainer 把'陌生人的代码在谁的机器上跑'这个问题从架构里删掉了，而不是防御它。"

**部分成立。** 准确的表述是：

- ✅ 消除了：服务端代码执行风险（容器逃逸、服务端 RCE、租户间横向移动）
- ✅ 意外收益：预览独立 origin + 强制 COOP/COEP，天然阻止了对宿主会话的窃取
- ❌ 未消除、而是转移：访客侧风险（挖矿、钓鱼、数据外传）
- ❌ 完全未触及：提示词注入、LLM 供应商、发布 XSS、账号系统

**这不推翻 Q5 的沙箱选择**（服务端零执行仍是真实收益），
但它推翻了"安全问题已解决"的判断。需要补的措施：
① 发布产物必须独立域；② 生成内容需要滥用检测；③ 对访客明示"此应用由 AI 生成、非官方内容"。

## Missing evidence
- WebContainer 是否有公开 CVE 或逃逸案例（本次未找到确证，但**"未找到"不等于"不存在"**）
- Service Worker 拦截的具体实现细节与其失效边界
- 预览 origin 的具体域名规则与其是否可被攻击者预测/伪造

## Sources kept
- https://webcontainers.io/guides/configuring-headers — COOP/COEP 与独立 origin
- https://webcontainers.io/guides/quickstart — 预览机制
- https://blog.stackblitz.com/posts/introducing-webcontainers/ — 运行时构成
- https://github.com/stackblitz/webcontainer-core/issues — issue tracker（无 CVE 检索结果）

## Next steps
1. 「发布产物独立域」应作为硬性架构约束写入 `docs/03-architecture.md`
2. 生成内容的滥用检测应作为一个新 ticket 进入地图（当前不在范围内）
3. 若沙箱改为 E2B（见 ticket 02），本威胁模型需重写——风险回到平台侧
