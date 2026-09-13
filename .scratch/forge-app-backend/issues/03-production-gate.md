# 03 — 生产 GatePort 与构建期 env 注入

**What to build:** GatePort 的生产实现：服务端以 secret key 对共享项目执行（事务内，门控不过即回滚）、Security Advisor 线上 API 扫描（error 级才拦，warn 进活动日志）、加 01 的检测器作双保险。生成应用的构建期 env（URL/publishable key/workspace id）由管线写入沙箱。

**Blocked by:** 01 — RLS 模板注入器与无 RLS 检测器

**Status:** ready-for-agent

- [ ] 生产实现可注入路由；无 APPS_SUPABASE_* key 时缺位降级（不崩，门控跳过并注明）
- [ ] advisor 结果分级：error 拦（code=规则号，detail=表与策略名填已有卡片）、warn 只记录
- [ ] 迁移执行包事务；门控失败回滚（已回滚文案与实际一致）
- [ ] 构建期 env 在 install 前写入沙箱；生成代码内无明文 key
- [ ] .env.example 增 APPS_SUPABASE_URL/PUBLISHABLE_KEY/SECRET_KEY（人工 provision 标注）
