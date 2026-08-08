import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import JSZip from 'jszip';
import XlsxPopulate from 'xlsx-populate';

const TEMPLATE_PATH = fileURLToPath(new URL('../../assets/rice-analysis-template.xlsx', import.meta.url));
const MS_PER_DAY = 86_400_000;
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const EXCEL_UNIX_EPOCH = 25_569;
const DATE_FORMAT = 'yyyy-mm-dd hh:mm:ss';

export const ANALYSIS_SHEET_NAMES = [
  '00_导出说明', '01_试验设计', '02_设备绑定',
  '10_W0_水位', '11_W0_含水率', '12_W0_温度', '13_W0_EC', '14_W0_pH',
  '20_W1_张力', '21_W1_含水率', '22_W1_温度', '23_W1_EC', '24_W1_pH',
  '30_W2_张力', '31_W2_含水率', '32_W2_温度', '33_W2_EC', '34_W2_pH',
  '40_处理统计', '41_数据质量', '99_原始长表'
];

export const METRICS = [
  { key: 'water_level_mm', label: '水位', unit: 'mm', numberFormat: '0.0', digits: 1, treatments: ['W0'] },
  { key: 'soil_tension_kpa', label: '张力', unit: 'kPa', numberFormat: '0.0', digits: 1, treatments: ['W1', 'W2'] },
  { key: 'soil_moisture_percent', label: '含水率', unit: '%', numberFormat: '0.0', digits: 1, treatments: ['W0', 'W1', 'W2'] },
  { key: 'soil_temperature_c', label: '温度', unit: '℃', numberFormat: '0.0', digits: 1, treatments: ['W0', 'W1', 'W2'] },
  { key: 'soil_ec_us_cm', label: 'EC', unit: 'μS/cm', numberFormat: '0', digits: 0, treatments: ['W0', 'W1', 'W2'] },
  { key: 'soil_ph', label: 'pH', unit: '', numberFormat: '0.00', digits: 2, treatments: ['W0', 'W1', 'W2'] }
];

const WIDE_SHEETS = [
  ['10_W0_水位', 'W0', 'water_level_mm'], ['11_W0_含水率', 'W0', 'soil_moisture_percent'],
  ['12_W0_温度', 'W0', 'soil_temperature_c'], ['13_W0_EC', 'W0', 'soil_ec_us_cm'], ['14_W0_pH', 'W0', 'soil_ph'],
  ['20_W1_张力', 'W1', 'soil_tension_kpa'], ['21_W1_含水率', 'W1', 'soil_moisture_percent'],
  ['22_W1_温度', 'W1', 'soil_temperature_c'], ['23_W1_EC', 'W1', 'soil_ec_us_cm'], ['24_W1_pH', 'W1', 'soil_ph'],
  ['30_W2_张力', 'W2', 'soil_tension_kpa'], ['31_W2_含水率', 'W2', 'soil_moisture_percent'],
  ['32_W2_温度', 'W2', 'soil_temperature_c'], ['33_W2_EC', 'W2', 'soil_ec_us_cm'], ['34_W2_pH', 'W2', 'soil_ph']
].map(([sheetName, treatment, metricKey]) => ({ sheetName, treatment, metricKey }));

const METRIC_BY_KEY = new Map(METRICS.map((metric) => [metric.key, metric]));
const TEMPLATE_LAST_ROWS = {
  wide: 53,
  design: 27,
  bindings: 27,
  statistics: 1473,
  quality: 27,
  raw: 1179
};

const TABLE_BODY_STYLE = {
  fontFamily: 'Carlito',
  fontSize: 10,
  fontColor: '243447',
  verticalAlignment: 'center',
  border: {
    bottom: { style: 'thin', color: { rgb: 'D9E2EC' } }
  }
};

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function textIdentifier(value) {
  if (value === null || value === undefined || value === '') return '';
  return new XlsxPopulate.RichText().add(String(value));
}

