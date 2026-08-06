#!/usr/bin/env bash
set -Eeuo pipefail
base_url="${RICE_BASE_URL:-http://127.0.0.1:3201}"
api_key="${RICE_API_KEY:?请设置RICE_API_KEY}"
w0_imei="${RICE_W0_IMEI:?请设置RICE_W0_IMEI}"
w1_imei="${RICE_W1_IMEI:?请设置RICE_W1_IMEI}"
timestamp="$(date +%s)"

curl -fsS "$base_url/health"; printf '\n'
curl -fsS "$base_url/ready"; printf '\n'
curl -fsS -X POST "$base_url/api/device-ingest/d100l2" -H "Content-Type: application/json" -H "X-API-Key: $api_key" -d "{\"imei\":\"$w0_imei\",\"timestamp\":$timestamp,\"sensor_mode\":\"water_soil\",\"water_level_mm\":26.4,\"water_4_20ma_status\":\"ok\",\"soil_moisture_percent\":43.2,\"soil_temperature_c\":27.1,\"soil_ec_us_cm\":816,\"soil_ph\":6.52,\"soil_rs485_status\":\"ok\",\"battery_mv\":3998,\"csq\":21,\"cycle_status\":\"ok\"}"; printf '\n'
curl -fsS -X POST "$base_url/api/device-ingest/d100l2" -H "Content-Type: application/json" -H "X-API-Key: $api_key" -d "{\"imei\":\"$w1_imei\",\"timestamp\":$((timestamp+1)),\"sensor_mode\":\"tension_soil\",\"soil_tension_kpa\":-19.5,\"soil_tension_rs485_status\":\"ok\",\"soil_moisture_percent\":36.8,\"soil_temperature_c\":27.0,\"soil_ec_us_cm\":902,\"soil_ph\":6.47,\"soil_rs485_status\":\"ok\",\"battery_mv\":4005,\"csq\":20,\"cycle_status\":\"ok\"}"; printf '\n'
printf '验收上报完成。错误Key、未知IMEI、重复和部分缺测由后端自动测试覆盖。\n'
