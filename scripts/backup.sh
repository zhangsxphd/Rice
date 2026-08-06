#!/usr/bin/env bash
set -Eeuo pipefail
APP_ROOT='/opt/rice'
[[ "$(realpath "$PWD")" == "$APP_ROOT" ]] || { printf '必须从 /opt/rice 运行\n' >&2; exit 1; }
[[ -f .env ]] || { printf '缺少 /opt/rice/.env\n' >&2; exit 1; }
node --env-file=/opt/rice/.env backend/src/db/backup-cli.js
