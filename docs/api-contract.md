# D100L-Ym2 HTTP上报契约

## 接口

```text
生产共享IP入口：POST /rice-api/device-ingest/d100l2
后端直连/独立域名入口：POST /api/device-ingest/d100l2
Content-Type: application/json
```

API Key读取优先级：`X-API-Key`请求头、`?api_key=`、JSON中的`apiKey`。IMEI必须已登记、启用并绑定活动小区，设备上传的P编号或试验编号不会覆盖服务器绑定关系。

## W0示例

```json
{
  "schema_version": 1,
  "apiKey": "REPLACE_ME",
  "imei": "862323089930701",
  "timestamp": 1785948020,
  "datetime": "2026-08-06 00:40:20",
  "report_sequence": 125,
  "task_version": "rice_w0_water_soil_v1",
  "sensor_mode": "water_soil",
  "water_level_mm": 26.4,
  "water_4_20ma_status": "ok",
  "soil_moisture_percent": 43.2,
  "soil_temperature_c": 27.1,
  "soil_ec_us_cm": 816,
  "soil_ph": 6.52,
  "soil_rs485_status": "ok",
  "battery_mv": 3998,
  "csq": 21,
  "cycle_status": "ok"
}
```

## W1/W2示例

```json
{
  "schema_version": 1,
  "apiKey": "REPLACE_ME",
  "imei": "862323089930703",
  "timestamp": 1785948020,
  "report_sequence": 125,
  "task_version": "rice_tension_soil_v1",
  "sensor_mode": "tension_soil",
  "soil_tension_kpa": -19.5,
  "soil_tension_rs485_status": "ok",
  "soil_tension_rs485_hex": "010302FF3D3865",
  "soil_moisture_percent": 36.8,
  "soil_temperature_c": 27.0,
  "soil_ec_us_cm": 902,
  "soil_ph": 6.47,
  "soil_rs485_status": "ok",
  "battery_mv": 4005,
  "csq": 20,
  "cycle_status": "ok"
}
```

时间戳同时支持秒和毫秒。没有合法设备时间时使用服务器接收时间并设置 `time_source=server_fallback`。重复的 `(device_id, collected_at)` 返回200，`inserted=false`、`duplicated=true`。

## 错误码

- `400 INVALID_IMEI`：IMEI为空或格式不符合管理端要求。
- `401 INVALID_API_KEY`：Key不存在或已停用。
- `403 DEVICE_DISABLED`：设备已停用。
- `404 DEVICE_NOT_REGISTERED`：未知IMEI。
- `404 DEVICE_NOT_BOUND`：IMEI已登记但没有活动小区绑定。

服务端始终以小区的 `sensor_mode` 为准。W0中的张力或W1/W2中的水位只进入脱敏审计JSON，并记录为unexpected field，不进入正式指标。
