# 决策：用 OTP 而非 magic link

## 原因
magic link 需要 Supabase 仪表板的 SITE_URL 配置，目前是 localhost，
无法通过 API 修改，会让邮件链接跳转到 localhost（用户实测确认过）。

OTP 6 位数字码：
- 用户用户输入邮箱 → 收到 6 位数字
- 用户在 app 里输入数字 → 登录
- 不需要 SITE_URL 配置
- 不需要浏览器跳转
- 体验类似"短信验证码"——主流大厂都用

## 妥协
OTP 比 magic link 多一步操作（用户得手动输入 6 位数字而不是点链接）。
但可靠得多。等用户改完 Supabase SITE_URL 后，可以加一个 magic link 选项。

## 数据流
1. 输入邮箱 → POST /api/auth/otp/request { email } → 服务端 supabase.auth.signInWithOtp → 邮件发 6 位码
2. 输入 6 位码 → POST /api/auth/otp/verify { email, code } → 服务端 supabase.auth.verifyOtp → 拿 session → 设 cookie
3. 客户端拿到 session 后跳 /

## 共享 Supabase
用户数据存在 APPS_SUPABASE（生成应用的项目）。这是 forge-projects spec 的目标。
但 forge-auth-session 是用哪个 Supabase？

账号用平台 Supabase（SUPABASE_URL，账号项目）。
项目数据用 APPS_SUPABASE（生成应用项目）。

不要混淆。

## 待办
- [ ] Supabase 仪表板 SITE_URL 改成 railway 域名（user 操作，wizard 引导）
- [ ] 加上 /auth/callback + magic link 选项
