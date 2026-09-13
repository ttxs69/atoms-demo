# forge-projects — 项目管理（待评审）

**目的**：让登录后的用户能查看、编辑、删除自己创建的所有项目。匿名用户不受影响（继续按会话隔离）。

## 为什么之前没做

实现 forge-accounts / forge-core-loop / forge-gc 时只考虑了：
- 身份怎么建立（匿名 + 魔法链接升级）
- 一次生成怎么跑通（orchestrator + sandbox + LLM）
- 过期资源怎么清理（sandbox GC）

**没考虑**：
- "项目"在 Forge 数据模型里是什么
- 用户怎么列出自己所有项目
- 项目生命周期（draft / ready / archived / deleted）
- 项目文件怎么持久化（不依赖沙箱寿命）
- 多项目间的资源隔离（每个项目有自己的 sandbox_id、build 产物、preview）

这是 wayfinder 阶段的失误——把核心数据模型漏了。

## 数据模型

```
projects
  id              uuid          PK
  user_id         uuid          FK → auth.users（on delete cascade）
  name            text          用户给项目起的名字（默认取第一条 message 前 30 字）
  status          enum          draft | generating | ready | failed | archived
  sandbox_id      text?         当前关联的 e2b sandbox（活跃时非空）
  preview_url     text?         最近一次 preview 的 e2b URL
  file_count      int           文件总数（用于列表快速展示）
  created_at      timestamptz
  updated_at      timestamptz
  last_opened_at  timestamptz?  用于排序（最近活跃优先）

project_files (项目文件元数据)
  id              uuid PK
  project_id      uuid FK → projects (on delete cascade)
  path            text          例: src/App.tsx
  bytes           int
  storage_key     text          Supabase Storage 中的 key
  created_at      timestamptz
  UNIQUE(project_id, path)

project_events (事件流，调试用)
  id              uuid PK
  project_id      uuid FK
  kind            text          agent_started | tool_call_start | run_step | ...
  payload         jsonb
  created_at      timestamptz
```

**RLS**（行级安全）：
- `projects`：`user_id = auth.uid()` 才能 SELECT/INSERT/UPDATE/DELETE
- `project_files` / `project_events`：通过 `project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())`

## 存储位置

**共享 Supabase 项目**——和 forge-app-backend 共用一个 Supabase 实例（生成应用建表用的那个）。

为什么不是平台 Supabase：账号 Supabase 应该只管账号/credits/turnstile，和生成应用的数据混在一起分账困难。

新建表 + Storage bucket（`project-files`）。

## 预览生命周期

**重新 build 即可重新预览**（用户在 ask_user_question 中选的）。

- 项目持久化文件（Supabase Storage）
- sandbox 是临时的，build 完拿到 URL 后记录到 projects.preview_url
- sandbox 死了（GC 清理），URL 失效
- 用户点「预览」→ 后端启动新 sandbox → 把存储的文件 cp 进去 → install/build/start → 拿到新 URL → 写到 projects.preview_url

成本：每次点预览多花 30-60 秒。但 e2b 沙箱按秒计费，闲置时 0 成本。

## API 设计

```
GET    /api/projects              列出当前用户所有项目（按 last_opened_at 倒序）
POST   /api/projects              创建项目（带初始消息 → 触发 orchestrator）
GET    /api/projects/:id          获取项目详情 + 文件列表
PATCH  /api/projects/:id          更新名字 / 归档 / 取消归档
DELETE /api/projects/:id          软删除（status=archived，等 GC 物理清理）
POST   /api/projects/:id/preview  启动新 sandbox 重新 build 并预览
POST   /api/projects/:id/message  继续编辑（追加一轮 orchestrator）
GET    /api/projects/:id/files    列出文件
GET    /api/projects/:id/files/*  读文件
```

## 路由

- `/projects` —— 登录后默认页。项目网格视图（卡片：名字 + 状态 + 最后打开时间 + 缩略图占位）
- `/projects/:id` —— 项目详情/编辑页 = 当前工作区（chat + preview），但顶部多一个面包屑（返回项目列表）
- `/` —— 保持原样：匿名用户从这里开始（创建第一个项目时，如果已登录则关联到 user_id）

## 关键设计决策

### 1. 匿名项目 vs 登录项目

匿名会话继续走"会话内单工作区"模式（不变），不强制建账号。
**登录触发点**：当匿名用户点「升级保存」并完成魔法链接登录后：
- 找出当前会话的 sandbox_id / preview_url / 文件
- 创建 `projects` 行 + `project_files` 行
- 后续所有编辑归到这个 project_id 下

### 2. 软删除 + GC

`DELETE /api/projects/:id` → `status = 'archived'`，`updated_at = now()`。
GC 调度器（已有）定时清理 archived 时间 > 7 天的项目：删 Supabase Storage 文件 + 删 sandbox + 删数据库行。

### 3. 多项目资源限额

每个项目独立 sandbox（暂不共享 build cache）。GC 自动清理过期 sandbox。
每天 5 个项目上限（防止滥用）。超出返回 403。

### 4. 项目名

默认 = 第一条 message 前 30 字符（用 …… 截断）。
用户可在项目列表 / 详情页改名（PATCH）。

## 与现有系统的关系

| 现有 | 改动 |
|---|---|
| `forge-accounts` | 加 `getProjectOwnership(userId, projectId)` 辅助 |
| `forge-core-loop` | Orchestrator 接受 `projectId` 参数，事件写入 `project_events` |
| `forge-gc` | 加项目级 GC：archived 超 7 天清掉 |
| `forge-app-backend` | 不动（生成应用的表和项目表是分开的 schema） |

## 实现票（建议 8 张）

1. **数据模型迁移**：`projects` / `project_files` / `project_events` 表 + RLS + Storage bucket
2. **会话→项目升级**：匿名升级时把当前工作区转成正式项目
3. **项目列表 API**：`GET /api/projects` + 鉴权 + RLS
4. **项目 CRUD API**：POST / GET / PATCH / DELETE + 软删除
5. **预览重建 API**：`POST /api/projects/:id/preview`（启动新 sandbox + 重 build）
6. **项目级生成**：Orchestrator 集成 projectId + 事件持久化
7. **`/projects` 路由 + 列表 UI**：shadcn Card 网格、状态徽章、改名、重建预览
8. **GC 集成**：archived 项目清理 + storage 文件清理

## 风险与决策点

| 风险 | 决策 |
|---|---|
| 文件转存的瞬时一致性 | 升级时用文件 hash 校验，写失败回滚项目创建 |
| 多项目配额被绕开 | `/api/projects` POST 必须鉴权，service_role key 不能用 |
| 软删除被绕过 | 物理删除只在 GC 里，API 不暴露 hard delete |
| 升级后用户已不在线 | 升级是同步操作（魔法链接确认后立即执行），无 race |

## 不做什么

- ❌ 不做项目分享 / 协作（单用户）
- ❌ 不做项目 fork / 模板
- ❌ 不做真部署（Vercel/Netlify）—— 重新 build 即可预览
- ❌ 不做项目内版本历史（git for apps 太重）
- ❌ 不做拖拽排序 / 标签 / 收藏