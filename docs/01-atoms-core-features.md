# Atoms 核心功能总结（基于官方帮助中心全量文档）

> 研究方法:从 `https://help.atoms.dev/sitemap.xml` 枚举出 62 篇独立帮助文章(17 种语言的同一套内容),
> 逐篇抓取并从 Next.js RSC 数据流中提取原始 Markdown 正文。原始语料存放于 `research/atoms-help-articles/`。
> 每个结论均标注来源文章 slug,可回溯到 `https://help.atoms.dev/en/articles/<slug>`。
> 抓取时间:2026-09-12。

---

## 一、产品定位

Atoms 是一个 **多智能体协作的 "Vibe Coding" 平台**:用户用自然语言描述需求,平台调度一支拟人化的
AI 专家团队完成需求分析、架构设计、编码、数据处理、调研、SEO 与投放,最终一键发布为可访问的 Web 应用。

- 目标用户明确 **不需要编程经验**,自然语言即可;技术用户也可指定框架/库/API 结构(`12129501-before-you-start`)
- 可交付物范围:个人网站、落地页、作品集、Web App、数据看板、计算器、小游戏、演示文稿、研究报告(`12129503-project-scope-capabilities`)
- 明确 **不支持** 原生 iOS/Android 二进制与桌面可执行文件;移动端通过 PWA + 响应式实现(同上)
- 生成技术栈:TypeScript + Tailwind CSS + shadcn/ui(同上)
- 品牌沿革:文档中大量残留 `MGX` 旧品牌与 `support.mgx.dev` 链接,DNS 校验记录仍为 `_mgx_verify`,
  可判断 Atoms 是 MGX(DeepWisdom / MetaGPT 团队)的品牌升级(`12129347-stripe-connect`、`13362391-connect-and-manage-domains`)

---

## 二、AI 智能体团队(产品的灵魂)

八个拟人化角色,各有名字、头像、人格化自述与专属能力边界(`12129380-your-agents-team`、`12174308-communicating-with-agents`、`14342754-adrian-ads-agent-for-automated-campaigns`)。

| 角色 | 定位 | 核心能力 |
|---|---|---|
| **Mike** | 团队负责人 | 需求协调、任务分派、全流程监督、实时联网获取信息、闲聊 |
| **Emma** | 产品经理 | 撰写 PRD、需求分析、功能优先级、用户旅程地图、市场调研 |
| **Bob** | 系统架构师 | 技术蓝图、微服务、云基础设施、API 集成、可靠性/扩展性设计 |
| **Alex** | 全栈工程师 | 编码、组件构建、Bug 修复、前后端(如 Supabase)、部署 |
| **David** | 数据科学家 | 数据处理、机器学习、网页抓取、文档分析、可视化图表、样例数据 |
| **Iris** | 深度研究员 | 多源检索、来源核验、生成可追溯的结构化报告 |
| **Sarah** | SEO 专家 | 多语言 SEO 内容、meta 标签、sitemap、收录优化 |
| **Adrian** | 广告投放代理 | Google Ads 广告文案/计划自动生成、转化追踪、实时优化 |

交互约定:

- **`@` 提及**:Team Mode 下输入 `@` 唤出智能体下拉列表,可 **同时 @ 多个** 智能体;平台将请求 **分别** 发给每个被提及的智能体,各自独立并行执行(`12129477-using-multiple-agents`)
- 不 @ 任何人时,由 Mike 自动判断并分派给最合适的成员(同上)
- Engineer Mode 下输入 `@` 会提示先切换到 Team Mode(同上)
- 沟通建议:复杂任务先做 MVP 再逐模块迭代;用 Markdown 结构化表达目标/细节/示例;给正向反馈(`12174308-communicating-with-agents`)

---

## 三、四种运行模式

来源:`12129385-mode-switching-guide`、`12129504-race-mode`、`12136255-deep-research`、`13285922-glossary-key-terms-for-vibe-coding`

