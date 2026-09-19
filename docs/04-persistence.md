# 04 — 对话与生成物的后端持久化（方案）

诊断于 2026-09-13，同日实现（见文末"实现纪要"）。
目标：刷新页面不丢对话，沙箱死亡不丢生成物。

---

## 1. 现状：易失状态清单

| 状态 | 现在住在哪 | 什么时候死 | 已有的不死资产 |
|---|---|---|---|
| 对话消息 | `workspace.tsx` 的 `useState` | 刷新 / 关标签页 | `project_events` 表（001 迁移建了，无人写入） |
| 生成物（文件树） | E2B 沙箱文件系统 | GC 14 天 / 沙箱被杀 / E2B 故障 | `buildZip()`（export 路由在用）、`project_files.storage_key` 字段 |
| 回合语义（planned / interrupted / gateFailed / 文件清单） | orchestrator 进程内 Map | 进程重启（靠 findSandbox + 读盘自愈一半） | 沙箱 `metadata.workspace_id` 标记 |
| 回合归属 | 匿名 `sessionId`（cookie） | 清缓存即丢 | 匿名身份可升级（ticket 07） |

结论：**不是没有存储，是没人往里写**。方案是接线，不是建仓库。

---

## 2. 设计原则（四个思想各自出一条硬约束）

**操作系统 —— WAL + checkpoint。**
对话 = 预写日志（append-only event log），每次事件落盘（write-through），代价低且崩溃后可重放。
生成物 = 检查点（checkpoint）：每个成功回合结束打一个快照，两次 checkpoint 之间的损坏最多丢"失败的那一个回合"，事件日志讲真话。
进程内的 Map 全部降级为**缓存**（热路径），Postgres / Storage 是冷路径真相——和虚拟内存换页一个道理，`sandboxFor()` 的 findSandbox 自愈就是已有的"换入"。

**计算机网络 —— 端到端原则 + 序列号。**
持久化是端到端 concern，不能信任中间媒介（浏览器、SSE 连接）替我们保管状态——流是传输，不是存储。
`text_delta` 是**线上编码**（wire encoding），不是存储记录：在服务端折叠成完整消息再落库，就像存储 TCP payload 而不是存储分段。
重放带游标（`seq`），断线重连/刷新从游标续读——序列号语义，不重传已收的。
落库幂等：回合带 `turnId`，重试去重，与 credits 的幂等键同一套思想。

**微服务 —— 无状态计算层 + 每类数据唯一真相。**
注意 CONTEXT 已定：**长驻单机，不拆服务**。取微服务的思想，不取它的拓扑：
- 计算 tier（Next.js + orchestrator 进程）随时可死可换，真相在 Postgres / Storage；
- 每类数据只有一个家：对话日志 → Postgres 行；生成物字节 → 对象存储；元数据 → 指向对象的 DB 字段。绝不同时两处；
- 通过 port 隔离（`JournalPort` / `SnapshotPort`），测试用内存 fake——与现有 `SandboxPort` / `GatePort` 同一模式。

**软件工程 —— event sourcing lite + 最短接线。**
`ForgeEvent` 已经是领域货币：**流出去什么就存什么**，不造翻译层，流与存永不漂移。
落库点选在 generate 路由的 for-await 循环（tee），orchestrator 对话侧零改动。
测试复用已在 devDeps 里的 PGlite，加一个重放测试。

---

## 3. 具体设计

### 3.0 迁移 005（唯一的 schema 变更；003/004 已被占用）

```sql
ALTER TABLE public.project_events
  ADD COLUMN IF NOT EXISTS turn_id text,
  ADD COLUMN IF NOT EXISTS seq bigint GENERATED ALWAYS AS IDENTITY;
CREATE UNIQUE INDEX IF NOT EXISTS project_events_seq_idx ON public.project_events(seq);
CREATE INDEX IF NOT EXISTS project_events_turn_idx ON public.project_events(project_id, turn_id);

INSERT INTO storage.buckets (id, name, public)
VALUES ('project-snapshots', 'project-snapshots', false)
ON CONFLICT (id) DO NOTHING;
```

`seq` 是重放游标（序列号）。事件写入走服务端 service key（绕 RLS，同时挡住客户端伪造事件）；读取走路由的属主校验（与 /api/projects 同模式）。

### 3.1 身份统一：回合以 project_id 为键

