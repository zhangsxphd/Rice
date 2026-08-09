import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { buildApp } from '../src/app.js';
import { openDatabase } from '../src/db/database.js';
import { createApiKey } from '../src/services/api-key-auth.js';
import { PLOT_SEED } from '../src/db/seed-plots.js';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rice-test-'));
const databasePath = path.join(tempDir, 'rice.sqlite');
const backupDir = path.join(tempDir, 'backups');
let database;
let app;
let apiKey;

async function bind(plotCode, imei) {
  const response = await app.inject({ method: 'POST', url: `/api/plots/${plotCode}/bind`, payload: { imei } });
  assert.equal(response.statusCode, 200, response.body);
}

function w0Payload(imei, timestamp, overrides = {}) {
  return {
    schema_version: 1, imei, timestamp, report_sequence: timestamp,
    sensor_mode: 'water_soil', water_level_mm: 26.4, water_4_20ma_status: 'ok',
    soil_moisture_percent: 43.2, soil_temperature_c: 27.1, soil_ec_us_cm: 816,
    soil_ph: 6.52, soil_rs485_status: 'ok', battery_mv: 3998, csq: 21, cycle_status: 'ok',
    ...overrides
  };
}

function w1Payload(imei, timestamp, overrides = {}) {
  return {
    schema_version: 1, imei, timestamp, report_sequence: timestamp,
    sensor_mode: 'tension_soil', soil_tension_kpa: -19.5, soil_tension_rs485_status: 'ok',
    soil_moisture_percent: 36.8, soil_temperature_c: 27, soil_ec_us_cm: 902,
    soil_ph: 6.47, soil_rs485_status: 'ok', battery_mv: 4005, csq: 20, cycle_status: 'ok',
    ...overrides
  };
}

function soilOnlyPayload(imei, timestamp, overrides = {}) {
  return {
    schema_version: 1, imei, timestamp, report_sequence: timestamp,
    sensor_mode: 'soil_only',
    soil_moisture_percent: 38.6, soil_temperature_c: 26.8, soil_ec_us_cm: 845,
    soil_ph: 6.45, soil_rs485_status: 'ok', battery_mv: 3992, csq: 19, cycle_status: 'ok',
    ...overrides
  };
}

async function ingest(payload, key = apiKey) {
  return app.inject({ method: 'POST', url: '/api/device-ingest/d100l2', headers: { 'x-api-key': key }, payload });
}

async function ingestWithoutContentType(payload, key = apiKey) {
  return app.inject({
    method: 'POST',
    url: `/api/device-ingest/d100l2?api_key=${encodeURIComponent(key)}`,
    payload: JSON.stringify(payload)
  });
}

before(async () => {
  database = openDatabase(databasePath);
  app = await buildApp({ database, databasePath, backupDir, nodeEnv: 'test', adminAuthMode: 'none', corsOrigin: '*', maxIngestBodyBytes: 16384 });
  await app.ready();
  apiKey = createApiKey(database, 'test').apiKey;
});