| 模式 | 参与者 | 特点与约束 |
|---|---|---|
| **Engineer Mode** | 仅 Alex | 快、省 credits,适合简单站点/原型/Demo |
| **Team Mode** | 多智能体 | 覆盖市场调研、数据分析等广泛场景,产出类型更丰富,消耗更多 credits;`@` 提及与 Sarah、Iris 仅在此模式可用 |
| **Race Mode** | 多个 LLM 并行 | 同一 prompt 跑多模型/多版本,横向对比后择优;**仅 Max 用户**;耗时 5–10 分钟;可 Stop 后手动或让 Agent 择优;选定后其余结果被丢弃以节省存储;**与 Supabase / Stripe 集成项目互斥**;与 Deep Research 互斥 |
| **Deep Research (DR)** | Iris 主导 | 生成学术/商业/市场级报告,每个论点附可点击溯源的引用编号;一键转成网站/PPT/PDF/Docs;**仅 Team Mode 可用**;**每条消息或 Remix 后自动关闭**,需手动重开;关闭 DR 后才能用其他模型 |

模式切换入口:输入框左下角的 Mode Switch 按钮;新会话记忆上次选择;项目进行中可随时切换;
App World 项目详情页的标签栏展示该项目所用模式;Remix 继承原会话模式。

---

## 四、多模型选择(LLM Router)

来源:`12129349-choosing-llms`

内置 5 个可选模型,默认 `Auto`,可点齿轮图标打开 AI Model Selector 手动指定:

| 模型 | 优势 | 劣势 | 适用 |
|---|---|---|---|
| Claude Sonnet 4 | 最稳定准确,复杂推理与精致产出 | 成本最高 | 生产级应用、高要求网站 |
| GPT-5 | 质量与推理力均衡,长文档处理好 | 响应最慢 | 技术文档、研究报告 |
| Qwen3-Coder-Plus | 比 GPT-5 更快更便宜,编码可用 | 关键项目可靠性一般 | 预算内编码、头脑风暴 |
| Gemini 2.5 Pro | 很快,擅长摘要与结构化报告 | 风格易重复 | 快速原型、会议纪要、代码摘要 |
| DeepSeek V3 | 成本最低 | 深度与一致性不足 | 快速实验、粗稿 |

一句话选型指引:"要质量选 Claude,要便宜选 DeepSeek,预算内编码选 Qwen,要快选 Gemini,要均衡选 GPT-5"。

---

## 五、构建工作区(核心交互界面)

### 5.1 对话区
- `#` 引用工作区文件/资产(下拉自动补全);`+ Add` 上传文件/文件夹(单文件 ≤100MB);图片可 `Ctrl+V` 直接粘贴;上传后以 `# 文件名` 形式出现在输入框(`12129487-project-file-management`、`12175569-how-to-modify-files-or-content`)
- 支持导入本地既有项目:zip 拖入对话 → 让 Alex 解压到 workspace → 让智能体先读 `README.md` 再提需求(`12129487-project-file-management`)
- **随时打断**:点对话框或终端块左下角的 stop 图标暂停;或直接在聊天里给新指令,智能体会在后续步骤中吸收反馈(`12175565-how-do-i-correct-an-agent-s-work`)
- 消息 `...` 菜单 → Feedback 可带 Chat Link + 截图上报支持团队(`12129264-issue-report`)

### 5.2 App Viewer(实时预览 + 可视化编辑)
来源:`12129698-app-viewer`
- 智能体完成任务后自动出现在页面顶部,数秒到 1 分钟加载;超 2 分钟可点 Refresh
- Desktop / Tablet / Mobile 三档设备视图切换;可在新标签页打开
- **点选即改**:点击预览中任意元素,左侧弹出可视化编辑器,可改颜色、间距(padding/margin/gap)、字体(字号/字重/字族)、布局(对齐/flex/grid)、文本内容,改动即时生效
- 编辑器含 **Library 标签页**,可浏览并插入预制图标、图片、UI 组件
- 也可纯自然语言描述改动("把背景调暗一点")