- `POST /api/generate` 增加可选 `projectId`；缺失时为当前用户取/建活跃项目（MVP 里 session ↔ project 1:1，正好对齐 CONTEXT 的"session id 兼任 workspace id"决策）。
- 沙箱 `metadata.workspace_id` 改打 project_id（`findSandbox` 沿用）。
- 这是全部接线工作的地基：事件和快照都要挂在它下面。

### 3.2 对话 = 事件日志（JournalPort）

```
JournalPort {
  appendTurn(projectId, turnId, records): Promise<void>   // 同回合先删后插 = 幂等重写
  replay(projectId, afterSeq?): Promise<Record[]>
}
```

落库记录（折叠后的，不是 delta）：

| kind | payload | 来源 |
|---|---|---|
| `user_message` | `{ text }` | 路由收到消息时记录 |
| `agent_message` | `{ agentHandle, text, files: [{path, bytes}], errors, creditsUsed, aborted }` | 按 handle 折叠 delta，`agent_done` 收口；tool_result 自带 path/bytes，无需重解析参数 |
| `run_error` | `{ message }` | 流外错误 |

Transient 事件（`run_step` / `plan_ready` / …）维持不落库——events.ts 已明文，不破坏。

落库粒度：**一条消息一行**（不是一条事件一行）；整回合流结束后一次 `foldTurn()` 批量追加（回合级批量，非逐事件 write-through——崩溃丢的恰好是失败回合，与故障表一致）。`turn_id` 复用 credits 幂等键，重试回合删旧插新，不产生重复行。单写者不变量顺带成立：事件在 `runQueue` 串行区里流出来，顺序天然有保证。
UI：`workspace.tsx` 挂载时拉取事件，重建与直播流同一个 Message 结构（transient 不重放，按契约）。

**已知天花板（ponytail 标注）**：硬刷新会丢"正在流式中的那半条消息"（折叠还没发生）。升级路径：SSE `Last-Event-ID` + seq 续传。做到日志重放已覆盖 99% 场景，先不做。

### 3.3 生成物 = 快照（SnapshotPort）

```
SnapshotPort {
  save(workspaceId): Promise<number>                       // latest-wins，返回文件数
  load(workspaceId): Promise<Map<path, content> | null>
}
```

- **save**：成功回合在 orchestrator 管线内、**turn 末 pause 之前的热沙箱上**执行（preview_ready 语义 = 已打点已就绪）；路由侧只回写 projects 行。最初的路由侧实现会与 pause 竞争——E2B connect 撞上 pause 迁移会无限挂起（AC2 e2e 抓出），且 listFiles('.') 递归 .npm 缓存同样会挂——两处均已修复。经 SandboxPort 收集文件树（排除 node_modules / 点文件 / lock 文件）→ `{ path → content }` JSON → 上传 `project-snapshots` 桶 `‹workspaceId›.json`（覆盖写）→ 更新 `projects.status='ready'` 与 `file_count`。
- **restore**：挂在 `sandboxFor()` 现有的 miss 分支——findSandbox 失败后，下载快照写进新沙箱并重建 sessionPaths 清单，下一迭代回合看到的是当前代码；失败降级为全新首回合。这是"换页换入"的完整化：现有自愈只救"沙箱还在"的情形，快照救"沙箱没了"。
- **为什么 JSON 不是 zip**：restore 要读回，zip 读回得手写解压器，JSON 两行搞定，同样遵守 zip 导出已有的纯文本约定。快照按 **workspace id**（非 project id）命名，与 deletion_queue 的键一致，GC 直接按行删对象。
- **不做** per-file `project_files` 行（001 建了表但每回合逐文件写库太啰嗦；zip 元数据列够用）。**不做**按回合版本化快照（回滚功能出现时再加）。

### 3.4 GC 接线

项目删除已走 `deletion_queue` 四目标；加第五目标 `storage_objects`（删桶对象）。快照桶无版本，删一行即净。

### 3.5 测试

- JournalPort / SnapshotPort 各一个内存 fake（`test/fakes/` 已有先例）。
- 一个重放测试：流一遍事件 → replay → 断言折叠正确（PGlite 跑真 SQL）。
- 一个冷恢复测试：fake sandbox 死亡 → restore → 文件回来。

---

## 4. 故障语义表

| 故障点 | 丢失什么 | 为什么可接受 |
|---|---|---|
| 浏览器刷新 | 正在流式的半条消息（天花板，见 3.2） | 日志重放覆盖其余 |
| 进程重启 | 无（Map 是缓存，DB 是真相） | 这正是本方案的目的 |
| 快照后沙箱死亡 | 无 | 冷恢复 |
| 回合中途崩溃 | 该回合的生成物（事件日志在） | WAL/checkpoint 语义：最多丢失败回合 |
| Storage 上传失败 | 本回合快照 | 下一成功回合覆盖；错误 surfaced 为 transient 事件 |

