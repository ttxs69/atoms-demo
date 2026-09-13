#!/usr/bin/env bash
#
# forge-quick-deploy.sh — 本机自托管 + Cloudflare Tunnel
# 零成本、零运维。Mac 开着就在线。
#
# 用法：
#   bash scripts/forge-quick-deploy.sh          # 构建 + 启动 + 隧道
#   bash scripts/forge-quick-deploy.sh --dev    # 开发模式（热更新）
#
# 停止：Ctrl-C 或 kill %1 %2

set -euo pipefail

PORT="${PORT:-3000}"
MODE="${1:-prod}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Forge 快速部署（本机 + Cloudflare Tunnel）"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. 构建（仅生产模式）──────────────────────────────────────────────────
if [[ "$MODE" != "--dev" ]]; then
  echo "▸ 构建生产包…"
  npm run build --silent
  echo "  ✓ 构建完成"
fi

# ── 2. 启动 Next.js ──────────────────────────────────────────────────────
echo "▸ 启动 Next.js (端口 $PORT)…"
if [[ "$MODE" == "--dev" ]]; then
  npm run dev -- --port "$PORT" &
else
  PORT="$PORT" npm start &
fi
APP_PID=$!
echo "  ✓ 应用启动中 (PID: $APP_PID)"

# 等应用响应
for i in $(seq 1 30); do
  if curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT" 2>/dev/null | grep -q "200"; then
    echo "  ✓ 应用就绪：http://localhost:$PORT"
    break
  fi
  sleep 1
done

# ── 3. Cloudflare Tunnel ─────────────────────────────────────────────────
echo "▸ 启动 Cloudflare Tunnel…"
cloudflared tunnel --url "http://localhost:$PORT" 2>&1 | while IFS= read -r line; do
  # 提取公开 URL
  if echo "$line" | grep -q "trycloudflare.com"; then
    URL=$(echo "$line" | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | head -1)
    if [[ -n "$URL" ]]; then
      echo ""
      echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      echo "  ✅ Forge 已上线！"
      echo ""
      echo "  公开地址：$URL"
      echo "  本机地址：http://localhost:$PORT"
      echo ""
      echo "  ⚠ Mac 睡眠/关机 = 网站下线"
      echo "  ⚠ 每次重启会换 URL（快速隧道限制）"
      echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    fi
  fi
  # 转发其他日志
  echo "$line" >&2
done &

TUNNEL_PID=$!

# ── 清理 ────────────────────────────────────────────────────────────────
cleanup() {
  echo ""
  echo "▸ 停止…"
  kill $APP_PID 2>/dev/null || true
  kill $TUNNEL_PID 2>/dev/null || true
  pkill -f "cloudflared tunnel" 2>/dev/null || true
  echo "  ✓ 已停止"
}
trap cleanup EXIT INT TERM

echo ""
echo "按 Ctrl-C 停止"
wait