### 5.3 Editor(代码工作区)
来源:`12175569-how-to-modify-files-or-content`、`12129487-project-file-management`、`12129483-deployment-options`
- 右侧导航进入,Files 文件树浏览
- 修改行与新生成文件在编辑器中高亮标注(diff 视图)
- Copy Code 按钮 / `Cmd+A` `Cmd+C` 复制
- 目录右键 Download、单文件下载、左上角全局 Folder 图标下载 `chats` 目录内容
- 打开 `index.html` 后点左下角 Play/Preview 图标可启动交互式预览
- 直接改代码是 **Pro/Max 权益**(`12129498-plan-comparisons-details`)

### 5.4 Terminal / Console 面板
- Terminal:实时展示智能体在做什么(建文件、生成代码、报错)(`12129698-app-viewer`)
- Console:构建期系统日志与错误信息,红色报错含描述、文件与行号、调用栈(同上)

### 5.5 Issue Report(一键修错)
来源:`12129264-issue-report`
- 构建出错时左下角弹出通知:错误简述 + `Resolve` 按钮 + 展开查看详细日志
- 点 `Resolve` 由 AI 自动分析并修复全部已识别 Bug,通常 1–3 分钟;**必须等一次跑完再点**,重复点击会产生重复任务
- 修完预览自动刷新;若未更新先刷新浏览器(缓存问题)
- 页面卡死且无 Resolve 按钮时,走 `...` → Feedback 上报

---

## 六、版本、Remix 与协作

### 6.1 Remix(克隆式分叉)
来源:`12129010-remix`
- 把任意项目复制成新会话,得到当前状态的精确副本,不影响原项目
- 入口三处:App World 公开项目、项目内版本框、History 中任意历史版本
- 未接 Atoms Cloud 时 **免费**;接了 Atoms Cloud 则消耗 credits
- 两个核心用途:① 学习/复用他人公开项目 ② **会话过长(如 >10 个版本)时重置上下文**,保留代码但清空历史,显著降低每次请求的 token 成本与延迟
- Remix 会继承原会话模式;**Supabase 连接会断开需重连**;已接 Supabase 的他人公开项目不可被 Remix

### 6.2 版本管理
- History 版本列表,可从任意版本 Remix 分叉(`12129010-remix`)
- 发布时可选 **Always Latest**(自动跟随最新构建)或 **Specify Version**(锁定某版本,便于私下继续开发)(`12129484-publish`)
- **注意**:接入 Atoms Cloud 后为避免库表结构与代码错配,**历史版本被禁用**,只保留最新构建(`13036940-atoms-cloud`)

### 6.3 团队工作区
来源:`12129353-team-workspace`
- 注册即有默认 workspace;Pro/Max 可邀请 **无限成员**;Free 仅 1 席(仅 Owner)
- Settings → People 批量粘贴邮箱邀请;状态 `Invite sent` → `Active`
- 两种角色权限矩阵:

| 权限 | Editor | Owner |
|---|---|---|
| 在 Chat 中给智能体发消息 | ✅ | ✅ |
| 编辑代码文件 / 使用可视化编辑器 | ✅ | ✅ |
| 修改工作区名称/头像/描述 | ❌ | ✅ |
| 邀请 / 移除成员 | ❌ | ✅ |
| 管理套餐与集中计费 | ❌ | ✅ |
| 管理集成(如 Stripe) | ❌ | ✅ |

- **集中计费 + 共享 credit 池**,People 列表按成员展示 Total Usage
- 同一 Chat 页支持 **多人实时同时** 与智能体交互,历史消息按头像/昵称区分
- 一个用户可加入多个 workspace,左上角头像处切换

---

## 七、发布与分发

### 7.1 Publish
来源:`12129484-publish`
- 右上角 Publish 生成稳定公开链接;发布后按钮变为 **Update** 用于推送新改动
- 左下角 Unpublish 下线
- Pro/Max 可关闭 "Built with Atoms" 角标
- 推送到 GitHub/GitLab 两种方式:① 下载源码手动上传(官方推荐)② 把仓库 URL + Personal Access Token 交给智能体,由其自动 commit/branch/push(GitLab 需公网可访问域名)

