import { parseDeviceTime } from '../utils/time.js';
import { redactSecrets } from './api-key-auth.js';

function first(payload, aliases) {
  for (const key of aliases) {
    if (payload[key] !== undefined && payload[key] !== null && payload[key] !== '') return payload[key];
  }
  return undefined;
}

function number(payload, aliases) {
  const value = first(payload, aliases);
  if (value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function status(payload, aliases) {
  const value = first(payload, aliases);
  return value === undefined ? null : String(value).trim().toLowerCase().slice(0, 40);
}

function soilSource(payload) {
  const probe = Array.isArray(payload.soil_probes) && payload.soil_probes.length ? payload.soil_probes[0] : {};
  return { ...probe, ...payload };
}

export function normalizePayload(payload, plot, receivedAt = new Date()) {
  const soil = soilSource(payload);
  let batteryMv = number(payload, ['battery_mv', 'battery', 'vbat']);
  if (batteryMv !== null && batteryMv <= 100) batteryMv *= 1000;
  if (batteryMv !== null) batteryMv = Math.round(batteryMv);

  const reading = {
    ...parseDeviceTime(payload, receivedAt),
    schemaVersion: number(payload, ['schema_version']),
    taskVersion: first(payload, ['task_version']) ? String(first(payload, ['task_version'])).slice(0, 100) : null,
    reportSequence: number(payload, ['report_sequence']),
    sensorMode: plot.sensor_mode,
    waterLevelMm: number(payload, ['water_level_mm', 'level']),
    soilTensionKpa: number(payload, ['soil_tension_kpa', 'tension']),
    soilMoisturePercent: number(soil, ['soil_moisture_percent', 'moisture_percent', 'moisture']),
    soilTemperatureC: number(soil, ['soil_temperature_c', 'temperature_c', 'temperature']),
    soilEcUsCm: number(soil, ['soil_ec_us_cm', 'ec_us_cm', 'ec']),
    soilPh: number(soil, ['soil_ph', 'ph']),
    batteryMv,
    csq: number(payload, ['csq', 'signal']),
    waterStatus: status(payload, ['water_4_20ma_status', 'water_status']),
    tensionStatus: status(payload, ['soil_tension_rs485_status', 'tension_status']),
    soilStatus: status(payload, ['soil_rs485_status', 'soil_status']) || status(soil, ['status']),
    cycleStatus: status(payload, ['cycle_status']),
    rawJson: redactSecrets(payload)
  };

  const issues = [];
  const expected = plot.sensor_mode === 'water_soil' ? 'waterLevelMm' : 'soilTensionKpa';
  const expectedStatus = plot.sensor_mode === 'water_soil' ? reading.waterStatus : reading.tensionStatus;
  if (plot.sensor_mode === 'water_soil' && reading.soilTensionKpa !== null) issues.push('unexpected_field:soil_tension_kpa');
  if (plot.sensor_mode === 'tension_soil' && reading.waterLevelMm !== null) issues.push('unexpected_field:water_level_mm');
  if (reading[expected] === null) issues.push(`missing:${plot.sensor_mode === 'water_soil' ? 'water_level_mm' : 'soil_tension_kpa'}`);
  if (expectedStatus === 'ok' && reading[expected] === null) issues.push('inconsistent:primary_status_ok_but_value_missing');
  for (const [field, value] of [
    ['soil_moisture_percent', reading.soilMoisturePercent],
    ['soil_temperature_c', reading.soilTemperatureC],
    ['soil_ec_us_cm', reading.soilEcUsCm],
    ['soil_ph', reading.soilPh]
  ]) if (value === null) issues.push(`missing:${field}`);
  if (reading.timeDiscrepancySeconds !== null && reading.timeDiscrepancySeconds > 60) issues.push('time_discrepancy');

  const communicationError = [reading.waterStatus, reading.tensionStatus, reading.soilStatus, reading.cycleStatus]
    .some((value) => value && !['ok', 'partial'].includes(value));
  reading.payloadIssues = issues;
  reading.payloadStatus = communicationError ? 'error' : issues.some((issue) => issue.startsWith('missing:')) ? 'partial' : 'ok';
  return reading;
}
