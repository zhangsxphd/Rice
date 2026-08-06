#!/usr/bin/env bash
set -Eeuo pipefail

app_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
log_dir="$app_root/logs"

stop_one() {
  local label="$1" pid_file="$2" expected_cwd="$3"
  if [[ ! -f "$pid_file" ]]; then
    printf '[rice-local] %s没有PID文件，视为未由local:start启动\n' "$label"
    return
  fi
  local pid command cwd
  pid="$(tr -cd '0-9' <"$pid_file")"
  [[ -n "$pid" ]] || { printf '[rice-local] %s PID文件无效，拒绝操作\n' "$label" >&2; return 1; }
  if ! kill -0 "$pid" 2>/dev/null; then
    rm -f -- "$pid_file"
    printf '[rice-local] %s进程已结束，已清理旧PID文件\n' "$label"
    return
  fi
  command="$(ps -p "$pid" -o command=)"
  cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1)"
  if [[ "$cwd" != "$expected_cwd" ]]; then
    printf '[rice-local] %s PID %s 工作目录不是Rice，拒绝停止：%s\n' "$label" "$pid" "$cwd" >&2
    return 1
  fi
  kill "$pid"
  for _ in {1..30}; do
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.1
  done
  if kill -0 "$pid" 2>/dev/null; then
    printf '[rice-local] %s未能正常退出，请检查：%s\n' "$label" "$command" >&2
    return 1
  fi
  rm -f -- "$pid_file"
  printf '[rice-local] 已停止%s（PID %s）\n' "$label" "$pid"
}

stop_one '前端' "$log_dir/frontend-local.pid" "$app_root/frontend"
stop_one '后端' "$log_dir/backend-local.pid" "$app_root"
