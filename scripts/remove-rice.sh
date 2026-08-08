#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT='/opt/rice'
CONFIRM='--confirm-remove-rice'
[[ "${1:-}" == "$CONFIRM" ]] || {
  printf '仅显示操作，不删除：\n'
  printf '  1. 确认 /opt/rice Git分支已推送GitHub\n'
  printf '  2. 停止并删除PM2进程 rice-backend\n'
  printf '  3. 删除独立Nginx配置 /etc/nginx/conf.d/rice.conf\n'
  printf '  4. 删除整个 /opt/rice（包括SQLite、日志和运行时备份）\n'
  printf '确认执行请运行: sudo bash /opt/rice/scripts/remove-rice.sh %s\n' "$CONFIRM"
  exit 0
}

resolved="$(realpath "$APP_ROOT")"
[[ "$resolved" == '/opt/rice' ]] || { printf '目标目录校验失败: %s\n' "$resolved" >&2; exit 1; }
[[ -d "$APP_ROOT/.git" ]] || { printf '/opt/rice不是Git仓库，拒绝删除\n' >&2; exit 1; }
[[ -z "$(git -C "$APP_ROOT" status --porcelain)" ]] || { printf '存在未提交改动，拒绝删除\n' >&2; exit 1; }
head_commit="$(git -C "$APP_ROOT" rev-parse --short HEAD)"
printf '即将删除 /opt/rice，当前部署提交为 %s；请确认代码已推送GitHub。\n' "$head_commit"

printf '停止rice-backend\n'
pm2 delete rice-backend || true
pm2 save || true
printf '删除Rice独立Nginx配置\n'
rm -f -- /etc/nginx/conf.d/rice.conf
nginx -t
if command -v systemctl >/dev/null 2>&1; then systemctl reload nginx; else nginx -s reload; fi
printf '删除 /opt/rice；不会操作 /opt/lansense 或 /var/www/lansense\n'
cd /
rm -rf -- /opt/rice
printf 'Rice项目已删除，运行数据不可恢复；代码保留在GitHub。\n'
