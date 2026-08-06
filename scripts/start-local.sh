#!/usr/bin/env bash
set -Eeuo pipefail

app_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
log_dir="$app_root/logs"
backend_pid_file="$log_dir/backend-local.pid"
frontend_pid_file="$log_dir/frontend-local.pid"

die() { printf '[rice-local] ERROR: %s\n' "$*" >&2; exit 1; }
for command_name in node lsof curl; do command -v "$command_name" >/dev/null 2>&1 || die "缺少命令: $command_name"; done
[[ -x "$app_root/node_modules/.bin/vite" ]] || die '依赖未安装，请先运行 npm install'

for port in 3201 5173; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    die "端口 $port 已被占用；请先确认现有进程"
  fi
done

mkdir -p "$log_dir"
cd "$app_root"
PORT=3201 HOST=127.0.0.1 ADMIN_AUTH_MODE=none nohup node backend/src/server.js >"$log_dir/backend-local.log" 2>&1 &
backend_pid=$!
printf '%s\n' "$backend_pid" >"$backend_pid_file"

cd "$app_root/frontend"
nohup "$app_root/node_modules/.bin/vite" --host 0.0.0.0 --port 5173 --strictPort >"$log_dir/frontend-local.log" 2>&1 &
frontend_pid=$!
printf '%s\n' "$frontend_pid" >"$frontend_pid_file"

for _ in {1..30}; do
  if curl -fsS http://127.0.0.1:3201/ready >/dev/null 2>&1 && curl -fsS http://127.0.0.1:5173/ >/dev/null 2>&1; then
    printf '[rice-local] 已启动：后端 PID %s，前端 PID %s\n' "$backend_pid" "$frontend_pid"
    printf '[rice-local] 打开 http://127.0.0.1:5173/\n'
    exit 0
  fi
  sleep 0.2
done

printf '[rice-local] 启动超时，正在清理本次进程\n' >&2
kill "$frontend_pid" "$backend_pid" 2>/dev/null || true
exit 1