### 7.2 Share
来源:`12129279-share`
- **Export**:打包全部代码与资产为 .zip 下载
- **权限三档**:Public(任何人可看会话与界面,默认进入 App World)/ Secret(仅有链接者可访问)/ Private(仅自己)
- **社交分发**:一键发布到 X、Instagram、LinkedIn、TikTok,带预格式化文案与预览卡
- **App Card**:自定义封面、标题、发布版本、项目描述
- 安全提醒:分享到 App World 后 **全部会话历史与代码对社区公开**,须先清除敏感信息、密码、API Key
- 已分享 v2.0 后继续开发 v3.0,App World 仍展示 v2.0,可选择用 v3.0 替换;需完全隔离则用 Remix

### 7.3 App World(社区展厅)
来源:`12129279-share`、`12129010-remix`、`13285922-glossary`
- 创作者作品展示平台:展示作品与 prompt 工程技巧、被他人学习与 Remix、获得反馈与官方奖励/推荐位
- 项目详情页展示所用模式标签(Engineer / Team)

### 7.4 域名管理
来源:`13362391-connect-and-manage-domains`
- 首次发布分配随机子域(如 `1r945lo.atoms.world`),可在 Publish 窗口的 Connected Domains 处改名为 `alex.atoms.world`
- **绑定已有域名**:Settings → Domains → Connect Existing Domain,填域名后系统尝试识别服务商;不支持自动时手动加两条记录:
  - `A` 记录指向网关 IP(文档示例 `107.150.101.9`)
  - `TXT` 记录用于校验,host 规则:根域 `_mgx_verify`;子域 `_mgx_verify.<子域前缀>`
  - 校验命令:`ping <domain>` 与 `nslookup -type=TXT _mgx_verify.<domain>`
  - DNS 最长 48 小时生效
- **购买新域名**:Settings → Domains → Purchase New Domain,搜索可用性与价格,通过合作方 **IONOS** 结账
- **Primary Domain**:多域名时用星标设主域,其余地址 301 到主域
- ⚠️ 该文末尾残留一条自相矛盾的旧 FAQ("目前不支持绑定自定义域名"),应视为过期内容

---

## 八、后端能力:两条并行路线

### 8.1 Atoms Cloud(自研一体化 BaaS)
来源:`13036940-atoms-cloud`
定位:解决 vibe coding 的"最后一公里",把 Demo 变成可上线产品。六大能力:
1. **Database**:高可靠内置库,管用户数据、商品目录、订单历史
2. **Auth**:注册/登录/权限/会话,支持邮箱密码与社交登录(如 Google)
3. **Payments**:Stripe 一键接入收款
4. **Custom Domains**:绑自有域名
5. **API Key Management**:安全生成与管理第三方密钥
6. **AI Integrations**:原生支持 LLM 与 AI Agent,可把智能嵌入后端逻辑

特性:自动探测项目后端需求并自我配置;**Zero DevOps**(无需管服务器、库、SSL、域名);前后端联通自动完成
(用户提交表单 → 智能体自动写库;用户注册 → 自动建 Auth 记录)。
计费与可见性:Free 限 1 个后端项目,Pro 无限;Pro/Pro+ 项目默认 **Private**,Free 默认 **Public**(需升级才能转私有)。

