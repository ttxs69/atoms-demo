# Forge

> 描述你想要的网站或工具，一个 AI 团队把它建出来。不需要写代码，也不需要注册。

Forge 是一个多智能体 Vibe Coding 平台：你用自然语言描述想法，Emma（产品经理）拆解需求、规划文件清单，Alex（工程师）逐个写入代码、安装依赖、通过安全检查、启动预览——你在右侧实时看着应用成形，随时能改、能停、能导出。

## 快速体验

```bash
git clone https://github.com/ttxs69/atoms-demo.git
cd atoms-demo

# 首次配置（交互式：两个 Supabase 项目 + Turnstile + 管理面板 token）
bash scripts/setup-wizard.sh

# 启动
npm install
npm run dev
```

打开 http://localhost:3000，说一句「做一个待办清单」。

## 功能

- **打开即用**：静默匿名登录，零表单零点击，试用后可升级永久账户（邮箱+密码）
- **生成循环**：Emma 规划文件清单（骨架先行）→ Alex 多步写入 → install → build → 预览
- **有界自修复**：构建失败自动修（最多 3 轮）；安全门控失败**绝不自动重试**——已回滚、未暴露
- **多轮修改**：改什么说什么，只动需要改的文件，无新依赖跳过 install
- **中断安全**：随时停止，已写入的文件保留，额度按实际用量结算
- **生成应用的后端**：需要持久化的应用自动获得共享 Supabase 项目 + RLS 多租户隔离
- **额度计量**：内部 token 精确计量，外部点数展示，每日重置不累积，预扣原子完成
- **导出 zip**：一键下载完整可跑的项目
- **资源回收**：30 天不活跃的匿名身份、14 天不访问的沙箱自动清理

## 架构

```
浏览器 ──SSE──> Next.js (长驻单机) ──> Mastra orchestrator
                                     ├── @lead Mike（调度）
                                     ├── @pm   Emma（规划）
                                     └── @eng  Alex（写入）
                                          ├── E2B 沙箱（Firecracker microVM）
                                          ├── DeepSeek / GLM / MiniMax（可切换）
                                          ├── 平台 Supabase（匿名登录 + 额度）
                                          └── 共享 Supabase（生成应用数据，RLS 隔离）
```

| 层 | 技术 | 为什么 |
|---|---|---|
| 运行时 | Railway 长驻单机 | SSE 继承函数时长限制（Vercel Hobby 300s 硬上限），生成链 1-3 分钟起 |
| 沙箱 | E2B | 公开定价（Hobby $0 + $100 额度 ≈ 600 小时），Firecracker 隔离 |
| 编排 | Mastra（AI SDK v5 之上） | supervisor 模式（AgentNetwork 已 deprecated），多步生成循环 |
| 身份 | Supabase Auth（匿名 → 永久） | 原生升级路径，JWT 带 `is_anonymous` |
| 数据 | 共享 Supabase 项目 + RLS | 每 workspace 隔离，secret key 不进沙箱 |

## 测试

```bash
npm test          # 85 个单元测试（毫秒级，无网络）
npm run test:live # 4 个真实模型测试（prompt 健康度告警）
npm run e2e       # Playwright 浏览器测试（需要真实凭据）
```

## 部署

```bash
bash scripts/deploy-railway.sh
```

交互式 6 阶段：创建项目 → 添加 Postgres → 设置环境变量 → 部署 → 生成域名 → 部署后验证。

## 项目结构

```
src/
  app/            Next.js 页面与 API 路由
  components/     React 客户端组件（Workspace）
  orchestrator/   生成循环核心（状态机、scaffold、orchestrator）
  ports/          可注入端口（沙箱/模型/额度/门控的 adapter）
  credits/        两阶段额度账本（原子预扣/结算/每日重置）
  backend/        RLS 模板注入器 + 共享项目安全门控
  gc/             跨系统删除队列（E2B/共享Supabase/平台库/auth用户）
  auth/           会话验证 + Turnstile 人机验证
  transport/      SSE 编解码 + zip 构建
```

## 设计决策

全部记录在 `.scratch/forge-mvp/map.md`（14 张 wayfinder 决策票）及其引用的 `.scratch/forge-mvp/issues/`。术语表见 `CONTEXT.md`。

关键取舍：
- **不做发布到子域**（MVP 只有预览 + 导出 zip；架构已留位独立注册域）
- **不做版本回滚**（要求 schema down-migration 可逆性，刻意避开）
- **不做点选编辑**（元素→源码映射在 React+Tailwind 编译后是硬骨头）
- **安全门控绝不自动重试**（技术问题可自修；数据隔离不安全不是"重试能解决的事"）

## License

MIT
