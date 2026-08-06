# 部署说明

## 前置检查

- DNS：`rice.lansensecloud.cn`解析到目标服务器。
- Node.js 20+、npm、PM2、Nginx已安装。
- `127.0.0.1:3201`未被其他服务占用。
- GitHub仓库克隆到 `/opt/rice`。
- TLS证书路径已填写到 `.env`；没有证书时脚本生成HTTP-only配置。

## 环境变量

从 `.env.example`创建 `/opt/rice/.env`。正式环境保持：

```text
NODE_ENV=production
HOST=127.0.0.1
PORT=3201
DATABASE_PATH=/opt/rice/data/rice.sqlite
FRONTEND_DIST_PATH=/opt/rice/frontend/dist/client
RICE_DEMO_MODE=false
```

如启用后端Basic Auth，可生成密码SHA-256：

```bash
printf '%s' '替换为管理员密码' | shasum -a 256
```

写入 `ADMIN_PASSWORD_HASH` 并设置 `ADMIN_AUTH_MODE=basic`。

## 执行部署

```bash
cd /opt/rice
sudo bash scripts/deploy.sh
```

脚本依次执行依赖安装、自动测试、前端构建、SQLite迁移、PM2启动、独立Nginx配置、`nginx -t`、reload和 `/ready` 验证。任一步失败都会停止，不会操作LanSense。

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

部署前先执行 `scripts/backup.sh`。代码回退使用Git切换到已验证提交后重新运行 `scripts/deploy.sh`；SQLite migration只允许向前兼容，不自动删除列或表。