after(async () => {
  await app.close();
  database.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('初始化24个小区且映射完全正确', () => {
  const plots = database.prepare('SELECT * FROM plots ORDER BY display_order').all();
  assert.equal(plots.length, 24);
  assert.deepEqual(plots.map((plot) => [plot.plot_code, plot.experiment_code, plot.sensor_mode]), PLOT_SEED.map((plot) => [plot.plotCode, plot.experimentCode, plot.sensorMode]));
  assert.deepEqual(
    plots.filter((plot) => plot.sensor_profile === 'soil_only').map((plot) => plot.plot_code),
    PLOT_SEED.filter((plot) => plot.sensorProfile === 'soil_only').map((plot) => plot.plotCode)
  );
});

test('鉴权、IMEI、W0/W1入库与去重', async () => {
  await bind('P01', '862323089930701');
  await bind('P09', '862323089930703');
  const timestamp = Math.floor(Date.now() / 1000) - 30;
  const unauthorized = await ingest(w0Payload('862323089930701', timestamp), 'wrong');
  assert.equal(unauthorized.statusCode, 401);
  const unknown = await ingest(w0Payload('862323089939999', timestamp));
  assert.equal(unknown.statusCode, 404);
  const w0 = await ingest(w0Payload('862323089930701', timestamp));
  assert.equal(w0.statusCode, 200);
  assert.equal(w0.json().data.inserted, true);
  const duplicate = await ingest(w0Payload('862323089930701', timestamp));
  assert.equal(duplicate.json().data.duplicated, true);
  const w1 = await ingest(w1Payload('862323089930703', timestamp));
  assert.equal(w1.statusCode, 200);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM readings').get().count, 2);
  const trends = await app.inject({ method: 'GET', url: '/api/dashboard/summary-trends?range=all' });
  assert.equal(trends.statusCode, 200);
  assert.equal(trends.json().data.points.length, 1, '同一采集时刻的多小区记录应聚合为一个趋势点');
});

test('已登记未绑定IMEI返回404', async () => {
  const time = new Date().toISOString();
  database.prepare('INSERT INTO devices (imei, enabled, expected_interval_seconds, created_at, updated_at) VALUES (?, 1, 300, ?, ?)')
    .run('862323089930799', time, time);
  const response = await ingest(w0Payload('862323089930799', Math.floor(Date.now() / 1000)));
  assert.equal(response.statusCode, 404);
  assert.equal(response.json().error.code, 'DEVICE_NOT_BOUND');
});

test('D100L无Content-Type的JSON正文仍可鉴权并入库', async () => {
  const timestamp = Math.floor(Date.now() / 1000) - 5;
  const response = await ingestWithoutContentType(w1Payload('862323089930703', timestamp));
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().data.inserted, true);
});

test('仅土壤四参数小区不要求水位或张力', async () => {
  await bind('P02', '862323089930702');
  const timestamp = Math.floor(Date.now() / 1000) - 5;
  const response = await ingest(soilOnlyPayload('862323089930702', timestamp));
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().data.payloadStatus, 'ok');
  const stored = database.prepare('SELECT sensor_mode, water_level_mm, soil_tension_kpa FROM readings WHERE imei = ? ORDER BY id DESC LIMIT 1').get('862323089930702');
  assert.deepEqual(stored, { sensor_mode: 'soil_only', water_level_mm: null, soil_tension_kpa: null });
  const overview = await app.inject({ method: 'GET', url: '/api/dashboard/overview' });
  const plot = overview.json().data.plots.find((item) => item.plotCode === 'P02');
  assert.equal(plot.sensorMode, 'soil_only');
  assert.equal(plot.status, 'normal');
});

test('缺测值不写成0且旧读数不覆盖latest', async () => {
  const base = Math.floor(Date.now() / 1000) - 10;
  const missing = w1Payload('862323089930703', base, { soil_tension_kpa: undefined });
  const response = await ingest(missing);
  assert.equal(response.json().data.payloadStatus, 'partial');
  const stored = database.prepare('SELECT * FROM readings WHERE device_id = (SELECT id FROM devices WHERE imei = ?) AND collected_at = ?')
    .get('862323089930703', new Date(base * 1000).toISOString());
  assert.equal(stored.soil_tension_kpa, null);
  const latestBefore = database.prepare('SELECT collected_at FROM latest_readings WHERE plot_id = (SELECT id FROM plots WHERE plot_code = ?)').get('P09').collected_at;
  await ingest(w1Payload('862323089930703', base - 3600));
  const latestAfter = database.prepare('SELECT collected_at FROM latest_readings WHERE plot_id = (SELECT id FROM plots WHERE plot_code = ?)').get('P09').collected_at;
  assert.equal(latestAfter, latestBefore);
});

test('同一IMEI不能绑定两个活动小区', async () => {
  const response = await app.inject({ method: 'POST', url: '/api/plots/P04/bind', payload: { imei: '862323089930703' } });
  assert.equal(response.statusCode, 409);
});

test('CSV含BOM和标准列，清理测试数据保留配置与绑定', async () => {
  const csv = await app.inject({ method: 'GET', url: '/api/exports/readings.csv' });
  assert.equal(csv.statusCode, 200);
  assert.equal(csv.body.charCodeAt(0), 0xFEFF);
  assert.match(csv.body, /plot_code,experiment_code/);
  const before = new Date(Date.now() + 60_000).toISOString();
  await app.inject({ method: 'PATCH', url: '/api/settings', payload: { experiment: { formalDataStartAt: before, timezone: 'Asia/Shanghai' } } });
  const cleared = await app.inject({ method: 'POST', url: '/api/settings/clear-test-data', payload: {} });
  assert.equal(cleared.statusCode, 200, cleared.body);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM readings').get().count, 0);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM plots').get().count, 24);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM plot_bindings WHERE active = 1').get().count, 3);
});
