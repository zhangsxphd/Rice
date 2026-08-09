function rangeViolation(value, range) {
  if (value === null || value === undefined || !range) return false;
  return (range.min !== null && range.min !== undefined && value < Number(range.min))
    || (range.max !== null && range.max !== undefined && value > Number(range.max));
}

export function evaluatePlotStatus(row, settings, now = Date.now()) {
  const sensorProfile = row.sensor_profile || row.sensor_mode;
  if (!row.device_id) return { status: 'unbound', reasons: ['未绑定IMEI'] };
  const offlineTimeout = Number(settings.ingest?.offlineTimeoutSeconds || 900) * 1000;
  const lastIngest = row.last_ingest_at ? new Date(row.last_ingest_at).getTime() : NaN;
  if (!Number.isFinite(lastIngest) || now - lastIngest > offlineTimeout) return { status: 'offline', reasons: ['超过离线判定时间'] };
  if (!row.reading_id) return { status: 'missing', reasons: ['尚无有效读数'] };

  const missing = [];
  if (sensorProfile === 'water_soil' && row.water_level_mm === null) missing.push('水位');
  if (sensorProfile === 'tension_soil' && row.soil_tension_kpa === null) missing.push('张力');
  for (const [key, label] of [
    ['soil_moisture_percent', '含水率'], ['soil_temperature_c', '温度'], ['soil_ec_us_cm', 'EC'], ['soil_ph', 'pH']
  ]) if (row[key] === null) missing.push(label);
  if (missing.length) return { status: 'missing', reasons: [`缺少${missing.join('、')}`] };

  const thresholds = settings.thresholds || {};
  const abnormal = [];
  if (sensorProfile !== 'soil_only') {
    const primaryRange = sensorProfile === 'water_soil'
      ? thresholds.waterLevelW0
      : row.water_treatment === 'W1' ? thresholds.tensionW1 : thresholds.tensionW2;
    const primaryValue = sensorProfile === 'water_soil' ? row.water_level_mm : row.soil_tension_kpa;
    if (rangeViolation(primaryValue, primaryRange)) abnormal.push(sensorProfile === 'water_soil' ? '水位超阈值' : '张力超阈值');
  }
  for (const [key, thresholdKey, label] of [
    ['soil_moisture_percent', 'soilMoisture', '含水率'],
    ['soil_temperature_c', 'soilTemperature', '温度'],
    ['soil_ec_us_cm', 'soilEc', 'EC'],
    ['soil_ph', 'soilPh', 'pH'],
    ['battery_mv', 'batteryMv', '电池'],
    ['csq', 'csq', '信号']
  ]) if (rangeViolation(row[key], thresholds[thresholdKey])) abnormal.push(`${label}超阈值`);
  const badCommunication = [row.water_status, row.tension_status, row.soil_status, row.cycle_status]
    .some((value) => value && !['ok', 'partial'].includes(value));
  if (badCommunication || row.payload_status === 'error') abnormal.push('传感器通信异常');
  return abnormal.length ? { status: 'abnormal', reasons: abnormal } : { status: 'normal', reasons: [] };
}