### 8.2 Supabase Connect(外部 BaaS)
来源:`12129788-supabase-connect`
- 解决"数据只存在浏览器内存、刷新即失"的问题
- 连接流程:Settings → Connectors → Supabase → Connect → 弹窗登录 Supabase → 选组织 → **Authorize Atoms** → 选已有项目或 `+ Add New One`;授权后 Atoms 自动抓取库结构、表、安全设置,出现 "Supabase Connected"
- **Auth**:内置引导两种方式 —— 邮箱密码、Google 社交登录(含完整 Google Cloud OAuth 配置指引:建项目 → 配同意屏 → 建 OAuth Client ID → 回调 URI 填 Supabase 的 → 把 Client ID/Secret 填回 Supabase Providers)
- **数据存储**:自然语言描述要存什么("确保新的行程记录保存到数据库"),智能体自动建表并接进 UI;支持与 Supabase Table Editor 双向实时同步验证
- **Edge Functions**:靠近用户的 Serverless 后端,用于注册后自动发欢迎邮件、表单提交后调 AI API 打分、对接第三方支付并记录订单等
- **密钥管理**:函数需要密钥时智能体弹出 `Add API Key` 按钮,填入后加密存进 Supabase Edge Functions Secrets Manager,运行时注入,不落明文;**Atoms 自身无法读取**
- 约束:每个 chat 同时只能连一个 Supabase 项目;一个 Supabase 组织与一个 Atoms 账号 **1:1 OAuth 绑定**(被他人绑过会报 "organization has been bound by another user",需去 Supabase Settings → API → OAuth Apps 删除旧授权);Free 版 Supabase 项目 7 天无活动会被暂停,需在 Inactive 筛选中查看;Remix 后连接断开

### 8.3 Stripe 支付
来源:`12129347-stripe-connect`
- 前置:项目已连 Supabase + Stripe 后台已建好 Product 与 Price
- 自然语言描述订阅方案(如 "$4.99/周、$14.99/月、$149.99/年"),智能体生成配置按钮
- 依次填入 `STRIPE_SECRET_KEY`、各方案的 `*_PRICE_ID`、`Stripe Webhook Secret`
- Webhook 事件:`checkout.session.completed` / `expired` / `async_payment_succeeded` / `async_payment_failed`;
  端点 URL 取自 Atoms 中 `View Edge Function` → 带 `_webhook` 后缀的函数详情页
- **Preview 模式无法测支付**(本地环境无公网 Webhook URL),必须部署后用 Stripe Test Mode + 测试卡 `4242 4242 4242 4242`
- 安全红线:**绝不要把 secret key 直接粘进聊天**,必须走 `Add API Key` 按钮

### 8.4 GitHub Connect
来源:`13222322-github-connect`
- **仅 Pro+ 可用**;工作区右上角 Integrations 下拉或 Settings 面板启用,登录 GitHub 并授权
- 需在 Atoms 内 **手动创建仓库**,之后每个里程碑用 **Push** 同步,用 **Pull** 拉回远端更新
- 心智模型:Atoms 是"活跃工作区",GitHub 是"最终归档与协作中心";阶段稳定后再 Push,避免频繁同步打断

### 8.5 第三方连接器(MCP 生态)
来源:`15112407-connect-and-use-integrations`
- 统一入口:Settings → Connectors → 选连接器 → Connect → `+ Connect` → 外部登录 → **审阅并批准所需权限** → 确认已连接
- 可用动作取决于服务、连接器与用户批准的权限范围
- 已上线三个,均指向各自的 MCP server 文档:
  - **Linear**:按团队/状态/负责人/标签/优先级/项目查找与总结 issue、创建 issue、更新字段、生成 sprint 计划/站会摘要/发布说明
  - **Asana**:跨项目搜索汇总任务、从会议记录创建任务、更新任务详情、识别逾期/阻塞/未分配工作
  - **Todoist**:从消息/笔记创建任务、按项目/标签/优先级组织、设置周期提醒、拆解大目标
- 提示技巧:请求中带上项目名、任务名/ID、日期范围、负责人、状态/优先级,结果更准

---

## 九、增长模块

### 9.1 SEO
来源:`12129510-search-engine-optimization-seo`
- Sarah 两种触发方式:`@Sarah` 直接提及;或 prompt 中显式提到 `SEO` 关键词(构建完成后自动排一次 SEO 扫描)。仅 Team Mode 可用
- 自动产出 meta 标签、canonical URL、`sitemap.xml`
- 完整 Google Search Console 落地流程:URL prefix 添加属性 → 选 **HTML Tag** 验证 → 把 meta 标签交给智能体插入首页 `<head>` → 等 5–10 分钟点 Verify → Sitemaps 提交 `sitemap.xml` → 新页面用 URL Inspection 手动 **Request Indexing** 抢占抓取队列

