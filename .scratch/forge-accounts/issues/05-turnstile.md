# 05 — Turnstile 人机验证

**What to build:** 看不见的 Cloudflare Turnstile 挡住脚本：匿名登录与生成提交两个入口都验。CaptchaPort 注入——生产真 siteverify，测试恒真 fake。site/secret key 人工从 Cloudflare 领取。

**Blocked by:** 04 — 匿名会话换血与 IP 转发

**Status:** ready-for-agent

- [ ] CaptchaPort { verify(token) }；生产实现调 siteverify
- [ ] 前端 invisible widget 产出 token 随两个入口提交
- [ ] 验证失败：匿名登录拒绝、生成提交 403（人话错误）
- [ ] 测试注入恒真 fake；无 key 环境跳过 widget（开发可用）
- [ ] .env.example 增 TURNSTILE_SITE_KEY/SECRET_KEY
