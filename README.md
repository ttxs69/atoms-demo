# Atoms 逆向分析与 Forge 产品设计

对 [Atoms](https://atoms.dev)（多智能体 Vibe Coding 平台，前身 MGX / DeepWisdom）帮助中心的
全量逆向分析，以及据此设计的对标产品 **Forge** 的 PRD、架构与实施地图。

## 内容

```
docs/
  01-atoms-core-features.md   核心功能总结（基于 62 篇官方文档全量抓取）
  02-prd.md                   Forge PRD（含 9 条差异化清单、5 个开放问题）
  03-architecture.md          Forge 架构设计（含 4 处未决选型）

research/
  atoms-help-articles/        Atoms 帮助中心 62 篇英文原文（抓取于 2026-09-12）
  crawl-atoms-help.py         抓取脚本，可复跑

.scratch/forge-mvp/           Wayfinding 地图：终点、决策索引、fog、tickets
  map.md
  issues/                     逐张决策 ticket
  research/                   各 ticket 的研究简报（无工具版 + 核验版）
```

## 方法

帮助中心原文从 `help.atoms.dev/sitemap.xml` 枚举（62 篇独立文章 × 17 种语言），
逐篇抓取并从 Next.js RSC 数据流中提取原始 Markdown，而非依赖页面渲染结果。

产品设计部分不直接照抄 Atoms：文档中标注了若干自相矛盾与过期内容，
以及 9 处可以做更好的地方（见 `docs/02-prd.md` 末尾的差异化清单）。

## 状态

处于 **wayfinding** 阶段 —— 终点是"一个陌生人能公开访问、用自然语言生成并预览 Web 应用的
核心闭环（含账号与用量限制）"。当前正在裁决的关键决策见 `.scratch/forge-mvp/map.md`。

> ⚠️ `research/` 下未标注 `-verified` 的文件产出时子 agent 未加载到联网工具，
> 内容为模型记忆而非一手来源，**不可作为决策依据**。详见 `research/README.md`。
