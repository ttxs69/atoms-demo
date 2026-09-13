# 06 — 升级永久账户

**What to build:** 满意了的匿名用户填一个邮箱即升级为永久账户——工作区、额度、对话全部保留（Supabase 原生，updateUser）。界面显示身份状态变化。占位级邮箱验证（不发验证邮件，Demo 取舍，注明）。

**Blocked by:** 04 — 匿名会话换血与 IP 转发

**Status:** ready-for-agent

- [ ] 升级端点：updateUser({ email })，JWT 的 is_anonymous 翻转
- [ ] UI 入口（额度横幅附近的"升级保存"）+ 邮箱输入
- [ ] 升级后：同一会话继续可用，工作区与额度无缝（e2e 或路由函数级验证）
- [ ] 身份状态在界面可见（匿名 / 已绑定邮箱）
- [ ] 不做邮件验证流转（Out of scope，文案不承诺已验证）
