# 01 — 额度账本与原子预扣

**What to build:** 平台 Postgres 里真实的额度账本，替掉恒放行。一个用户一天有固定点数；预扣原子完成（行锁 + 幂等键），结算退还差额，新的一天新行（不累积自然成立）。pglite 跑测试，同一套 SQL 跑生产。

**Blocked by:** None — can start immediately.

**Status:** done

- [ ] quota(user_id, day, reserved, spent) 与 credit_ledger(幂等键唯一) 建表
- [ ] reserve：当日行 FOR UPDATE + 上限校验；超限拒绝并返回 resetsAt（次日零点）
- [ ] 相同幂等键重复 reserve 只扣一次、返回首次结果
- [ ] settle：释放 reserved、累计 spent；中断（actual=0）全额退还且额度立即可再 reserve
- [ ] 跨日：新行新额度，旧余额不带入
- [ ] seam 测试全部打 pglite（真 PG 语义）；交错序列用顺序事务模拟（单连接诚实边界，注明）
- [ ] DAILY_CAP 与点数/token 换算是环境变量
