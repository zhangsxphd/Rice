#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

APP_ROOT='/opt/rice'
PROCESS_NAME='rice-backend'
NGINX_FILE='/etc/nginx/conf.d/rice.conf'

log() { printf '[rice-deploy] %s\n' "$*"; }
die() { printf '[rice-deploy] ERROR: %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "缺少命令: $1"; }
run_low_priority() {
  if command -v ionice >/dev/null 2>&1; then
    nice -n 10 ionice -c 3 "$@"
  else
    nice -n 10 "$@"
  fi
}

[[ "$(realpath "$PWD")" == "$APP_ROOT" ]] || die "必须从 $APP_ROOT 运行，本次目录为 $(realpath "$PWD")"
for command_name in node npm pm2 curl; do need "$command_name"; done
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
RICE_SKIP_NGINX="${RICE_SKIP_NGINX:-false}"

if command -v ss >/dev/null 2>&1 && ss -ltnp | grep -q ':3201 ' && ! pm2 pid "$PROCESS_NAME" | grep -Eq '^[1-9][0-9]*$'; then
  die '3201端口已被非rice-backend进程占用'
fi

mkdir -p /opt/rice/data /opt/rice/logs /opt/rice/backups
log '安装依赖并运行测试'
run_low_priority npm ci --include=dev --no-audit --no-fund
run_low_priority env NODE_ENV=test npm run test
log '构建前端并初始化数据库'
run_low_priority npm run build:frontend
node --env-file=/opt/rice/.env backend/src/db/init-cli.js

log '启动或重载独立PM2进程 rice-backend'
pm2 startOrReload ecosystem.config.cjs --only "$PROCESS_NAME"
pm2 save

if [[ "$RICE_SKIP_NGINX" == 'true' ]]; then
  if [[ -f "$NGINX_FILE" ]]; then
    need nginx
    need sudo
    log '移除Rice旧Nginx配置，避免跳过模式遗留IP路由'
    sudo rm -f -- "$NGINX_FILE"
    sudo nginx -t
    if command -v systemctl >/dev/null 2>&1; then sudo systemctl reload nginx; else sudo nginx -s reload; fi
  fi
  log '已跳过Nginx配置，Rice将通过 http://106.14.8.100:3201 直连访问'
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
fi
need nginx
need sudo
sudo -n true || die '需要免交互sudo权限以安装Rice Nginx配置'

RICE_DOMAIN="${RICE_DOMAIN:-rice.lansensecloud.cn}"
RICE_SSL_CERT="${RICE_SSL_CERT:-}"
RICE_SSL_CERT_KEY="${RICE_SSL_CERT_KEY:-}"
LANSENSE_BACKEND_PORT="${LANSENSE_BACKEND_PORT:-3001}"
RICE_PUBLIC_INGEST_PREFIX="${RICE_PUBLIC_INGEST_PREFIX:-/rice-api/device-ingest/}"
LANSENSE_PUBLIC_INGEST_PREFIX="${LANSENSE_PUBLIC_INGEST_PREFIX:-/api/device-ingest/}"
tmp_nginx="$(mktemp)"
trap 'rm -f "$tmp_nginx"' EXIT

[[ "$RICE_PUBLIC_INGEST_PREFIX" == '/rice-api/device-ingest/' ]] || die 'RICE_PUBLIC_INGEST_PREFIX必须为/rice-api/device-ingest/'
[[ "$LANSENSE_PUBLIC_INGEST_PREFIX" == '/api/device-ingest/' ]] || die 'LANSENSE_PUBLIC_INGEST_PREFIX必须为/api/device-ingest/'
[[ "$LANSENSE_BACKEND_PORT" =~ ^[0-9]+$ ]] || die 'LANSENSE_BACKEND_PORT必须为数字端口'

shared_ip_locations=''
if [[ "$RICE_DOMAIN" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
  curl -fsS "http://127.0.0.1:$LANSENSE_BACKEND_PORT/ready" >/dev/null \
    || die "LanSense后端未就绪，拒绝安装共享IP网关，避免设备上报被Rice截断"
  shared_ip_locations="    # 共享IP模式下，LanSense原有设备上报路径始终归LanSense后端所有。
    location ^~ $LANSENSE_PUBLIC_INGEST_PREFIX {
        proxy_pass http://127.0.0.1:$LANSENSE_BACKEND_PORT$LANSENSE_PUBLIC_INGEST_PREFIX;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Rice设备必须使用独立前缀，nginx在转发时移除/rice-api前缀。
    location ^~ $RICE_PUBLIC_INGEST_PREFIX {
        proxy_pass http://127.0.0.1:3201/api/device-ingest/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

"
  log "共享IP隔离已启用：LanSense=$LANSENSE_PUBLIC_INGEST_PREFIX，Rice=$RICE_PUBLIC_INGEST_PREFIX"
fi

locations="    client_max_body_size 16k;
$shared_ip_locations    location / {
        proxy_pass http://127.0.0.1:3201;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }"

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
sudo install -m 0644 "$tmp_nginx" "$NGINX_FILE"
sudo nginx -t
if command -v systemctl >/dev/null 2>&1; then sudo systemctl reload nginx; else sudo nginx -s reload; fi

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