### 9.2 Marketing 模块(GA4 数据分析)
来源:`14057591-marketing-module-guide`
- 前置:Google 账号、已建 GA4 属性(注册时 **不可跳过第 5 步"开始数据收集"**)、站点已有域名或临时域名
- 流程:先发布并配域名 → Marketing 模块授权 GA4 → 在 GA 中配置站点 → 若检测到 `index.html` 缺少 GA4 脚本,点 check status 由智能体自动注入 `gtag.js`
- 监控口径:流量来源与用户获取、跨页行为、高价值访客识别、活动优化
- **SEO 运营看板** 指标:Total Indexed Pages、Clicks、Impressions、CTR、Position;平台会自动向 Google Search Console 提交,失败可手动连接

### 9.3 Adrian 广告投放
来源:`14342754-adrian-ads-agent-for-automated-campaigns`
- 模拟专业营销经理工作流:自动抽取产品与落地页信息 → 生成广告文案与 campaign 计划 → 审批后实时监控与持续优化
- 五步:发布产品拿到公开 URL → 理解真实花钱的成本含义 → 连接(或新建)Google Ads 账号 → 自动配置转化追踪 → 上线并在看板追 CTR / 花费 / 转化 / 受众画像(年龄性别)
- **约束:按域名投放,每个自定义域名只能绑一个 chat**;Remix 后需先从旧 chat 解绑域名再绑到新 chat
- 适用场景:冷启动、新品上线、MVP 验证;最佳实践是小预算验证 → 依早期数据迭代文案 → 先保证转化追踪准确再放量

---

## 十、商业化体系

### 10.1 Credits(智能体服务的通用货币)
来源:`12129499-credit-management`、`12164701-credits-usage-instructions`、`12130438-optimizing-credit-usage`
- 三种来源:每日赠送(15/天,每月上限 25)、订阅额度、奖励(推荐返利、兑换码、客服补偿)
- **扣减优先级**:每日免费 → 订阅额度 → 奖励额度
- 每日额度在 **00:00 America/Los_Angeles** 重置;月内累计触顶 25 后暂停日刷新,直到下个计费周期
- **结转规则**:仅以下四类可结转,且 **只保留一个月**,不无限累积 —— 月订阅中途升级产生的未用额度、特殊情况赠送额度(不含每日 15)、推荐奖励、兑换码额度。取消付费订阅则全部未用额度在当期结束时清零
- 余额查看:Settings 中深紫色区为剩余、灰色区为已消耗,进度条旁有精确数值
- 补偿政策:**不予补偿** AI 产出质量不佳/自定义 prompt 导致的问题、用户环境问题、计划内维护、限流、第三方服务中断;补偿仅发 credits 且不可兑现金

### 10.2 套餐
来源:`12129498-plan-comparisons-details`

| | Free | Pro | Max |
|---|---|---|---|
| 价格 | $0 | 从 $20/月起 | 从 $100/月起 |
| 每日赠送 | 15/天(月上限 25) | 15/天(月上限 25) | 15/天(月上限 25) |
| 月额度 | — | 100 / 250 / 350 | 500 / 1000 / 1500 / 2500 / 3750 / 5000 / 6000 / 7500 / 10000 |
| 磁盘 | 2 GB | 10 GB | 100 GB(对比表另处写 40GB,官方文档自相矛盾) |
| 算力 | 基础 | 基础 | Pro 的 2 倍 |
| 私有项目 | ❌ | ✅ | ✅ |
| 数据下载 | ❌ | ✅ | ✅ |
| 去角标 | ❌ | ✅ | ✅ |
| 直接改代码 | ❌ | ✅ | ✅ |
| Race Mode | ❌ | ❌ | ✅ |
| 团队成员 | 1 席 | 无限 | 无限 |

- **年付**:首档 21% 折扣 / 非首档 18%;额度按 12 期等额发放;当年内未用额度自动结转(上限为年度额度);续订时上一年度未用额度可转入新周期
- **升级** 立即生效、只补差价、**不重置计费周期**;**降级** 在当前周期结束后次日生效、不退款,若磁盘缩水系统会提前提醒导出或清理
- 年付一旦开始计费 **不可退款**

