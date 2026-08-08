#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

APP_ROOT='/opt/rice'
RICE_BRANCH="${RICE_BRANCH:-codex/rice-initial}"

log() { printf '[rice-pull-deploy] %s\n' "$*"; }
die() { printf '[rice-pull-deploy] ERROR: %s\n' "$*" >&2; exit 1; }

[[ "$(realpath "$PWD")" == "$APP_ROOT" ]] || die "必须从 $APP_ROOT 运行"
[[ -d .git && -f scripts/deploy.sh ]] || die '当前目录不是完整的Rice Git仓库'

if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  die '服务器存在未提交的受版本控制文件改动，已停止拉取以避免覆盖'
fi

log "从GitHub获取 $RICE_BRANCH"
git fetch origin "$RICE_BRANCH"
git checkout "$RICE_BRANCH"
git merge --ff-only "origin/$RICE_BRANCH"

log "当前提交 $(git rev-parse --short HEAD)，开始低优先级部署"
bash scripts/deploy.sh
