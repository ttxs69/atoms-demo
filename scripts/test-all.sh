#!/bin/bash
# scripts/test-all.sh — 一键跑全部测试。防端口冲突、自动起停 server。
# 用法: bash scripts/test-all.sh [--with-slow]
set -e
cd "$(dirname "$0")/.."

# 自动记录全部输出到带时间戳的日志，失败时直接看文件，不用重跑
LOG_DIR="logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/test-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee -a "$LOG_FILE") 2>&1
echo "📝 日志: $LOG_FILE"

echo "── 1. 杀掉残留 server ──"
lsof -ti :3000 | xargs kill -9 2>/dev/null || true
sleep 2
if lsof -ti :3000 >/dev/null 2>&1; then
  echo "✗ 端口 3000 仍被占用:"; lsof -i :3000; exit 1
fi
echo "✓ 端口空闲"

echo "── 2. 构建 + 启动 ──"
set -a; source .env; set +a
npm run build >/dev/null 2>&1 || { echo "✗ build 失败"; npm run build; exit 1; }
echo "✓ build"

nohup npm start >/tmp/forge-test.log 2>&1 &
SERVER_PID=$!
trap "kill -9 $SERVER_PID 2>/dev/null; true" EXIT

# 等 health check（最多 30s）
for i in $(seq 1 30); do
  curl -s --max-time 2 http://localhost:3000/ | grep -q "Forge" && break
  sleep 1
done
curl -s --max-time 2 http://localhost:3000/ | grep -q "Forge" || { echo "✗ server 没起来"; cat /tmp/forge-test.log; exit 1; }
grep -q EADDRINUSE /tmp/forge-test.log && { echo "✗ 端口冲突"; exit 1; }
echo "✓ server ready (pid=$SERVER_PID)"
curl -s --max-time 5 http://localhost:3000/ > /dev/null  # 预热首页
curl -s --max-time 5 http://localhost:3000/login > /dev/null  # 预热 login

echo "── 3. 单元测试 ──"
npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"

echo "── 4. smoke + 完整流程 E2E ──"
npx playwright test e2e/smoke.spec.ts e2e/full-flow.spec.ts --reporter=line > /tmp/playwright.log 2>&1; tail -5 /tmp/playwright.log

if [[ "$1" == "--with-slow" ]]; then
  echo "── 5. 慢测试：真实生成 ──"
  npx playwright test e2e/anon-generate.spec.ts --reporter=line > /tmp/playwright-slow.log 2>&1; tail -5 /tmp/playwright-slow.log
fi

echo "── 完成 ──"