# 03 — 代码生成循环的业界做法

Type: research
Status: resolved
Blocked by: —

## Question

核心闭环的难点在"自然语言 → 一整个可运行的应用"这个生成循环怎么设计。
bolt.new、Lovable、v0、Replit Agent 都做过这件事，先弄清业界共识与已知坑。

具体要回答：

- 输出结构：是否用 file-tree + 逐文件 diff 的结构化输出（如 XML 标签包裹、
  特定 tool-call schema）？相比"整文件重写"，增量 diff 如何降低 token 消耗和截断风险？
- 上下文管理：提示词里如何注入现有代码？全量注入还是检索相关文件？
  大项目如何避免超出上下文窗口？
- 依赖管理：模型如何决定装哪些包？版本冲突与幻觉包名（不存在的 npm 包）如何防？
- 已知失败模式清单：幻觉 import、循环报错、卡在同一个 bug、生成不完整文件、
  依赖装不上、把工作代码改坏。各自的业界缓解手段是什么？
- **Lovable 明确否决了复杂多智能体架构** —— 他们的替代方案是什么？
  为什么？Atoms 走的是相反路线（8 角色真并行），两条路的取舍在哪？
- 生成循环里"错误 → 自动修复"的重试策略：几次？什么条件下放弃？

## Answer

Resolved 2026-09-12. Sources: github.com/stackblitz/bolt.new source code, Lovable official blog.

**Correction: the "Lovable rejected multi-agent" claim is false.** Lovable's official blog
("Introducing subagents") shows they now create subagents in parallel for research/exploration.
Their architecture differs from Atoms — they use dynamic runtime-spawned subagents rather than
predefined named roles — but both converge on multi-agent. The Q7=c decision (single agent now,
interface for parallel later) is still correct, but the stated justification was wrong.

bolt.new's generation protocol is directly available in open-source code (stackblitz/bolt.new,
`app/lib/runtime/message-parser.ts`). It uses a structured XML envelope:
- `<boltArtifact>` wraps the whole response
- `<boltAction type="file" filePath="...">` carries complete file contents (whole-file rewrite)
- `<boltAction type="shell">` runs commands (npm install, dev server)

This protocol is production-validated, open-source, and directly adoptable for Forge's generation
loop. No need to design an output format from scratch.

Context management: full file injection up to a token budget, then degrading to file tree +
targeted files. No RAG in the base architecture — appropriate for weekend scope.

Full verified brief: `.scratch/forge-mvp/research/codegen-loop-prior-art-verified.md`