export function shanghaiExcelSerial(isoValue) {
  if (!isoValue) return null;
  const timestamp = Date.parse(isoValue);
  return Number.isFinite(timestamp) ? (timestamp + SHANGHAI_OFFSET_MS) / MS_PER_DAY + EXCEL_UNIX_EPOCH : null;
}

function sampleStandardDeviation(values) {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function clearAndWrite(sheet, { startRow, startColumn = 1, templateLastRow, columnCount, rows }) {
  const lastRow = Math.max(templateLastRow, startRow + Math.max(rows.length, 1) - 1);
  sheet.range(startRow, startColumn, lastRow, startColumn + columnCount - 1).clear();
  if (rows.length) {
    sheet.range(startRow, startColumn, startRow + rows.length - 1, startColumn + columnCount - 1).value(rows);
  }
  return startRow + Math.max(rows.length, 1) - 1;
}

function styleBody(sheet, startRow, endRow, endColumn) {
  if (endRow < startRow) return;
  sheet.range(startRow, 1, endRow, endColumn).style(TABLE_BODY_STYLE);
}

function formatDateColumn(sheet, startRow, endRow, columnNumber) {
  if (endRow >= startRow) sheet.range(startRow, columnNumber, endRow, columnNumber).style('numberFormat', DATE_FORMAT);
}

function exportPlots(database) {
  return database.prepare(`
    SELECT p.*, d.id AS device_id, d.imei, d.alias, d.expected_interval_seconds,
      d.enabled AS device_enabled, b.bound_at,
      MIN(r.collected_at) AS first_collected_at,
      MAX(r.collected_at) AS last_collected_at,
      COUNT(r.id) AS reading_count
    FROM plots p
    LEFT JOIN plot_bindings b ON b.plot_id = p.id AND b.active = 1
    LEFT JOIN devices d ON d.id = b.device_id
    LEFT JOIN readings r ON r.plot_id = p.id
    GROUP BY p.id, d.id, b.id
    ORDER BY p.display_order
  `).all();
}

export function selectAnalysisRows(database) {
  return database.prepare(`
    SELECT r.id, r.plot_id, r.device_id, p.plot_code, p.experiment_code, p.block_code,
      p.water_treatment, p.variety_code, p.display_order, p.sensor_mode, r.imei,
      r.collected_at, r.received_at, r.time_source, r.time_discrepancy_seconds,
      r.schema_version, r.task_version, r.report_sequence, r.water_level_mm, r.soil_tension_kpa,
      r.soil_moisture_percent, r.soil_temperature_c, r.soil_ec_us_cm, r.soil_ph,
      r.battery_mv, r.csq, r.water_status, r.tension_status, r.soil_status,
      r.cycle_status, r.payload_status, r.payload_issues, r.raw_json, r.created_at
    FROM readings r
    JOIN plots p ON p.id = r.plot_id
    ORDER BY r.collected_at, p.display_order, r.id
  `).all();
}

function duplicateCounts(database) {
  return new Map(database.prepare(`
    SELECT plot_code, COUNT(*) AS count
    FROM ingest_logs
    WHERE status = 'duplicated' AND plot_code IS NOT NULL
    GROUP BY plot_code
  `).all().map((row) => [row.plot_code, Number(row.count)]));
}

export function buildWideTable(rows, plots, treatment, metricKey) {
  const treatmentPlots = plots
    .filter((plot) => plot.water_treatment === treatment)
    .sort((left, right) => left.display_order - right.display_order);
  const headers = ['采集时间', ...treatmentPlots.map((plot) => `${plot.experiment_code}（${plot.plot_code}）`)];
  const timeMap = new Map();

  for (const row of rows) {
    if (row.water_treatment !== treatment) continue;
    const timeRow = timeMap.get(row.collected_at) || new Map();
    timeRow.set(row.plot_code, finiteNumber(row[metricKey]));
    timeMap.set(row.collected_at, timeRow);
  }

  const times = [...timeMap.keys()].sort((left, right) => Date.parse(left) - Date.parse(right));
  const data = times.map((time) => [
    shanghaiExcelSerial(time),
    ...treatmentPlots.map((plot) => timeMap.get(time).get(plot.plot_code) ?? null)
  ]);
  return { headers, data, times, plots: treatmentPlots };
}

export function buildTreatmentStatistics(rows) {
  const groups = new Map();
  for (const row of rows) {
    for (const metric of METRICS) {
      if (!metric.treatments.includes(row.water_treatment)) continue;
      const value = finiteNumber(row[metric.key]);
      if (value === null) continue;
      const key = [row.collected_at, metric.key, row.water_treatment, row.variety_code].join('\u0000');
      const group = groups.get(key) || {
        collectedAt: row.collected_at,
        metricKey: metric.key,
        metric: metric.label,
        waterTreatment: row.water_treatment,
        varietyCode: row.variety_code,
        unit: metric.unit,
        values: []
      };
      group.values.push(value);
      groups.set(key, group);
    }
  }

  return [...groups.values()]
    .sort((left, right) => Date.parse(left.collectedAt) - Date.parse(right.collectedAt)
      || METRICS.findIndex((metric) => metric.key === left.metricKey) - METRICS.findIndex((metric) => metric.key === right.metricKey)
      || left.waterTreatment.localeCompare(right.waterTreatment)
      || left.varietyCode.localeCompare(right.varietyCode))
    .map((group) => {
      const mean = group.values.reduce((sum, value) => sum + value, 0) / group.values.length;
      return {
        ...group,
        n: group.values.length,
        mean,
        standardDeviation: sampleStandardDeviation(group.values),
        minimum: Math.min(...group.values),
        maximum: Math.max(...group.values)
      };
    });
}

function maximumGapSeconds(plotRows) {
  let maximum = null;
  for (let index = 1; index < plotRows.length; index += 1) {
    const gap = (Date.parse(plotRows[index].collected_at) - Date.parse(plotRows[index - 1].collected_at)) / 1000;
    if (Number.isFinite(gap)) maximum = maximum === null ? gap : Math.max(maximum, gap);
  }
  return maximum;
}

function maximumConsecutiveMissing(plotRows, intervalSeconds) {
  if (!intervalSeconds || plotRows.length < 2) return 0;
  let maximum = 0;
  for (let index = 1; index < plotRows.length; index += 1) {
    const gapSeconds = (Date.parse(plotRows[index].collected_at) - Date.parse(plotRows[index - 1].collected_at)) / 1000;
    maximum = Math.max(maximum, Math.max(0, Math.round(gapSeconds / intervalSeconds) - 1));
  }
  return maximum;
}

export function buildQualityRows(rows, plots, duplicates = new Map()) {
  const validTimes = rows.map((row) => Date.parse(row.collected_at)).filter(Number.isFinite);
  const firstGlobal = validTimes.length ? Math.min(...validTimes) : null;
  const lastGlobal = validTimes.length ? Math.max(...validTimes) : null;
  const rowsByPlot = new Map();
  for (const row of rows) {
    const list = rowsByPlot.get(row.plot_code) || [];
    list.push(row);
    rowsByPlot.set(row.plot_code, list);
  }

  return plots.map((plot) => {
    const plotRows = (rowsByPlot.get(plot.plot_code) || []).sort((left, right) => Date.parse(left.collected_at) - Date.parse(right.collected_at));
    const intervalSeconds = Number(plot.expected_interval_seconds) || 300;
    const expected = firstGlobal === null || lastGlobal === null ? 0 : Math.floor((lastGlobal - firstGlobal) / (intervalSeconds * 1000)) + 1;
    const actual = plotRows.length;
    const delays = plotRows.map((row) => (Date.parse(row.received_at) - Date.parse(row.collected_at)) / 1000).filter(Number.isFinite);
    const countValid = (field) => plotRows.reduce((count, row) => count + (finiteNumber(row[field]) === null ? 0 : 1), 0);
    const duplicateCount = duplicates.get(plot.plot_code) || 0;
    const missing = Math.max(0, expected - actual);
    const partial = plotRows.filter((row) => row.cycle_status === 'partial').length;
    const errors = plotRows.filter((row) => row.cycle_status === 'error').length;
    const first = plotRows[0]?.collected_at || null;
    const last = plotRows.at(-1)?.collected_at || null;
    return {
      plotCode: plot.plot_code,
      experimentCode: plot.experiment_code,
      waterTreatment: plot.water_treatment,
      varietyCode: plot.variety_code,
      imei: plot.imei || '',
      expected,
      actual,
      missing,
      duplicates: duplicateCount,
      maxConsecutiveMissing: maximumConsecutiveMissing(plotRows, intervalSeconds),
      maxGapSeconds: maximumGapSeconds(plotRows),
      waterLevelValid: countValid('water_level_mm'),
      tensionValid: countValid('soil_tension_kpa'),
      moistureValid: countValid('soil_moisture_percent'),
      temperatureValid: countValid('soil_temperature_c'),
      ecValid: countValid('soil_ec_us_cm'),
      phValid: countValid('soil_ph'),
      partial,
      errors,
      averageDelaySeconds: delays.length ? delays.reduce((sum, value) => sum + value, 0) / delays.length : null,
      maximumDelaySeconds: delays.length ? Math.max(...delays) : null,
      first,
      last,
      conclusion: missing || duplicateCount || partial || errors ? '需关注' : '正常'
    };
  });
}

function populateExplanation(workbook, rows, plots, timeCount) {
  const sheet = workbook.sheet('00_导出说明');
  sheet.range('A4:F19').clear();
  const times = rows.map((row) => row.collected_at).sort((left, right) => Date.parse(left) - Date.parse(right));
  const interval = plots.find((plot) => plot.expected_interval_seconds)?.expected_interval_seconds || 300;
  const leftRows = [
    ['数据来源', 'Rice SQLite实时数据库'],
    ['数据记录数', rows.length],
    ['小区数量', plots.length],
    ['统一时间点数', timeCount],
    ['采集间隔', `${interval / 60} 分钟`],
    ['时间范围（北京时间）', times.length ? `${new Date(Date.parse(times[0]) + SHANGHAI_OFFSET_MS).toISOString().slice(0, 19).replace('T', ' ')} 至 ${new Date(Date.parse(times.at(-1)) + SHANGHAI_OFFSET_MS).toISOString().slice(0, 19).replace('T', ' ')}` : '暂无数据'],
    ['时区', 'Asia/Shanghai（Excel中为真正日期时间）'],
    ['工作簿用途', '按处理、指标和时间重排，便于科研曲线、处理比较与数据质量检查'],
    ['原始数据保留', '99_原始长表保留逐条记录及原始JSON']
  ];
  sheet.range(4, 1, 12, 2).value(leftRows);
  sheet.range(4, 4, 10, 6).value([
    [1, '空白单元格', '表示数据缺失；不使用0、--或NaN替代'],
    [2, '未配置指标', 'W0不配置张力；W1/W2不配置水位，不计为缺测'],
    [3, '水位', 'mm，1位小数'],
    [4, '张力', 'kPa，负值保留为真正数值'],
    [5, '含水率/温度/EC/pH', '% / ℃ / μS·cm⁻¹ / 无量纲'],
    [6, '电池', 'mV除以1000换算为V，保留3位小数'],
    [7, '信号', '保留CSQ整数，不换算为dBm']
  ]);
  sheet.range(16, 1, 19, 3).value([
    ['数值类型', '通过', '张力及全部指标均写入Excel数值单元格'],
    ['时间规则', '通过', '科研曲线使用collected_at；received_at仅用于质量分析'],
    ['工作表', '通过', `${ANALYSIS_SHEET_NAMES.length}张工作表，区分W0水位与W1/W2张力`],
    ['图表', '通过', '15张指标表均保留原始折线图，缺失值显示断线且不平滑']
  ]);
}

function populateDesign(workbook, plots) {
  const sheet = workbook.sheet('01_试验设计');
  const data = plots.map((plot) => [
    plot.plot_code, plot.experiment_code, plot.block_code, plot.water_treatment, plot.variety_code,
    plot.sensor_mode,
    plot.sensor_mode === 'water_soil' ? '水位、含水率、温度、EC、pH' : '张力、含水率、温度、EC、pH'
  ]);
  const endRow = clearAndWrite(sheet, { startRow: 4, templateLastRow: TEMPLATE_LAST_ROWS.design, columnCount: 7, rows: data });
  styleBody(sheet, 4, endRow, 7);
  sheet.range(3, 1, endRow, 7).autoFilter();
  sheet.freezePanes(1, 3);
  sheet.column(1).width(14);
  sheet.column(2).width(18);
  sheet.column(7).width(34);
}

function populateBindings(workbook, plots) {
  const sheet = workbook.sheet('02_设备绑定');
  const data = plots.map((plot) => [
    plot.plot_code, plot.experiment_code, textIdentifier(plot.imei), plot.sensor_mode,
    shanghaiExcelSerial(plot.first_collected_at), shanghaiExcelSerial(plot.last_collected_at),
    Number(plot.reading_count), plot.imei ? (plot.device_enabled ? '正常' : '已停用') : '未绑定'
  ]);
  const endRow = clearAndWrite(sheet, { startRow: 4, templateLastRow: TEMPLATE_LAST_ROWS.bindings, columnCount: 8, rows: data });
  styleBody(sheet, 4, endRow, 8);
  formatDateColumn(sheet, 4, endRow, 5);
  formatDateColumn(sheet, 4, endRow, 6);
  if (endRow >= 4) sheet.range(4, 3, endRow, 3).style('numberFormat', '@');
  sheet.range(3, 1, endRow, 8).autoFilter();
  sheet.freezePanes(1, 3);
  sheet.column(1).width(14);
  sheet.column(2).width(18);
  sheet.column(3).width(20);
  sheet.column(5).width(20);
  sheet.column(6).width(20);
}

function populateWideSheets(workbook, rows, plots) {
  const chartEndRows = new Map();
  for (const config of WIDE_SHEETS) {
    const metric = METRIC_BY_KEY.get(config.metricKey);
    const sheet = workbook.sheet(config.sheetName);
    const table = buildWideTable(rows, plots, config.treatment, config.metricKey);
    sheet.range(4, 1, 4, 9).value([table.headers]);
    const endRow = clearAndWrite(sheet, { startRow: 5, templateLastRow: TEMPLATE_LAST_ROWS.wide, columnCount: 9, rows: table.data });
    styleBody(sheet, 5, endRow, 9);
    formatDateColumn(sheet, 5, endRow, 1);
    if (endRow >= 5) sheet.range(5, 2, endRow, 9).style('numberFormat', metric.numberFormat);
    sheet.range(4, 1, endRow, 9).autoFilter();
    sheet.freezePanes(1, 4);
    sheet.column('A').width(22);
    for (let column = 2; column <= 9; column += 1) sheet.column(column).width(18);
    chartEndRows.set(config.sheetName, Math.max(5, 4 + table.data.length));
  }
  return chartEndRows;
}

function populateStatistics(workbook, statistics) {
  const sheet = workbook.sheet('40_处理统计');
  const data = statistics.map((row) => [
    shanghaiExcelSerial(row.collectedAt), row.metric, row.waterTreatment, row.varietyCode,
    row.n, row.mean, row.standardDeviation, row.minimum, row.maximum, row.unit
  ]);
  const endRow = clearAndWrite(sheet, { startRow: 4, templateLastRow: TEMPLATE_LAST_ROWS.statistics, columnCount: 10, rows: data });
  styleBody(sheet, 4, endRow, 10);
  formatDateColumn(sheet, 4, endRow, 1);
  if (endRow >= 4) {
    sheet.range(4, 5, endRow, 5).style('numberFormat', '0');
    sheet.range(4, 6, endRow, 9).style('numberFormat', '0.00');
  }
  sheet.range(3, 1, endRow, 10).autoFilter();
  sheet.freezePanes(1, 3);
  sheet.column(1).width(22);
  for (let column = 5; column <= 9; column += 1) sheet.column(column).width(14);
}

function populateQuality(workbook, qualityRows) {
  const sheet = workbook.sheet('41_数据质量');
  sheet.range(3, 1, 3, 24).value([[
    '小区编号', '试验编号', '水分处理', '品种', 'IMEI', '应有记录数', '实际记录数', '缺失记录数',
    '重复记录数', '最大连续缺测次数', '最大时间间隔（秒）', '水位有效数', '张力有效数', '含水率有效数',
    '温度有效数', 'EC有效数', 'pH有效数', 'cycle_status=partial数量', 'cycle_status=error数量',
    '平均接收延迟秒', '最大接收延迟秒', '首次采集时间', '最后采集时间', '综合结论'
  ]]);
  const data = qualityRows.map((row) => [
    row.plotCode, row.experimentCode, row.waterTreatment, row.varietyCode, textIdentifier(row.imei),
    row.expected, row.actual, row.missing, row.duplicates, row.maxConsecutiveMissing, row.maxGapSeconds,
    row.waterLevelValid, row.tensionValid, row.moistureValid, row.temperatureValid, row.ecValid, row.phValid,
    row.partial, row.errors, row.averageDelaySeconds, row.maximumDelaySeconds,
    shanghaiExcelSerial(row.first), shanghaiExcelSerial(row.last), row.conclusion
  ]);
  const endRow = clearAndWrite(sheet, { startRow: 4, templateLastRow: TEMPLATE_LAST_ROWS.quality, columnCount: 24, rows: data });
  styleBody(sheet, 4, endRow, 24);
  if (endRow >= 4) sheet.range(4, 5, endRow, 5).style('numberFormat', '@');
  formatDateColumn(sheet, 4, endRow, 22);
  formatDateColumn(sheet, 4, endRow, 23);
  if (endRow >= 4) sheet.range(4, 20, endRow, 21).style('numberFormat', '0.0');
  sheet.range(3, 1, endRow, 24).autoFilter();
  sheet.freezePanes(1, 3);
  sheet.column(22).width(20);
  sheet.column(23).width(20);
  sheet.column(5).width(20);
  for (let column = 6; column <= 21; column += 1) sheet.column(column).width(14);
}

function populateRaw(workbook, rows) {
  const sheet = workbook.sheet('99_原始长表');
  const data = rows.map((row) => [
    shanghaiExcelSerial(row.collected_at), shanghaiExcelSerial(row.received_at), row.plot_code,
    row.experiment_code, row.block_code, row.water_treatment, row.variety_code, row.sensor_mode, textIdentifier(row.imei),
    finiteNumber(row.water_level_mm), finiteNumber(row.soil_tension_kpa), finiteNumber(row.soil_moisture_percent),
    finiteNumber(row.soil_temperature_c), finiteNumber(row.soil_ec_us_cm), finiteNumber(row.soil_ph),
    finiteNumber(row.battery_mv) === null ? null : Number(row.battery_mv) / 1000,
    finiteNumber(row.csq), row.water_status, row.tension_status, row.soil_status,
    row.cycle_status, row.payload_status, row.raw_json
  ]);
  const endRow = clearAndWrite(sheet, { startRow: 4, templateLastRow: TEMPLATE_LAST_ROWS.raw, columnCount: 23, rows: data });
  styleBody(sheet, 4, endRow, 23);
  if (endRow >= 4) sheet.range(4, 9, endRow, 9).style('numberFormat', '@');
  formatDateColumn(sheet, 4, endRow, 1);
  formatDateColumn(sheet, 4, endRow, 2);
  if (endRow >= 4) {
    sheet.range(4, 10, endRow, 13).style('numberFormat', '0.0');
    sheet.range(4, 14, endRow, 14).style('numberFormat', '0');
    sheet.range(4, 15, endRow, 15).style('numberFormat', '0.00');
    sheet.range(4, 16, endRow, 16).style('numberFormat', '0.000');
    sheet.range(4, 17, endRow, 17).style('numberFormat', '0');
  }
  sheet.range(3, 1, endRow, 23).autoFilter();
  sheet.freezePanes(1, 3);
  sheet.column(1).width(22);
  sheet.column(2).width(22);
  sheet.column(9).width(20);
  for (let column = 10; column <= 17; column += 1) sheet.column(column).width(14);
  sheet.column(23).width(48);
}

async function updateChartRanges(buffer, chartEndRows) {
  const zip = await JSZip.loadAsync(buffer);
  const chartFiles = Object.keys(zip.files).filter((name) => /^xl\/drawings\/charts\/chart\d+\.xml$/.test(name));
  for (const name of chartFiles) {
    let xml = await zip.file(name).async('string');
    const sheetMatch = xml.match(/<c:f>'([^']+)'!\$A\$5:\$A\$\d+<\/c:f>/);
    if (!sheetMatch) continue;
    const endRow = chartEndRows.get(sheetMatch[1]) || 5;
    xml = xml.replace(/(\$[A-I]\$5:\$[A-I]\$)\d+/g, `$1${endRow}`);
    if (!xml.includes('<c:dispBlanksAs')) xml = xml.replace('</c:chart>', '<c:dispBlanksAs val="gap" /></c:chart>');
    zip.file(name, xml);
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

async function loadTemplateWorkbook() {
  const zip = await JSZip.loadAsync(await fs.readFile(TEMPLATE_PATH));
  const spreadsheetXml = Object.keys(zip.files).filter((name) =>
    /^xl\/(workbook|styles|sharedStrings)\.xml$/.test(name)
    || /^xl\/(worksheets|tables)\/[^/]+\.xml$/.test(name));
  for (const name of spreadsheetXml) {
    const file = zip.file(name);
    if (!file) continue;
    const xml = await file.async('string');
    zip.file(name, xml.replace(/(<\/?)(x:)/g, '$1').replace('xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"', 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'));
  }
  const normalized = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return XlsxPopulate.fromDataAsync(normalized);
}

export async function buildAnalysisWorkbook(database) {
  const rows = selectAnalysisRows(database);
  const plots = exportPlots(database);
  const statistics = buildTreatmentStatistics(rows);
  const qualityRows = buildQualityRows(rows, plots, duplicateCounts(database));
  const workbook = await loadTemplateWorkbook();
  const uniqueTimeCount = new Set(rows.map((row) => row.collected_at)).size;

  populateExplanation(workbook, rows, plots, uniqueTimeCount);
  populateDesign(workbook, plots);
  populateBindings(workbook, plots);
  const chartEndRows = populateWideSheets(workbook, rows, plots);
  populateStatistics(workbook, statistics);
  populateQuality(workbook, qualityRows);
  populateRaw(workbook, rows);

  const output = await workbook.outputAsync('nodebuffer');
  return updateChartRanges(output, chartEndRows);
}

export function treatmentStatisticsRows(database) {
  return buildTreatmentStatistics(selectAnalysisRows(database)).map((row) => ({
    collected_at: row.collectedAt,
    metric: row.metric,
    water_treatment: row.waterTreatment,
    variety_code: row.varietyCode,
    n: row.n,
    mean: row.mean,
    standard_deviation: row.standardDeviation,
    minimum: row.minimum,
    maximum: row.maximum,
    unit: row.unit
  }));
}
