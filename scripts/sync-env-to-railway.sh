#!/usr/bin/env bash
#
# 把 .env 的变量同步到 Railway 的服务（轮换凭据后用）。
# 默认同步 forge-app + Postgres 两个服务（两个服务上都存了一份相同的凭据）。
# DATABASE_URL / POSTGRES_PASSWORD / PGPASSWORD 属于 Railway Postgres 插件，需单独轮换，不在此推送。
# 用法：./scripts/sync-env-to-railway.sh [service ...]
set -euo pipefail
cd "$(dirname "$0")/.."

SERVICES=("$@")
[[ ${#SERVICES[@]} -eq 0 ]] && SERVICES=(forge-app Postgres)

[[ -f .env ]] || { echo "✗ 找不到 .env"; exit 1; }

# 逐个推送会触发一次构建；先全部 --skip-deploys，最后统一重建一次。
for svc in "${SERVICES[@]}"; do
  echo "→ $svc"
  while IFS= read -r line; do
    key="${line%%=*}"
    case "$key" in
      DATABASE_URL|POSTGRES_PASSWORD|PGPASSWORD) continue ;;
    esac
    railway variable set --skip-deploys -s "$svc" "$line" >/dev/null
    printf '  ✓ %s\n' "$key"
  done < <(grep -E '^[A-Z0-9_]+=' .env)
done

echo
echo "已推送（未触发构建）"
echo "下一步：railway redeploy -s forge-app -y"
