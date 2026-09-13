#!/usr/bin/env bash
#
# forge-quick-deploy.sh — 本机自托管 + Cloudflare Tunnel
# 零成本、零运维。Mac 开着就在线。
#
# 用法：
#   bash scripts/forge-quick-deploy.sh          # 构建 + 启动 + 隧道
#   bash scripts/forge-quick-deploy.sh --dev    # 开发模式（热更新，不构建）
#
# 停止：Ctrl-C（干净退出，不留孤儿进程）

set -euo pipefail

PORT="${PORT:-3000}"
MODE="${1:-prod}"

# ── 前置检查 ──────────────────────────────────────────────────────────────

# cloudflared
if ! command -v cloudflared >/dev/null 2>&1; then
  echo "❌ cloudflared 未安装。运行：brew install cloudflared"
  exit 1
fi

# .env
if [[ ! -f .env ]]; then
  echo "❌ .env 不存在。先运行：bash scripts/setup-wizard.sh"
  exit 1
fi

# 检查关键 key（至少 E2B 和 LLM 要有）
source .env 2>/dev/null || true
if [[ -z "${E2B_API_KEY:-}" ]] || [[ -z "${LLM_API_KEY:-}" ]]; then
  echo "❌ .env 缺少 E2B_API_KEY 或 LLM_API_KEY。运行：bash scripts/setup-wizard.sh"
  exit 1
fi

# 端口占用
if lsof -i :"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "❌ 端口 $PORT 已被占用。先停掉现有进程："
  lsof -i :"$PORT" -sTCP:LISTEN
  echo "或者换端口：PORT=3001 bash scripts/forge-quick-deploy.sh"
  exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Forge 快速部署（本机 + Cloudflare Tunnel）"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. 构建（仅生产模式）──────────────────────────────────────────────────
if [[ "$MODE" != "--dev" ]]; then
  echo "▸ 构建生产包…"
  if ! npm run build >/dev/null 2>&1; then
    echo "❌ 构建失败。运行 npm run build 查看错误。"
    exit 1
  fi
  echo "  ✓ 构建完成"
fi

# ── 2. 启动 Next.js ──────────────────────────────────────────────────────
echo "▸ 启动 Next.js (端口 $PORT)…"

NODE_PID=""
cleanup() {
  echo ""
  echo "▸ 停止…"
  # 杀 Node.js（真正的服务进程，不是 npm wrapper）
  if [[ -n "$NODE_PID" ]] && kill -0 "$NODE_PID" 2>/dev/null; then
    kill "$NODE_PID" 2>/dev/null || true
    wait "$NODE_PID" 2>/dev/null || true
  fi
  # 杀 cloudflared（直接按 PID，不用 pkill 避免误杀）
  if [[ -n "$CF_PID" ]] && kill -0 "$CF_PID" 2>/dev/null; then
    kill "$CF_PID" 2>/dev/null || true
    wait "$CF_PID" 2>/dev/null || true
  fi
  echo "  ✓ 已停止（无孤儿进程）"
}
trap cleanup EXIT INT TERM

if [[ "$MODE" == "--dev" ]]; then
  npx next dev --port "$PORT" &
  NODE_PID=$!
else
  npx next start --port "$PORT" &
  NODE_PID=$!
fi

# 等应用响应（失败则退出，不继续隧道步骤）
APP_READY=false
for i in $(seq 1 30); do
  HTTP=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT" 2>/dev/null || echo "000")
  if [[ "$HTTP" == "200" ]]; then
    APP_READY=true
    echo "  ✓ 应用就绪：http://localhost:$PORT"
    break
  fi
  # 如果进程已死，立即退出
  if ! kill -0 "$NODE_PID" 2>/dev/null; then
    echo "❌ 应用启动失败（进程已退出）。检查上方错误。"
    exit 1
  fi
  sleep 1
done

if [[ "$APP_READY" == "false" ]]; then
  echo "❌ 应用 30 秒内未就绪。可能是构建产物损坏或环境变量缺失。"
  exit 1
fi

# ── 3. Cloudflare Tunnel ─────────────────────────────────────────────────
echo "▸ 启动 Cloudflare Tunnel…"

# 输出重定向到临时文件，从文件读 URL（避免 pipe/subshell PID 问题）
CF_LOG=$(mktemp /tmp/forge-tunnel-XXXXXX.log)
cloudflared tunnel --url "http://localhost:$PORT" >"$CF_LOG" 2>&1 &
CF_PID=$!

# 等隧道 URL 出现
TUNNEL_URL=""
for i in $(seq 1 15); do
  if ! kill -0 "$CF_PID" 2>/dev/null; then
    echo "❌ 隧道启动失败。日志："
    cat "$CF_LOG"
    exit 1
  fi
  TUNNEL_URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$CF_LOG" 2>/dev/null | head -1)
  if [[ -n "$TUNNEL_URL" ]]; then
    break
  fi
  sleep 1
done

if [[ -z "$TUNNEL_URL" ]]; then
  echo "❌ 15 秒内未获得隧道 URL。日志："
  tail -5 "$CF_LOG"
  exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Forge 已上线！"
echo ""
echo "  公开地址：$TUNNEL_URL"
echo "  本机地址：http://localhost:$PORT"
echo "  隧道日志：$CF_LOG"
echo ""
echo "  ⚠ Mac 睡眠/关机 = 网站下线"
echo "  ⚠ 每次重启会换 URL（快速隧道限制）"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 保持前台 ─────────────────────────────────────────────────────────────
# 同时监控两个进程，任何一个死了都退出
echo ""
echo "按 Ctrl-C 停止"
while true; do
  if ! kill -0 "$NODE_PID" 2>/dev/null; then
    echo "⚠ 应用进程已退出"
    break
  fi
  if ! kill -0 "$CF_PID" 2>/dev/null; then
    echo "⚠ 隧道进程已退出"
    break
  fi
  sleep 5
done

echo "⚠ 服务异常退出。检查日志："
echo "  应用：直接看上方输出"
echo "  隧道：$CF_LOG"
