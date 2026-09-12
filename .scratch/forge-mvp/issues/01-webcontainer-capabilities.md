# 01 — WebContainer 能力边界

Type: research
Status: resolved
Blocked by: —

## Question

选定的沙箱策略是 WebContainer。在把技术栈押上去之前，需要知道它到底能跑什么。

具体要回答：

- 支持哪些 Node 版本？由谁决定（随 StackBlitz 更新还是可指定）？
- 能否 `npm install` 任意 npm 包？**原生依赖**（sharp、prisma、better-sqlite3、
  bcrypt 等含 native addon 的包）如何处理——能编译吗？还是直接失败？
- 能否跑 Vite dev server？能否跑 Next.js？能否跑 Express / Fastify 之类的服务端进程？
- 是否需要 Service Worker / SharedArrayBuffer / COOP-COEP 响应头？对部署环境有无额外要求？
- 文件系统是否持久化？刷新页面后工作区是否丢失？能否导出为 zip？
- 硬限制：内存上限、文件数、单文件大小、包体积、并发实例数
- 哪些常见能力**明确不支持**？（WebSocket 服务端？child_process？Docker？GPU？）
- 首次冷启动耗时，以及 `npm install` 的典型耗时

结论要能回答一个具体问题：**用 Vite + React + Tailwind + shadcn/ui 生成一个
带客户端路由和本地状态的应用，在 WebContainer 里跑得起来吗？**

## Answer

Resolved 2026-09-12. Sources: webcontainers.io official docs, StackBlitz Docs, github.com/stackblitz/bolt.new.

**Core decision question answered: YES** — Vite + React + Tailwind + shadcn/ui runs in WebContainer.
The entire stack is pure JavaScript/TypeScript with no native addons. This follows from how
WebContainer works (WASM-compiled Node runtime, browser-only) and is confirmed by bolt.new using
an identical stack in production.

Two hard constraints verified from primary sources:
1. Native addons are disabled by default (`--no-addons`). Affected packages: sharp, better-sqlite3,
   bcrypt, Prisma native engine, parcel, rspack. Use WASM-variant packages where needed.
2. Hosting page MUST serve `Cross-Origin-Embedder-Policy: require-corp` and
   `Cross-Origin-Opener-Policy: same-origin` (or credentialless variant). Required for
   SharedArrayBuffer. All major hosting platforms have documented config (Vercel, Netlify, Cloudflare).

Full verified brief: `.scratch/forge-mvp/research/webcontainer-capabilities-verified.md`