# Rice 水稻试验临时监测系统

独立服务于24个水稻试验小区的20余天实时监测系统。项目不读取、不修改、不依赖LanSense数据库和运行进程。

## 试验设计

主看板采用4×6矩阵：行是B1–B4区组，列依次为W0-V1、W0-V2、W1-V1、W1-V2、W2-V1、W2-V2。

- W0：AII1水位计＋UART2土壤温湿度/EC/pH四参数探头。
- W1/W2：UART2地址01张力计＋地址02土壤四参数探头。
- 数据库保存水位mm、张力kPa、EC μS/cm、电池mV和CSQ；页面只在显示层换算cm、mS/cm和V。

## 本地开发

环境要求：Node.js 20+、npm 9+。

```bash
cd /Users/zhangshuxuan/Documents/Rice
npm install
npm run db:init
```

分别打开两个终端：

```bash
cd /Users/zhangshuxuan/Documents/Rice
PORT=3201 HOST=127.0.0.1 ADMIN_AUTH_MODE=none npm run dev:backend
```

```bash
cd /Users/zhangshuxuan/Documents/Rice
npm run dev:frontend -- --host 0.0.0.0 --port 5173
```

浏览器打开 `http://127.0.0.1:5173/`。Vite会把 `/api`、`/health`和`/ready`转发到3201。

手动关闭时，在上面两个终端分别按 `Control-C`。

如果希望后台运行并用一条命令启停，使用：

```bash
cd /Users/zhangshuxuan/Documents/Rice
npm run local:start
npm run local:stop
```

本地日志写入 `logs/backend-local.log` 和 `logs/frontend-local.log`。启动脚本只在3201和5173端口空闲时运行；关闭脚本会校验PID和进程工作目录，避免停止其他项目。

如采用生产模式的PM2，则使用：

```bash
cd /opt/rice
pm2 startOrReload ecosystem.config.cjs --only rice-backend
pm2 stop rice-backend
```

重新启动PM2进程：

```bash
pm2 restart rice-backend
```

### 显式演示数据

正式模式默认不生成模拟读数。如需核对UI：

```bash
cd /Users/zhangshuxuan/Documents/Rice
RICE_DEMO_MODE=true npm run db:demo
```

演示数据写入独立SQLite，前端仍然完全通过真实API读取。正式部署必须保持 `RICE_DEMO_MODE=false`。

## 测试与构建

```bash
npm run test:backend
npm run test:frontend
npm run test:lua
npm run build:frontend
npm run test:sites --workspace frontend
```

后端测试覆盖：24小区映射、W0/W1入库、错误Key、未知和未绑定IMEI、去重、缺测不补0、旧读数不覆盖最新值、唯一活动绑定、清理测试数据和CSV编码。

## 首次接入

1. 打开“系统设置”，创建API Key；完整值只显示一次。
2. 打开“设备管理”，逐个绑定IMEI，或按P01–P24顺序批量粘贴24行。
3. 将API Key写入相应Lua脚本顶部，将测试模式保持为10秒完成现场联调。
4. 确认水位、张力、四参数、电池和CSQ均正确后，把Lua脚本 `testMode` 改为 `false`，正式周期为300秒。
5. 设置正式试验开始时间，再清理此前测试读数。

设备上报地址：

```text
POST https://rice.lansensecloud.cn/api/device-ingest/d100l2
```

Lua草案：

- `docs/d100l-w0-water-soil-http.lua`
- `docs/d100l-w1-w2-tension-soil-http.lua`

张力计脚本中的起始寄存器必须在现场烧录前按设备说明书复核；当前草案按提示词样例帧解析有符号16位并除以10。

## 生产部署

服务器目标目录固定为 `/opt/rice`：

```bash
sudo git clone git@github.com:zhangsxphd/Rice.git /opt/rice
cd /opt/rice
sudo bash scripts/deploy.sh
```

首次运行会复制 `.env.example` 为 `.env` 并停止，请检查后再次执行。部署脚本只管理：

- `/opt/rice`
- PM2进程 `rice-backend`
- `/etc/nginx/conf.d/rice.conf`
- `127.0.0.1:3201`

不会停止、重载或修改LanSense的目录、进程、数据库和Nginx server块。详细说明见 `docs/deployment.md`。

## 备份和导出

```bash
cd /opt/rice
sudo bash scripts/backup.sh
sudo bash scripts/export-all.sh
```

备份使用SQLite在线备份API，同时生成带UTF-8 BOM的CSV。

## 试验结束后删除

先运行无参数命令查看将执行的步骤：

```bash
sudo bash /opt/rice/scripts/remove-rice.sh
```

确认当前分支已提交并推送GitHub后：

```bash
sudo bash /opt/rice/scripts/remove-rice.sh --confirm-remove-rice
```

该命令会删除整个 `/opt/rice`，包括SQLite、日志和运行时备份；不会操作LanSense。删除后运行数据不可恢复，代码仍保留在GitHub。
