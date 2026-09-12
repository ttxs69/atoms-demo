# ⚠️ 这批简报未经来源核验 —— 不可作为决策依据

2026-09-12 charting 阶段派出的 5 个 `researcher` 子 agent **全部没有注册到联网工具**
（`web_search` / `fetch_content` / `get_search_content` / `source_check` 一个都没有）。

**证据**：r04（ticket 04）的 `events.jsonl` 里只出现过 `read` / `write` / `contact_supervisor`
三种 tool call，没有任何一次检索调用。5 份简报自身也都不同程度地自述了这一点。

因此本目录下的 5 份文件是 **模型记忆（recollection）**，不是抓取到的一手来源：

| 文件 | ticket | 自述强度 |
|---|---|---|
| `webcontainer-capabilities.md` | 01 | 有声明 |
| `webcontainer-licensing.md` | 02 | 声明醒目，且明确拒绝给出未核验数字 |
| `codegen-loop-prior-art.md` | 03 | **声明较弱 —— 最容易被误读为有据** |
| `supabase-per-user-apps.md` | 04 | 声明醒目，逐条标 `UNVERIFIED` |
| `browser-untrusted-code-threat-model.md` | 05 | 有声明 |

**允许的用法**：排列决策空间、生成待核验清单、判断哪个问题该问谁。

**禁止的用法**：把其中任何数字、许可条款、安全结论写进 `docs/`，或据此做 go/no-go 判断。

对应的 5 张 ticket 已回退为 `Status: open`，等待带检索工具重跑。

## 根因

`pi-subagents/docs/agents.md:410` —— "An allowlisted name does not load the extension that
registers it."：`researcher` 的 frontmatter 里 `tools:` 声明了这四个工具名，但**声明工具名不等于
加载注册它们的 extension**。`pi-web-access`（已安装，v0.29.0）需要通过 `extensions` /
`subagentOnlyExtensions` / path-like `tools` 条目显式加载，或者由 background child 走 ambient 发现。

本次是在一个 `workflowScript` 里用 `runs.all()` 派的子 agent，推测这些 child 相对 workflow 进程属于
foreground session —— 按 `agents.md:412`，foreground children 从不加载 parent 的 ambient extension。

值得注意的是：文档称此种情况"fails with a diagnostic that says exactly that"，但**实际观测到的是静默降级**
——工具不存在，子 agent 照常跑完并产出了看起来完整的简报。这是最危险的失败形态。
