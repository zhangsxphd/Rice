# Rice 主看板视觉验收

## 对照基准

- source visual truth path: `/Users/zhangshuxuan/Downloads/rice_dashboard_reference.png`
- implementation screenshot path: `/Users/zhangshuxuan/Documents/Rice/artifacts/dashboard-final-viewport.png`
- focused source region: `/Users/zhangshuxuan/Documents/Rice/artifacts/reference-card-region.png`
- focused implementation region: `/Users/zhangshuxuan/Documents/Rice/artifacts/implementation-card-region.png`
- viewport: 1672 × 941 CSS px
- source pixels: 1672 × 941；按 1:1 视觉基准使用
- implementation pixels: 1672 × 941；浏览器 `devicePixelRatio=2`，截图接口输出 CSS 尺寸，已与源图归一到相同像素尺寸
- additional responsive evidence: `/Users/zhangshuxuan/Documents/Rice/artifacts/dashboard-1440.png`，1440 × 900 CSS px，无水平溢出
- state: 主看板、综合状态、P01 选中、最近 1 小时；本地 SQLite 显式演示数据模式，前端没有内置模拟数据

## Findings

- 无待处理的 P0/P1/P2 视觉问题。
- [P3] 左上角采用图标库中的植物图标，不逐像素复刻参考图稻穗标记。提示词没有指定品牌标志或提供独立 Logo 资产，当前处理保持相同绿色农业语义且避免从截图裁切资产。

## 五项保真检查

- 字体与排版：中文系统字体栈、数字层级、粗细、行高和单行工具栏与参考图一致；1440 px 下没有文字遮挡或异常换行。
- 间距与布局：白色卡片、浅灰蓝底、细边框、低饱和阴影、紧凑圆角和高密度节奏一致。矩阵采用业务规则强制的 B1–B4 行 × W0/W1/W2-V1/V2 列 4×6 布局，因此不同于参考图的 3×8 示意，这是有意差异。
- 色彩与状态：绿色正常、橙色异常、粉红缺测、灰色离线、浅灰虚线未绑定及蓝色选中描边均同时含文字徽标，不只依赖颜色。
- 图像与图标：页面不使用整图背景或截图切片；按钮、卡片、图表、表格均为真实 React/HTML/ECharts 组件，标准操作图标来自 Phosphor。
- 文案与数据：6 张摘要卡、完整试验编号、单位换算、电池 V、信号 CSQ、相对更新时间和状态文案符合实施提示词。W0 仅显示水位，W1/W2 仅显示张力；缺失值显示 `—`。

## 全图与细节证据

- 全图对照在同一 1672 × 941 视口完成，检查了工具栏、6 张摘要卡、4×6 矩阵、状态图例和首屏历史曲线。
- 760 × 250 卡片区域细节对照检查了 P 编号、完整试验编号、状态徽标、选中描边、指标对齐、边框和缺测空值。
- 参考图的 5 张摘要卡和 3×8 矩阵仅作为视觉风格参考；实现按业务规则改为 6 张摘要卡和科学试验 4×6 映射。

## Comparison history

### Pass 1 — blocked

- P1：前端数字格式化把 `null` 经 `Number(null)` 转成 0，P11 缺失张力显示成 `0.0 kPa`。
- P1：摘要趋势按记录条数而不是采集时刻聚合，多小区同一时刻的数据被拆散，形成锯齿状假波动。
- evidence: `/Users/zhangshuxuan/Documents/Rice/artifacts/dashboard-pass1-viewport.png`

### Fixes

- 增加显式空值判断，保留真实数值 0，同时让 `null`、`undefined` 和空字符串统一显示 `—`。
- 先按 `collected_at` 聚合同一采集时刻，再按时间组下采样到最多 60 个摘要趋势点。
- 增加前端空值/零值回归测试，以及后端同一时刻多小区只生成一个趋势点的回归断言。

### Pass 2 — passed

- P11 缺失张力显示 `—`，状态仍为“缺测”。
- 摘要迷你趋势恢复为按时间变化的连续曲线，不再出现由小区顺序导致的假锯齿。
- 1672 px 和 1440 px 均无水平溢出；核心路由和交互可用；浏览器页面控制台错误为 0。

## 验证的交互

- 指标标签无整页重载切换。
- 点击 P12 后历史区和最近数据表同步更新。
- 最近 1 小时、6 小时等时间范围切换。
- 系统设置、数据导出、设备管理三条路由及返回主看板。

## Follow-up polish

- 若后续提供正式 Rice 品牌 Logo，可替换左上角通用植物图标，不影响现有布局。

final result: passed