### 10.3 Cloud & AI Wallet(用量后付费钱包)
来源:`14432563-cloud-ai-wallet`
- 三种余额:**Cloud & AI 钱包预付余额**、**Cloud 免费额度**、**AI 免费额度**
- 充值:$10–$1,000(预设或自定义),支持信用卡/借记卡、Amazon Pay、Alipay;成功即时到账
- AI 钱包在 **预览与生产** 双环境都会消耗(文本/图像/视频生成等);**免费 AI 额度为 $1**,用尽必须充值
- **风控双闸**:
  - Balance Alerts:余额低于阈值(默认约 $5)发邮件/站内通知
  - Monthly Limit:月度总花费上限(默认 $500,Cloud+AI 合并计算),触顶后可选 **暂停所有应用**(默认)或 **仅通知**;调低到低于当前用量会立即生效并可能暂停应用
  - 明确声明月度上限是 **风险控制而非硬性熔断**,实际账单可能略微超出(后付费计费、存储按小时计费、阈值判定时机)
- Usage 标签:AI 与 Cloud 用量汇总(Cloud 再细分 Compute / Storage / Network / Other),**按项目** 展示并可直接跳进对应 Chat 调整配置;数据每日 UTC 00:00 更新
- Transactions 标签:只记录资金流动(手动充值、自动充值、平台赠送额度、退款/调整),不含用量明细
- **Free 用户不能充值**,必须先升级到 Pro/Max

### 10.4 联盟推广
来源:`12129496-affiliate-participation-guide`、`12129495-affiliate-marketing-policies`、`12129497-payouts-withdrawals`、`12128527-affiliate-terms-of-service`
参与指南、推广内容合规政策、佣金提现流程与联盟服务条款四篇构成完整的分销体系。

---

## 十一、运行环境与运维约束

- 运行环境本身 **已是容器**,不建议嵌套容器(`12129485-environment-extensions`)
- 可连接外部设备,但 **配置文件必须放 `/data` 目录**,其他目录在环境回收时会被清空(同上)
- 磁盘管理:Settings → General → Disk Space → Manage 查看用量;在 Projects 页删除无用 chat 时需勾选 **"Delete disk space"** 才真正释放(`12129493-code-file-management`)
- "系统文件损坏" 的四级排障阶梯:刷新+查网络 → 清浏览器缓存(给出 Chrome/Safari/Firefox 具体路径)→ 释放磁盘 → Remix 回退到可用版本或联系支持(同上)
- 长文件治理:提示 Atoms 把巨型单文件拆成小模块与工具模块(同上)

---

## 十二、帮助中心本身的产品形态

这既是内容,也是需要复刻的一个子系统:

- **17 种语言** 全量本地化(`ar/de/en/es/fr/id/it/ja/ko/nl/pt-BR/ru/sv/tr/vi/zh/zh-TW`),同一 slug 跨语言共享
- 六大入口分类:入门指南、功能、集成、技巧与窍门、套餐与账单、更新日志
- 搜索 + **AI 助手问答**("Ask anything or search the docs" / "Ask Assistant")+ 联系人工支持 + Discord 社区三条求助路径
- 文章页:摘要、更新日期、右侧 **On this page** 锚点目录(桌面 ≥1280px 显示)、`<AccordionGroup>` 折叠式 FAQ、相关文章推荐、面包屑
- 亮/暗/跟随系统三种主题,通过 cookie + localStorage + URL query 三级读取
- 技术实现:Next.js App Router(`/[locale]/articles/[articleSlug]`),RSC 流式渲染,Tailwind 语义化 design token(如 `textNeutralWhite60`、`bgBaseDefaultLow`),静态资源走 `public-frontend-cos.metadl.com` CDN,内容图片走 `/api/public/assets?key=...`
- 内容源:文章 ID 与资产路径中含 `intercom/<id>`,可判断内容是 **从 Intercom 迁移** 而来
- 更新日志按月/按日组织,分 New Features / Improvements / Bug Fixes 三段,覆盖 2025-03 至 2026-07

