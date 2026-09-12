# 08 — 生成的应用如何取得数据库与登录

Type: grilling
Status: open
Blocked by: 04

## Question

依赖 ticket 04 的 Supabase 调研结论。待定的是**产品决策**：
用户在对话里说"要能登录、数据要持久化"之后，实际发生什么？

待定的决策：

- **接入模式**：用户自带 Supabase 项目（Atoms 路线，需 OAuth，摩擦大但用户掌控数据）
  还是平台托管一个共享后端（摩擦小但平台承担成本与合规）？
- 如果走 OAuth：用户没有 Supabase 账号怎么办？能否代建？
- 如果走平台托管：如何隔离不同用户生成的应用的数据？
- **生成时机**：是构建时就建好表，还是运行时首次访问再建？
- **密钥处理**：anon key 必然出现在前端代码里——这是可接受的吗？
  service role key 绝不能进前端，那么需要服务端逻辑的操作（发邮件、调第三方 API）
  如何实现？WebContainer 没有服务端，这个缺口怎么补？
- 如果生成的应用需要一个真正的服务端（如 Stripe webhook），
  本地图的终点要不要覆盖？还是明确记为"不支持，请自行部署"？
- 无后端应用的默认形态：纯前端 + localStorage？如何向用户解释数据会丢？

## Answer

<!-- filled on resolution -->
