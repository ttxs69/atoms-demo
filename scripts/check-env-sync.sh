#!/bin/bash
# .env 的每个 NEXT_PUBLIC_* 必须在 Dockerfile builder 阶段有对应 ENV。
# NEXT_PUBLIC_* 是构建期内联：只在 .env 有 → 生产 bundle 内联 undefined，
# 本地测试永远发现不了（本地 .env 有值）。此脚本在本地 build 前拦截。
set -e
cd "$(dirname "$0")/.."

ENV_KEYS=$(grep -oE '^NEXT_PUBLIC_[A-Z_]+' .env 2>/dev/null | sort -u)
# Dockerfile builder 阶段的 ENV KEY=VALUE，取第二个字段（KEY）
DOCKER_KEYS=$(awk '/^FROM/{phase=$NF} phase=="builder" && /^ENV NEXT_PUBLIC_/{print $2}' Dockerfile | cut -d= -f1 | sort -u)

missing=0
while IFS= read -r key; do
  [[ -z "$key" ]] && continue
  if ! grep -qx "$key" <<<"$DOCKER_KEYS"; then
    echo "✗ $key 在 .env 里，但 Dockerfile builder 阶段没有对应 ENV（生产将内联为 undefined）"
    missing=1
  fi
done <<<"$ENV_KEYS"

if [[ $missing -ne 0 ]]; then
  echo "修复：在 Dockerfile builder 阶段加 ENV <KEY>=<值>"
  exit 1
fi
echo "✓ NEXT_PUBLIC 与 Dockerfile 同步（$(grep -cE '^NEXT_PUBLIC_' .env) 个变量）"