---

## 十三、值得复刻的产品设计决策(附带一手证据)

1. **拟人化角色 > 功能菜单**:把"多智能体编排"这一抽象能力包装成有名字、有性格、会自我介绍的同事,大幅降低认知门槛
2. **模式作为成本旋钮**:Engineer/Team/Race 本质是"激活多少算力"的显式开关,把成本控制权交给用户而不是藏在后台
3. **Remix 兼具社区裂变与成本优化**:同一个功能同时解决"从他人作品学习"和"长对话上下文成本失控"两个问题,是设计得很巧的一个原语
4. **一键 Resolve 而非抛出堆栈**:错误处理默认路径是"让 AI 自己修",技术细节折叠在二级入口
5. **密钥永不入对话**:强制走 `Add API Key` 按钮 → 加密存 Secrets Manager → 运行时注入,并明确声明平台自身不可读
6. **双闸门用量风控**:余额告警 + 月度上限(可选自动暂停),并坦诚说明后付费导致的超支边界
7. **自研 BaaS 与外部 BaaS 并行**:Atoms Cloud 主打 Zero DevOps,Supabase 满足要掌控权的用户;代价是 Atoms Cloud 需禁用历史版本
8. **增长闭环内置**:从建站 → SEO → GA4 分析 → Google Ads 投放形成完整链路,把 Vibe Coding 平台延伸成"生意启动平台"

---

## 十四、文档质量问题记录(复刻时需要自行决策的地方)

以下是官方文档中自相矛盾或明显过期的内容,不能直接照抄:

| 冲突点 | 位置 A | 位置 B |
|---|---|---|
| Max 磁盘容量 | Max Package 段写 100 GB | 三档对比段写 40GB |
| 每日免费额度 | 多处写 15 credits/天 | `12129499` 某 FAQ 写 "daily allocation of 7.5 credits" |
| 自定义域名 | `13362391` 全文详述如何绑定与购买 | 同文末尾 FAQ 称"目前不支持绑定自定义域名" |
| 品牌与链接 | 站点已更名 Atoms | 正文散布 MGX 字样与 `support.mgx.dev` 死链;DNS 校验前缀仍是 `_mgx_verify` |
| 功能缺失 | `12129486-configuration-preferences` 正文仅一句 "This feature isn't currently supported." | 说明该页是占位内容 |

---

## 附:全部 62 篇文档清单(按主题归类)

**入门与概念(7)**:quick-start、before-you-start、project-scope-capabilities、glossary-key-terms-for-vibe-coding、video-tutorials、academic-resources、community-support

**智能体与模式(6)**:your-agents-team、communicating-with-agents、mode-switching-guide、using-multiple-agents、race-mode、deep-research

**模型(1)**:choosing-llms

**构建与编辑(7)**:app-viewer、issue-report、how-do-i-correct-an-agent-s-work、how-to-modify-files-or-content、project-file-management、code-file-management、content-formatting-guide

**发布分发(5)**:publish、share、remix、deployment-options、connect-and-manage-domains

**后端与集成(6)**:atoms-cloud、supabase-connect、stripe-connect、github-connect、ai-integrations、connect-and-use-integrations

**增长(4)**:search-engine-optimization-seo、marketing-module-guide、adrian-ads-agent、how-to-scale-up-your-business-with-atoms

**协作与账号(3)**:team-workspace、managing-your-account、configuration-preferences

**计费(7)**:plan-comparisons-details、credit-management、credits-usage-instructions、optimizing-credit-usage、subscription-management、billing-refunds、cloud-ai-wallet

**联盟(4)**:affiliate-participation-guide、affiliate-marketing-policies、payouts-withdrawals、affiliate-terms-of-service

**排障(6)**:error-message-guide、agent-performance-issues、data-display-issues、deployment-preview-errors、environment-extensions、build-export

**法务与其他(6)**:terms-of-service、privacy-policy、commercial-use-licensing、changelog、how-to-explore-your-creative-ideas-on-atoms、build-your-own-e-commerce-website-on-atoms
