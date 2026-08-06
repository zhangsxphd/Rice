#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

APP_ROOT='/opt/rice'
PROCESS_NAME='rice-backend'
NGINX_FILE='/etc/nginx/conf.d/rice.conf'

log() { printf '[rice-deploy] %s\n' "$*"; }
die() { printf '[rice-deploy] ERROR: %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "缺少命令: $1"; }

[[ "$(realpath "$PWD")" == "$APP_ROOT" ]] || die "必须从 $APP_ROOT 运行，本次目录为 $(realpath "$PWD")"
for command_name in node npm pm2 nginx curl; do need "$command_name"; done
[[ -f package.json && -f backend/package.json && -f frontend/package.json ]] || die '项目文件不完整'

if [[ ! -f .env ]]; then
  cp .env.example .env
  chmod 0600 .env
  die '已创建 /opt/rice/.env，请检查配置后重新运行部署'
fi

set -a
# shellcheck disable=SC1091
source .env
set +a
[[ "${PORT:-3201}" == '3201' ]] || die 'Rice后端端口必须为3201'
[[ "${DATABASE_PATH:-}" == '/opt/rice/data/rice.sqlite' ]] || die 'DATABASE_PATH必须为/opt/rice/data/rice.sqlite'

if command -v ss >/dev/null 2>&1 && ss -ltnp | grep -q ':3201 ' && ! pm2 pid "$PROCESS_NAME" | grep -Eq '^[1-9][0-9]*$'; then
  die '3201端口已被非rice-backend进程占用'
fi

mkdir -p /opt/rice/data /opt/rice/logs /opt/rice/backups
log '安装依赖并运行测试'
npm ci --no-audit --no-fund
npm run test
log '构建前端并初始化数据库'
npm run build:frontend
node --env-file=/opt/rice/.env backend/src/db/init-cli.js

log '启动或重载独立PM2进程 rice-backend'
pm2 startOrReload ecosystem.config.cjs --only "$PROCESS_NAME"
pm2 save

RICE_DOMAIN="${RICE_DOMAIN:-rice.lansensecloud.cn}"
RICE_SSL_CERT="${RICE_SSL_CERT:-}"
RICE_SSL_CERT_KEY="${RICE_SSL_CERT_KEY:-}"
tmp_nginx="$(mktemp)"
trap 'rm -f "$tmp_nginx"' EXIT

locations='    client_max_body_size 16k;
    location / {
        proxy_pass http://127.0.0.1:3201;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }'

if [[ -n "$RICE_SSL_CERT" && -n "$RICE_SSL_CERT_KEY" && -f "$RICE_SSL_CERT" && -f "$RICE_SSL_CERT_KEY" ]]; then
  {
    printf 'server {\n    listen 80;\n    server_name %s;\n    return 301 https://$host$request_uri;\n}\n' "$RICE_DOMAIN"
    printf 'server {\n    listen 443 ssl http2;\n    server_name %s;\n    ssl_certificate %s;\n    ssl_certificate_key %s;\n%s\n}\n' "$RICE_DOMAIN" "$RICE_SSL_CERT" "$RICE_SSL_CERT_KEY" "$locations"
  } >"$tmp_nginx"
else
  {
    printf 'server {\n    listen 80;\n    server_name %s;\n%s\n}\n' "$RICE_DOMAIN" "$locations"
  } >"$tmp_nginx"
fi

log '安装独立Nginx配置并验证，不读取或改写LanSense配置'
install -m 0644 "$tmp_nginx" "$NGINX_FILE"
nginx -t
if command -v systemctl >/dev/null 2>&1; then systemctl reload nginx; else nginx -s reload; fi

for _ in {1..20}; do
  if curl -fsS http://127.0.0.1:3201/ready >/dev/null; then
    log '部署完成：/health与/ready正常'
    curl -fsS http://127.0.0.1:3201/health
    printf '\n'
    exit 0
  fi
  sleep 1
done
pm2 logs "$PROCESS_NAME" --lines 80 --nostream || true
die 'rice-backend未在预期时间内就绪'
