import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import JSZip from 'jszip';
import XlsxPopulate from 'xlsx-populate';
import { buildApp } from '../src/app.js';
import { openDatabase } from '../src/db/database.js';
import { PLOT_SEED } from '../src/db/seed-plots.js';
import { ANALYSIS_SHEET_NAMES, shanghaiExcelSerial } from '../src/services/analysis-export.js';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rice-analysis-test-'));
const databasePath = path.join(tempDir, 'rice.sqlite');
const backupDir = path.join(tempDir, 'backups');
const collectedTimes = [
  '2026-08-06T11:15:53.000Z',
  '2026-08-06T11:20:53.000Z',
  '2026-08-06T11:25:53.000Z'
];
let database;
let app;
let response;
let workbook;

function insertFixtureData() {
  const now = '2026-08-06T11:30:00.000Z';
  const insertDevice = database.prepare(`
    INSERT INTO devices (imei, alias, enabled, expected_interval_seconds, created_at, updated_at)
    VALUES (?, ?, 1, 300, ?, ?)
  `);
  const insertBinding = database.prepare(`
    INSERT INTO plot_bindings (plot_id, device_id, bound_at, active, created_at)
    VALUES (?, ?, ?, 1, ?)
  `);
  const insertReading = database.prepare(`
    INSERT INTO readings (
      plot_id, device_id, imei, collected_at, received_at, time_source, time_discrepancy_seconds,
      schema_version, task_version, report_sequence, sensor_mode, water_level_mm, soil_tension_kpa,
      soil_moisture_percent, soil_temperature_c, soil_ec_us_cm, soil_ph, battery_mv, csq,
      water_status, tension_status, soil_status, cycle_status, payload_status, payload_issues, raw_json, created_at
    ) VALUES (?, ?, ?, ?, ?, 'device', 1, 1, 'test', ?, ?, ?, ?, ?, ?, ?, ?, 3988, 20, ?, ?, 'ok', ?, ?, '[]', ?, ?)
  `);

  database.transaction(() => {
    for (const plotSeed of PLOT_SEED) {
      const plot = database.prepare('SELECT * FROM plots WHERE plot_code = ?').get(plotSeed.plotCode);
      const imei = `86232308993${String(plot.display_order).padStart(4, '0')}`;
      const deviceId = Number(insertDevice.run(imei, plot.experiment_code, now, now).lastInsertRowid);
      insertBinding.run(plot.id, deviceId, now, now);

      for (let timeIndex = 0; timeIndex < collectedTimes.length; timeIndex += 1) {
        if (plot.plot_code === 'P24' && timeIndex === 1) continue;
        const collectedAt = collectedTimes[timeIndex];
        const receivedAt = new Date(Date.parse(collectedAt) + 1200).toISOString();
        const blockNumber = Number(plot.block_code.slice(1));
        const tension = plot.water_treatment === 'W0'
          ? null
          : plot.water_treatment === 'W1' && plot.variety_code === 'V1'
            ? -10 * blockNumber - timeIndex
            : -20 - plot.display_order - timeIndex;
        const water = plot.water_treatment === 'W0' ? 20 + plot.display_order + timeIndex : null;
        const cycleStatus = plot.plot_code === 'P04' && timeIndex === 1 ? 'partial' : 'ok';
        const payloadStatus = cycleStatus === 'partial' ? 'partial' : 'ok';
        const tensionValue = plot.plot_code === 'P04' && timeIndex === 1 ? null : tension;
        const raw = JSON.stringify({ imei, timestamp: Math.floor(Date.parse(collectedAt) / 1000), soil_tension_kpa: tensionValue });
        insertReading.run(
          plot.id, deviceId, imei, collectedAt, receivedAt, timeIndex + 1, plot.sensor_mode,
          water, tensionValue, 30 + plot.display_order / 10, 25 + timeIndex / 10,
          800 + plot.display_order, 6.4 + plot.display_order / 100,
          plot.water_treatment === 'W0' ? 'ok' : null,
          plot.water_treatment === 'W0' ? null : 'ok', cycleStatus, payloadStatus, raw, receivedAt
        );
      }
    }
    database.prepare(`
      INSERT INTO ingest_logs (imei, plot_code, status, created_at)
      VALUES (?, 'P03', 'duplicated', ?)
    `).run('862323089930003', now);
  })();
}

before(async () => {
  database = openDatabase(databasePath);
  insertFixtureData();
  app = await buildApp({ database, databasePath, backupDir, nodeEnv: 'test', adminAuthMode: 'none', corsOrigin: '*', maxIngestBodyBytes: 16384 });
  await app.ready();
  response = await app.inject({ method: 'GET', url: '/api/export/analysis.xlsx' });
  assert.equal(response.statusCode, 200, response.body);
  workbook = await XlsxPopulate.fromDataAsync(response.rawPayload);
});

