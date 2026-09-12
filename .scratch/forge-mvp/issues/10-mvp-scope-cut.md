# 10 — MVP 范围裁剪

Type: grilling
Status: resolved
Blocked by: —

## Question

依赖已完成的三份研究（ticket 01/02/03）与沙箱重新裁决（ticket 12）。
这是通往终点的**主闸门**：一个周末能做完多少。

现在可用的确定性输入：
- **沙箱**：E2B，$100 一次性额度 ≈ 600 沙箱小时，pause/resume 持久化
- **生成协议**：Mastra + 原生 tool call（write_file / run_command）
- **上下文管理**：不做 RAG，文件树 + 预算降级
- **后端**：Supabase Platforms 模式，平台托管项目 + RLS 多租户
- **发布产物**：独立注册域的子域（架构已决策，实现推后）

待定的决策：
- 多轮迭代修改：MVP 必须有吗？
- 发布路径：MVP 是否包含？
- 可视化点选编辑：做不做？
- MVP 上几个角色？
- 生成的应用要不要后端？
- 给定以上五个，"一个周末"还成立吗？

## Answer

Resolved 2026-09-12。

### 决策摘要

| 决策 | 选择 | 关键理由 |
|---|---|---|
| 多轮迭代 | **有，但不含版本回滚** | 版本回滚要求 schema down-migration 可逆性验证，与 Q5=a 后端合并后精确复现 Atoms 踩过的坑（接入 Cloud 后禁用历史版本）。去掉回滚，保留多轮修改 |
| 发布路径 | **不做**；只有预览 + 导出 zip | 终点原文是"生成并预览"；E2B `getHost()` 几乎免费给出预览 URL；发布管道是独立工作量 |
| 点选编辑 | **不做**，纯自然语言修改 | 元素→源码映射在 React+Tailwind 编译后是真实硬骨头；产品价值是"能改"不是"怎么改" |
| 上几个角色 | **3 个**：`@lead`（Mike）+ `@pm`（Emma）+ `@eng`（Alex） | 能呈现"理解需求 → 定方案 → 实现"的可见链条；角色是声明式配置，随时可加 |
| 生成应用后端 | **有**：平台托管 Supabase 项目 + RLS 模板 | Q2 终点的原始承诺；ticket 04 调研已给出完整路径 |

**时间盒修订（路线 B 的代价）**：原"一个周末"是在不知道 license 问题、GC 是自建组件、schema 一致性约束的前提下定的。现在已知的必做项合计约 22 个独立工作项。AI agent 实现、LLM 不设限的前提下，**估算 3–5 个周末**（不是 1 个）。这不是范围失控，是信息更全后的诚实修订。

### 功能清单

#### 必须有

**基础闭环（12 项）**

1. E2B 沙箱生命周期封装：create / pause（`onTimeout: 'pause'`）/ resume（用户返回时）/ kill（GC 触发）
2. Mastra supervisor（Mike）：接收用户输入、分派、汇总产出与冲突呈现
3. `@pm` Emma：需求分析 → 输出结构化功能描述（不是完整 PRD，是给 Alex 的 spec）
4. `@eng` Alex：`write_file` + `run_command` 工具，Vite+React+Tailwind+shadcn 技术栈
5. 有界自修复循环：错误捕获 → 注入错误上下文重试 → 最多 N 次后放弃并报告
6. SSE 事件流：`ForgeEvent` 结构（agent_started / text_delta / tool_call_start / tool_input_delta / tool_result / agent_done / error）
7. 对话面板：流式消息、工具调用可见（文件名 + 内容流）、角色标识
8. 预览面板：E2B `getHost(3000)` URL → iframe，自动跟随沙箱状态
9. 代码查看器：文件树 + 语法高亮，只读
10. 多轮修改：同一会话内继续对话改应用（共享 Mastra thread，不另建机制）
11. 导出 zip：从沙箱文件系统打包，浏览器下载
12. 错误状态 UX：生成失败时显示"失败原因 + 下一步建议"，不只是 spinner 转没了

**账号与额度（7 项）**

13. Supabase 匿名认证 + Cloudflare Turnstile invisible
14. 数据库原子预扣（行锁 + 幂等键） + 生成完成后结算退差
15. 每日重置、不累积；拦截 UX 显示"明天 N 点恢复"
16. 认证页面强制动态渲染（Next.js 静态渲染缓存安全隐患）
17. 代理后的 `Sb-Forwarded-For` + secret key 配置
18. 匿名→永久账户升级（邮箱 `updateUser()`）
19. 极简管理面板：活跃会话数、今日生成次数、封禁管理

**生成应用的后端（4 项）**

20. 平台托管 Supabase 项目配置（`POST /v1/projects`，等待 `ACTIVE_HEALTHY`）
21. RLS 模板生成：template-owned、agent 不可覆盖（这条是安全约束，不是 UX）
22. `publishable` key 注入生成的代码（`secret` key 绝不进前端）
23. 生成的应用认证功能：Supabase Auth 供用户的应用登录

**资源 GC（2 项）**

24. E2B 沙箱 GC：30 天无活动自动 `sandbox.kill()`，幂等，不依赖内存状态
25. Supabase 匿名用户 GC：30 天无活动删除 auth 用户及关联工作区数据，幂等

#### 不做（Atoms 功能，这个地图明确 Out of Scope）

- 版本历史 UI / diff 视图 / 回滚（Q1 降级，避免 schema 一致性死结）
- 点选编辑 / App Viewer 属性面板（Q3=b）
- 发布到永久子域（Q2=b；架构决策已就位，实现推后）
- `@data`（David）、`@research`（Iris）、`@seo`（Sarah）、`@ads`（Adrian）、`@arch`（Bob）
- Race 模式
- GitHub 集成与导出
- 自定义域名
- 计费与订阅
- 团队工作区

#### 待解锁（尚未 grilling 的票）

- **ticket 08**：生成的应用如何取得数据库与登录 ← 上面 20-23 是预设答案，需确认细节
- **ticket 09**：生成循环 UX（骨架屏时序、工具调用可见性、错误表现）← prototype 类型
- **ticket 11**：对话 + 预览界面布局 ← prototype 类型
- **ticket 13**：资源 GC 策略 ← 24-25 是预设答案，需确认清理顺序与失败处理

### 从这里开始的顺序

08 → 09/11 并行（prototype）→ 13 → 实现

ticket 08 应该最快：ticket 04 的 Supabase 调研给了完整路径，主要决策是"共享单项目 + RLS"还是"每用户独立项目"，以及 agent 生成的 schema 如何防止被 agent 自己覆盖。

### 架构文档需要更新的内容

`docs/03-architecture.md` 有几处设计基于 WebContainer 和自研 BaaS，本轮已全部替换：
- §3 沙箱层：gVisor/k8s → E2B
- §5 发布：保留决策（独立注册域子域），移除周末内实现的预期
- §6 认证：加 Supabase 匿名登录的 Next.js 动态渲染约束

### 证据

所有证据已落在各 research ticket 的核验版简报中，不在本票重复。
