<div align="center">

# Forge

**描述你想要的网站或工具，一个 AI 团队把它建出来。**

[![CI](https://github.com/ttxs69/atoms-demo/actions/workflows/ci.yml/badge.svg)](https://github.com/ttxs69/atoms-demo/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](#license)
[![Node](https://img.shields.io/badge/node-%3E%3D18-green.svg)](package.json)

自然语言驱动的应用生成平台：Emma（规划）与 Alex（工程）在隔离沙箱中
生成可预览、可迭代、可导出的 React 应用，对话与产物全量持久化。

</div>

---

## 概述

Forge 是一个多智能体应用生成平台。你用自然语言描述需求，系统在
E2B 沙箱（Firecracker microVM）中完成 规划 → 写码 → 安装 → 构建 →
安全检查 → 预览 的完整闭环；匿名即可试用，升级邮箱后所有资产
（对话、应用、预览）跨设备找回。

**四条产品不变量**（全部有端到端验收测试，见 [测试](#测试)）：

1. 匿名可试用，升级可保身（身份 ID 不变，资产归属不变）
2. 刷新不丢对话（对话是后端持久资产）
3. 沙箱死亡应用还在（产物有独立于沙箱的持久副本）
4. 登录后找回同一个工作区（对话 + 产物 + 预览）

## 核心特性

- **打开即用** — 静默匿名登录，零表单零点击；邮箱升级（OTP / magic link）后身份无损保留
- **生成循环** — Emma 规划文件清单（骨架先行）→ Alex 多步写入 → install → build → 预览，全程 SSE 实时可见
- **有界自修复** — 构建失败自动修（最多 3 轮）；安全门控失败绝不自动重试
- **持久化** — 对话以追加日志（WAL）落库、逐消息重放；产物每回合热快照（checkpoint），沙箱死亡后冷恢复
- **多轮修改** — 迭代回合注入当前代码清单（manifest），只改需要改的文件
- **中断安全** — 随时停止，已写入文件保留，额度按实际用量结算
- **生成应用的后端** — 需要持久化的应用自动获得共享 Supabase 数据层 + RLS 多租户隔离
- **额度计量** — token 精确计量、点数对外展示、每日重置、预扣原子完成
- **资源回收** — 30 天不活跃匿名身份 / 14 天未访问沙箱自动清理，快照对象同步回收

## 架构概要

```
浏览器 ──HTTPS/SSE──▶ Next.js 长驻单机（Railway）
                        ├─ orchestrator（生成回合状态机：单写者队列、
                        │   自修复、install→migrate→gate→build→dev 管线、热快照）
                        │   ├─ E2B 沙箱（生成应用运行处）
                        │   └─ LLM 提供商（OpenAI 兼容 / Anthropic 协议，env 可切换）
                        ├─ Supabase（auth / projects / project_events / Storage 快照）
                        └─ 平台 Postgres（额度两阶段记账 / GC 删除队列）
```

完整设计（C4 视图、运行时场景、数据架构、质量属性、决策记录）见
[docs/05-architecture.md](docs/05-architecture.md)。

## 快速开始

### 前置要求

| 依赖 | 用途 | 获取 |
|---|---|---|
| Node.js ≥ 18（建议 22+） | 运行时 | nodejs.org |
| Supabase 项目 | 身份 / 项目 / 事件 / 快照存储 | supabase.com（免费层可用） |
| E2B API Key | 生成沙箱 | e2b.dev |
| LLM API Key | 生成模型（默认 DeepSeek） | 任意 OpenAI 兼容端点 |
| Cloudflare Turnstile（可选） | 人机验证 | dash.cloudflare.com |

### 安装与启动

```bash
git clone https://github.com/ttxs69/atoms-demo.git
cd atoms-demo

bash scripts/setup-wizard.sh   # 交互式写入 .env（上述全部凭据）
npm install

npm run dev                    # http://localhost:3000
```

无任何环境变量时系统以 dev 模式降级运行（`x-dev-session` 身份，
无持久化），可先行体验界面。

### 环境变量

| 变量 | 必填 | 说明 |
|---|---|---|
| `APPS_SUPABASE_URL` / `APPS_SUPABASE_PUBLISHABLE_KEY` / `APPS_SUPABASE_SECRET_KEY` | 是* | Supabase 项目（REST/Storage） |
| `APPS_SUPABASE_DB_URL` | 是* | Supabase Postgres 直连（迁移执行） |
| `E2B_API_KEY` | 是* | 沙箱创建 / 恢复 / 回收 |
| `LLM_API_KEY` | 是* | 模型调用 |
| `LLM_BASE_URL` / `LLM_MODEL` / `LLM_PROTOCOL` | 否 | 模型端点与协议（默认 DeepSeek / openai 协议） |
| `DATABASE_URL` | 否 | 平台 Postgres（缺失时用内嵌 PGlite） |
| `DAILY_CAP` / `TOKENS_PER_POINT` / `RESERVE_ESTIMATE_TOKENS` | 否 | 额度策略 |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | 否 | 人机验证 |

\* 生产必填；缺失时对应能力降级或禁用。

### 数据库迁移

```bash
node scripts/apply-migration.mjs scripts/migrations/001-projects.sql
# …依次执行至 005-persistence.sql（幂等，可重复执行）
```

**部署铁律**：迁移必须先于流量执行——005 漏跑曾被 e2e 实证为
持久化承诺的破裂点（PGRST204）。

## 测试

| 层 | 命令 | 数量 | 锁定内容 |
|---|---|---|---|
| 单元测试 | `npm test` | 113 | 纯函数判定核（fold / OTP / 快照过滤 / GC 顺序）、端口行为（幂等 / 游标） |
| e2e（浏览器） | `npm run e2e` | 18 | AC1–AC3 验收（刷新 / 杀沙箱冷恢复 / 重登找回）、CRUD UI 交互、导航语义、布局回归 |
| live | `npm run test:live` | 4 | 提示词漂移告警（真实模型，`RUN_LIVE=1` 显式触发） |

e2e 需真实凭据且**串行执行**（真实 LLM/E2B 并行会触发限流）。
CI（GitHub Actions）只跑离线部分：typecheck + 单测 + build；
全绿是 Railway 部署的前置门禁（Wait for CI）。

## 部署

```bash
bash scripts/deploy-railway.sh
```

交互式六阶段：创建项目 → 添加 Postgres → 设置环境变量 → 部署 →
生成域名 → 部署后验证。连接 GitHub 仓库后，push `main` 即
CI 绿 → 自动部署；`railway up --ci` 保留为手动通道。

## 项目结构

```
src/
├─ app/              Next.js 路由（页面 + API；命令编排薄壳）
├─ components/       Workspace（对话 / 预览 / 代码面板）
├─ orchestrator/     生成回合状态机 + 沙箱脚手架
├─ domain/           事件联合（ForgeEvent 持久 / Transient 不持久）
├─ journal/          对话 WAL（纯折叠 + Supabase 适配器）
├─ ports/            六端口与适配器（沙箱 / 模型 / 额度 / 门控 / 日志 / 快照）
├─ auth/             会话验证、OTP 判定核、Turnstile
├─ credits/          两阶段额度账本
├─ gc/               依赖序回收引擎 + 生产 deleters
├─ backend/          RLS 模板注入 + 安全门控
└─ transport/        SSE 编解码 + zip 构建
```

## 文档

| 文档 | 内容 |
|---|---|
| [docs/01](docs/01-atoms-core-features.md) · [02](docs/02-prd.md) | 竞品功能调研 · PRD |
| [docs/03](docs/03-architecture.md) | 旧架构设计（已被 05 取代，存档） |
| [docs/04](docs/04-persistence.md) | 持久化设计（WAL + checkpoint + 验收套件） |
| [docs/05](docs/05-architecture.md) | **现行架构**（As-Built，C4 + 决策记录） |
| [CONTEXT.md](CONTEXT.md) | 领域术语表（词汇权威） |
| [AGENTS.md](AGENTS.md) | 代理协作约定（FP-Core / 禁 heredoc） |

## 设计决策摘要

- **长驻单机而非 Serverless** — SSE 继承函数时长限制，生成链 1–3 分钟起
- **URL 即状态** — `/` 永远新开始；`/projects/[id]` 即工作现场，无隐式解析
- **WAL + checkpoint** — 对话按回合追加落库、产物每成功回合热快照（pause 之前，消除竞争）
- **FP-Core + Imperative Shell** — 判定逻辑纯函数化（时间注入），路由只做 I/O 编排
- **不做**：发布到子域（架构已留位独立注册域）、版本回滚、点选编辑——理由见 [docs/05 §11–12](docs/05-architecture.md)

## License

[MIT](LICENSE)
