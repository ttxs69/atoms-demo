# 03 — 生成路由接真额度

**What to build:** UNMETERED_CREDITS 占位被 PostgresCreditsPort 替换。设小 DAILY_CAP 连续生成，第 N+1 次在**任何副作用之前**被拦，UI 横幅显示"明天 0 点恢复"。本地/测试 pglite，生产 DATABASE_URL。

**Blocked by:** 01 — 额度账本与原子预扣

**Status:** ready-for-agent

- [ ] 路由按 DATABASE_URL（有）或 pglite（无）构造端口
- [ ] 预留失败：无模型调用、无沙箱、无文件写入（blocked_credits 路径，core-loop 已建）
- [ ] resetsAt 从端口流到 UI 横幅（已有渲染，接真数据）
- [ ] 结算真值来自 02 的计量（若 02 未合入则以 0 结算，注明）
- [ ] e2e：小上限下第 N+1 次请求被拦且横幅文案正确