---

## 5. 分期（tracer bullet 顺序）

1. **事件落库 + 重放**（3.0 + 3.1 + 3.2）——最大可见收益：刷新不丢对话。
2. **快照 + 冷恢复**（3.3）——沙箱死了应用还在。
3. **GC 收尾**（3.4）——不留孤儿对象。

## 6. 待固化（决策留给用户）

- ~~快照策略：latest-wins 还是按回合版本化？~~ → **已定：latest-wins**（2026-09-13）。
- 项目列表页（`/api/projects` 已在）与 workspace 的合并方式：URL 是否带 `/projects/[id]` 直开。不影响本方案的存储层。

---

## 7. 实现纪要（2026-09-13，已落地）

- 迁移：`scripts/migrations/005-persistence.sql`（seq + turn_id + 快照桶）。部署时跑一次：`node scripts/apply-migration.mjs scripts/migrations/005-persistence.sql`。
- 对话：`src/journal/fold.ts`（纯折叠，`test/journal-fold.test.ts` 锁行为）、`src/journal/supabase-journal.ts`（适配器）、重放路由 `src/app/api/projects/[id]/events/route.ts`、水合在 `workspace.tsx`（identity 就绪后拉取）。
- 生成物：`src/ports/supabase-snapshot.ts`（save/load）；冷恢复在 orchestrator `sandboxFor()` miss 分支（`test/orchestrator.test.ts` 有回归）；路由侧 preview_ready 后 fire-and-forget 保存并回写 status/file_count。
- 身份：路由内 `resolveProject()`——最近打开项目，或以首条消息前 24 字命名新建；沙箱 metadata 仍打 workspace（session）id，不动现有 preview/export/GC 键。dev 会话（无 Supabase 身份）保持无持久化行为。
- GC：`storage_objects` 目标插在 sandbox 之后（`deleters.ts` 走 Storage REST 删除）。
- 与原方案的偏差均已回写上文：回合级批量落库、一条消息一行、JSON 快照按 workspace id 命名、projects 无新列（复用 status/file_count）。

---

## 8. 验收套件（AC1–AC3）

三条产品级验收标准，每条先写成可测规格，再映射到测试层；缺口用 e2e 补齐（persistence.spec.ts）。

### AC1 — 刷新不丢对话
> Given 一个真实身份完成过至少一轮生成　When 刷新页面
> Then 用户消息与 agent 回复全部可见（水合自 journal，非缓存）

| 层 | 用例 |
|---|---|
| 单测 | `journal-fold.test.ts`（折叠等价类，含自修复嵌套/中断/孤儿错误）· `journal-adapter.test.ts`（往返无损、幂等重写、游标） |
| e2e | `persistence.spec.ts` 种子回放（schema 往返 + 水合）· 完整链路（真实生成→刷新→对话仍在） |

### AC2 — 沙箱死亡应用还在（冷恢复）
> Given 一轮生成完成且快照已提交（projects.status=ready）　When 沙箱被杀死后用户发起下一回合
> Then 新沙箱从快照恢复文件树（src/App.tsx 内容与快照一致），回合正常完成

| 层 | 用例 |
|---|---|
| 单测 | `orchestrator.test.ts` 冷恢复（文件回写 + manifest 重建 + 不重规划）· load→null 降级首回合 |
| e2e | `persistence.spec.ts` 冷恢复（杀真实沙箱 → 迭代回合 → 断言 src/App.tsx 从快照回来） |

### AC3 — 登录后找回同一个工作区（对话 + 产物）
> Given 匿名身份生成过（对话与应用都在）　When 升级为邮箱账户并在全新环境重新登录
> Then 对话历史可见（marker 文本）且 workspace 预览恢复

| 层 | 用例 |
|---|---|
| 单测 | 身份链路：`otp.test.ts`（判定核）· `auth.test.ts`（verifier/cookie） |
| e2e | `journeys J6`（升级→清→登→预览恢复）· `persistence.spec.ts` 登录找回对话（J6 + 对话水合断言） |

### 已知天花板（验收口径内）

- 流式中硬刷新丢在途的半条消息（折叠未发生）——升级路径 SSE `Last-Event-ID` + seq 续传；
- AC2 快照为 latest-wins：失败回合的产物不进快照，丢失上限 = 失败的那一个回合（与故障表一致）。
