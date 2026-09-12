# Research: WebContainer 能力边界 — Ticket 01（核验版）

> 本文替代 `research/webcontainer-capabilities.md`（无工具版）。
> 来源：官方文档 webcontainers.io、StackBlitz Docs、GitHub stackblitz/webcontainer-core、
> npmjs.com/@webcontainer/api。核验日期：2026-09-12。

## Summary

Vite + React + Tailwind + shadcn/ui 的纯 JavaScript 技术栈在 WebContainer 里**完全可跑**，
理由是该栈不依赖任何 native addon，全在 WASM 沙盒内执行。
两个真实约束：① 必须在宿主页面响应头里设置 `COOP: same-origin` + `COEP: require-corp`
（或 `credentialless`）才能启用 SharedArrayBuffer；② native addon 一律不支持，
这影响 Prisma 原生引擎、sharp、better-sqlite3、bcrypt 等含 C++ 扩展的包。

## Findings

### 1. native addon 禁用（官方文档直接证据）

**Claim:** WebContainer 只能执行 JavaScript 和 WebAssembly，native addon 默认通过 `--no-addons` 标志禁用。
**Source:** [Troubleshooting WebContainers | StackBlitz Docs](https://developer.stackblitz.com/platform/webcontainers/troubleshooting-webcontainers)
引文：*"Currently, WebContainers can only execute languages that are natively supported on the Web, including JavaScript and WebAssembly. It is not possible to run native addons which are usually implemented using native languages such as C++, unless they can be compiled to WebAssembly. Therefore, loading native addons is disabled by default via `--no-addons`."*
**Support:** direct evidence — 官方文档原文
**Confidence:** high

受影响的包（确认）：parcel、rspack、sharp、better-sqlite3、bcrypt（含 native binding 的一切）。
Prisma 的原生查询引擎同理受影响；可改用 Prisma 的 WASM 构建版规避。

### 2. COOP/COEP 头为强制要求（官方文档直接证据）

**Claim:** WebContainer 需要 `SharedArrayBuffer`，后者要求页面处于 cross-origin isolated 状态，
即必须在宿主页面响应头中设置以下两项之一：
- `Cross-Origin-Embedder-Policy: require-corp` + `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: credentialless` + `Cross-Origin-Opener-Policy: same-origin`
**Source:** [Configuring Headers — WebContainers](https://webcontainers.io/guides/configuring-headers)
引文：*"WebContainers require that your page, even in development, is served with these two headers."*
**Support:** direct evidence
**Confidence:** high

**对 Forge 部署的含义：** Cloudflare / Vercel / Netlify / Next.js 均有官方配置示例，
设置方式直接，无需特殊账户或付费层。但这两个头会破坏所有未声明 `Cross-Origin-Resource-Policy` 的跨域资产加载（如第三方字体、CDN 上的外部 JS），需要确保引入的资产都支持 CORP。

### 3. Vite + React + Tailwind + shadcn/ui 可行性（架构推断，高置信）

**Claim:** 上述技术栈全部是纯 JavaScript/TypeScript，无任何 native addon 依赖，
在 WebContainer 的 WASM 沙盒内完全可运行。
**Support:** 从 findings 1 + 2 推断；bolt.new 开源代码库（stackblitz/bolt.new）
同样在 WebContainer 内跑 Vite，是直接的生产验证案例
**Confidence:** high（架构上确定）

### 4. npm install 行为

**Claim:** npm 在容器内工作，从真实的 npm registry 抓包（走浏览器网络）；
任何运行时内容是纯 JS 的包均可安装并使用。
**Source:** StackBlitz Docs 故障排查页面间接证实；bolt.new 生产验证
**Confidence:** high（机制面）；具体的安装速度与带宽上限为 recalled-volatile，需实测

### 5. 尚未从一手来源核实的项目（Missing evidence）

- Node.js 具体版本号及是否可指定（官方文档有说明但本次未直接抓取，已有 `node --version` 验证建议）
- 工作区文件系统是否跨页面刷新持久化；zip 导出 API 是否存在
- 内存、文件数、包体积等硬性上限的具体数值
- 冷启动与 `npm install` 的实测延迟（对生成循环的 UX 设计有影响）

## Contradictions
None found in fetched sources.

## Sources kept
- https://developer.stackblitz.com/platform/webcontainers/troubleshooting-webcontainers — native addon 禁用的直接原文
- https://webcontainers.io/guides/configuring-headers — COOP/COEP 强制要求的直接原文
- https://github.com/stackblitz/bolt.new — 生产案例，Vite+WebContainer 的真实验证

## Next steps
在开始实现前需要实测两件事：① 实际安装 Forge 目标依赖（shadcn/ui 全套），确认无 native addon 意外；
② 测量 WebContainer 冷启动 + `npm install` 耗时，作为生成循环 UX 设计（ticket 09）的输入。
