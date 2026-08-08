# 部署说明

## 前置检查

- Node.js 20+、npm、PM2已安装。
- `127.0.0.1:3201`未被其他服务占用。
- GitHub仓库已克隆到 `/opt/rice`。当前仓库为公开仓库，服务器使用只读HTTPS地址拉取，不需要复用LanSense的GitHub密钥。
- 默认部署为IP访问模式：`http://106.14.8.100`，写入独立Rice Nginx配置 `/etc/nginx/conf.d/rice.conf`。
- 如云安全组已开放3201端口，也可将 `RICE_SKIP_NGINX=true` 并使用 `http://106.14.8.100:3201` 直连。
- 如以后改用域名，将 `RICE_DOMAIN` 改为域名，并填写DNS和TLS证书路径；没有证书时脚本生成HTTP-only配置。

## 环境变量

从 `.env.example`创建 `/opt/rice/.env`。正式环境保持：

```text
NODE_ENV=production
HOST=127.0.0.1
PORT=3201
DATABASE_PATH=/opt/rice/data/rice.sqlite
FRONTEND_DIST_PATH=/opt/rice/frontend/dist/client
RICE_DEMO_MODE=false
RICE_DOMAIN=106.14.8.100
RICE_SKIP_NGINX=false
```

如启用后端Basic Auth，可生成密码SHA-256：

```bash
printf '%s' '替换为管理员密码' | shasum -a 256
```

写入 `ADMIN_PASSWORD_HASH` 并设置 `ADMIN_AUTH_MODE=basic`。

## 执行部署

首次或不拉取GitHub时：

```bash
cd /opt/rice
bash scripts/deploy.sh
```

日常从GitHub拉取并部署：

```bash
cd /opt/rice
bash scripts/pull-deploy.sh
```

脚本只允许快进到 `origin/codex/rice-initial`；如果服务器受版本控制文件有本地修改会立即停止。`.env`、SQLite数据库、日志和备份目录均在Git忽略范围内，不会被 `git pull` 覆盖。

脚本依次以较低CPU/IO优先级执行依赖安装、自动测试和前端构建，再进行SQLite迁移、Rice独立PM2进程重载、Rice独立Nginx配置、`nginx -t`、reload和 `/ready` 验证。如设置 `RICE_SKIP_NGINX=true`，会跳过Nginx写入。任一步失败都会停止，不会启停或改写LanSense服务。

## 验证

```bash
curl -fsS http://127.0.0.1:3201/health
curl -fsS http://127.0.0.1:3201/ready
pm2 describe rice-backend
sudo nginx -t
```

配置真实API Key和两个已绑定IMEI后：

```bash
RICE_API_KEY='...' RICE_W0_IMEI='...' RICE_W1_IMEI='...' sudo -E bash scripts/acceptance.sh
```

## 回退

代码以GitHub为唯一版本备份。需要回退时，将远端分支恢复到已验证提交，再运行 `scripts/pull-deploy.sh`。SQLite migration只允许向前兼容，不自动删除列或表。
