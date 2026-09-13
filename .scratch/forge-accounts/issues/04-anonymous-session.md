# 04 — 匿名会话换血与 IP 转发

**What to build:** 打开即匿名登录（Supabase 平台项目，零表单），httpOnly 会话 cookie；生成路由不再信任客户端自报的 sessionId——身份只认 cookie，无会话 401。服务端 Supabase 调用带 Sb-Forwarded-For（secret key），防限流桶串号。需要先建平台 Supabase 项目（人工步骤）。

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] 客户端静默 signInAnonymously + 会话 cookie（httpOnly）由服务端建立
- [ ] 生成路由：无/过期会话 → 401（orchestrator 不被触达，fake 计数验证）
- [ ] sessionId = cookie 验出的 user id；请求体里的 sessionId 被忽略（有测试锁住）
- [ ] 路由处理函数当函数调的测试（传 Request，无需服务器）
- [ ] 服务端 Supabase 调用带 x-forwarded-for + secret key
- [ ] 认证相关页面不进静态优化（读 cookies 天然动态，页面级确认）
- [ ] .env.example 增 SUPABASE_URL/ANON_KEY/SECRET_KEY
