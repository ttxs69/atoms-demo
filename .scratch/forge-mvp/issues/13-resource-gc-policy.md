# 13 — 资源 GC 策略

Type: grilling
Status: open
Blocked by: 07, 08

## Question

本 ticket 由 ticket 07（账号与用量限制）和 ticket 08（生成的应用如何取得后端）共同触发。
两个外购服务都不替我们回收资源，这已经被记录为一个跨系统的模式：

- **E2B**：paused 沙箱无 TTL、不自动删除，只有显式 `sandbox.kill()` 才释放
  （Hobby 层 10 GiB 存储，满了就无法新建沙箱）
- **Supabase**：匿名用户无自动清理，只能手动跑 SQL 删除
  （官方明确：*"Automatic cleanup of anonymous users is currently not available"*）

因此 **GC 是 Forge 自己要写的组件，且它跨两个外部系统**。

待定的决策：

### 保留策略

- **匿名用户**：ticket 07 已定 **30 天无活动即清理**（Q8=b）
  - 连带删除的内容范围？仅删 Supabase auth 用户，还是同时清理关联的工作区数据、Supabase 生成应用的 schema？
  - "无活动"的定义：最后一次生成？最后一次打开预览？最后一次 API 调用？
- **永久用户的工作区**：没有自动清理，但长期不活跃的 E2B 沙箱仍占存储
  - 沙箱是否需要独立于用户有一个自己的 TTL？
  - 停止计费后（若日后有计费）是否立即清理？

### 回收触发

- **(a) 定时任务**：每天凌晨跑一次清理 SQL + E2B `sandbox.kill()`。
  实现简单，但粒度粗（最多延迟 24 小时）
- **(b) 事件驱动**：用户明确删除项目时立即回收；定时任务只做"超龄"清理
- **(c) 仅手动**：管理员后台 + 按需清理。Demo 规模下可行但不可持续

### 清理顺序

多个资源有依赖关系，清理顺序错了数据会孤立：

1. 生成应用的 Supabase schema / 数据（如果是平台托管）
2. E2B 沙箱（`sandbox.kill(sandboxId)`）
3. 发布到子域的静态资产（如果有）
4. Forge 的 Postgres 记录（workspace、session、message、credit_transactions）
5. Supabase auth 用户（最后，否则 RLS 策略引用的 user_id 会变孤儿外键）

### 幂等性与失败处理

外部 API 调用可能失败（E2B 临时不可用，Supabase rate limit）。
清理任务需要是幂等的——重跑不会重复计费或重复删除。

### 和 ticket 07 Q8 的关联

票 07 选了"清理从一开始就激活"（Q8=b），而不是"先写好不启用"（Q8=a）。
这意味着第一版上线时 GC 就是真实运行的，不是占位符。

## Answer

<!-- filled on resolution -->
