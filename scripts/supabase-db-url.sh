#!/usr/bin/env bash
# 生成 Supabase 连接串（密码做 URL 编码，避免 @ $ + / 等字符破坏 URL）。
# 用法：./scripts/supabase-db-url.sh <新数据库密码>
set -euo pipefail

REF="postgres.gzbjqtvipsuubmynxhdl"
HOST="aws-0-ap-south-1.pooler.supabase.com:5432"
DB="postgres"

if [[ $# -lt 1 || -z "${1:-}" ]]; then
  echo "用法: $0 <新数据库密码>" >&2
  exit 1
fi

python3 -c 'import sys,urllib.parse
pwd, ref, host, db = sys.argv[1:5]
print(f"postgresql://{ref}:{urllib.parse.quote(pwd, safe="")}@{host}/{db}")' "$1" "$REF" "$HOST" "$DB"