after(async () => {
  await app.close();
  database.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('科研分析Excel可以打开且工作表名称和数量正确', () => {
  assert.match(response.headers['content-type'], /spreadsheetml\.sheet/);
  assert.deepEqual(workbook.sheets().map((sheet) => sheet.name()), ANALYSIS_SHEET_NAMES);
  assert.equal(workbook.sheets().length, 21);
});

test('24个小区宽表映射正确且传感器配置严格区分', () => {
  assert.deepEqual(workbook.sheet('10_W0_水位').range('A4:I4').value()[0], [
    '采集时间', 'B1-W0-V1（P01）', 'B1-W0-V2（P02）', 'B2-W0-V1（P07）', 'B2-W0-V2（P08）',
    'B3-W0-V1（P13）', 'B3-W0-V2（P14）', 'B4-W0-V1（P19）', 'B4-W0-V2（P20）'
  ]);
  assert.equal(workbook.sheet('15_W0_张力'), undefined);
  assert.equal(workbook.sheet('25_W1_水位'), undefined);
  assert.equal(workbook.sheet('35_W2_水位'), undefined);
  assert.deepEqual(PLOT_SEED.map((plot) => plot.plotCode), Array.from({ length: 24 }, (_, index) => `P${String(index + 1).padStart(2, '0')}`));
});

test('张力和全部时间为Excel数值，北京时间转换正确', () => {
  const sheet = workbook.sheet('20_W1_张力');
  assert.equal(typeof sheet.cell('B5').value(), 'number');
  assert.equal(sheet.cell('B5').value(), -10);
  assert.ok(Math.abs(sheet.cell('A5').value() - shanghaiExcelSerial(collectedTimes[0])) < 1e-9);
  assert.equal(sheet.cell('A5').style('numberFormat'), 'yyyy-mm-dd hh:mm:ss');
  assert.equal(typeof workbook.sheet('99_原始长表').cell('K6').value(), 'number');
});

test('宽表时间唯一升序、同一小区每个时间至多一个值且缺测为空', () => {
  const sheet = workbook.sheet('20_W1_张力');
  const times = sheet.range('A5:A7').value().flat();
  assert.equal(new Set(times).size, times.length);
  assert.deepEqual(times, [...times].sort((left, right) => left - right));
  assert.equal(sheet.range('B5:B7').value().flat().length, 3);
  assert.notEqual(sheet.cell('C6').value(), 0);
  assert.ok(sheet.cell('C6').value() === undefined || sheet.cell('C6').value() === null);
});

test('处理统计按采集时间、W处理和品种计算四区组重复', () => {
  const values = workbook.sheet('40_处理统计').range('A4:J200').value();
  const row = values.find((item) => item[0] === shanghaiExcelSerial(collectedTimes[0]) && item[1] === '张力' && item[2] === 'W1' && item[3] === 'V1');
  assert.ok(row, '应找到W1-V1张力统计行');
  assert.equal(row[4], 4);
  assert.equal(row[5], -25);
  assert.ok(Math.abs(row[6] - 12.909944487358056) < 1e-9);
});

test('数据质量包含缺失、连续缺测、重复和接收延迟', () => {
  const values = workbook.sheet('41_数据质量').range('A4:X27').value();
  const p03 = values.find((row) => row[0] === 'P03');
  const p24 = values.find((row) => row[0] === 'P24');
  assert.equal(p03[8], 1);
  assert.equal(p24[7], 1);
  assert.equal(p24[9], 1);
  assert.equal(p03[19], 1.2);
  assert.equal(p03[20], 1.2);
});

test('15个原生图表保留、缺失值为断线且曲线不平滑', async () => {
  const zip = await JSZip.loadAsync(response.rawPayload);
  const chartNames = Object.keys(zip.files).filter((name) => /^xl\/drawings\/charts\/chart\d+\.xml$/.test(name));
  assert.equal(chartNames.length, 15);
  const chartXml = await zip.file(chartNames[0]).async('string');
  assert.match(chartXml, /<c:dispBlanksAs val="gap"/);
  assert.doesNotMatch(chartXml, /<c:smooth val="1"/);
});

test('原始CSV和处理统计CSV接口继续可用且负张力不带单引号', async () => {
  const raw = await app.inject({ method: 'GET', url: '/api/export/raw.csv' });
  assert.equal(raw.statusCode, 200);
  assert.equal(raw.body.charCodeAt(0), 0xFEFF);
  assert.match(raw.body, /,-10,/);
  assert.doesNotMatch(raw.body, /,'-10,/);
  const legacy = await app.inject({ method: 'GET', url: '/api/exports/readings.csv' });
  assert.equal(legacy.statusCode, 200);
  const statistics = await app.inject({ method: 'GET', url: '/api/export/treatment-statistics.csv' });
  assert.equal(statistics.statusCode, 200);
  assert.match(statistics.body, /water_treatment,variety_code/);
});
