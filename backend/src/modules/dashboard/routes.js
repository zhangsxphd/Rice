import { readSettings } from '../../services/settings.js';
import { evaluatePlotStatus } from '../../services/status-engine.js';
import { rangeStart } from '../../utils/time.js';

export const OVERVIEW_SQL = `
  SELECT
    p.*, b.id AS binding_id, d.id AS device_id, d.imei, d.alias AS device_alias, d.enabled AS device_enabled,
    d.expected_interval_seconds, d.last_ingest_at, d.last_ingest_result,
    r.id AS reading_id, r.collected_at, r.received_at, r.water_level_mm, r.soil_tension_kpa,
    r.soil_moisture_percent, r.soil_temperature_c, r.soil_ec_us_cm, r.soil_ph,
    r.battery_mv, r.csq, r.water_status, r.tension_status, r.soil_status, r.cycle_status, r.payload_status
  FROM plots p
  LEFT JOIN plot_bindings b ON b.plot_id = p.id AND b.active = 1
  LEFT JOIN devices d ON d.id = b.device_id
  LEFT JOIN latest_readings lr ON lr.plot_id = p.id
  LEFT JOIN readings r ON r.id = lr.reading_id
  WHERE p.enabled = 1
  ORDER BY p.display_order
`;

function numberOrNull(value) {
  return value === null || value === undefined ? null : Number(value);
}

export function presentPlot(row, settings, now) {
  const state = evaluatePlotStatus(row, settings, now);
  return {
    id: row.id,
    plotCode: row.plot_code,
    experimentCode: row.experiment_code,
    blockCode: row.block_code,
    waterTreatment: row.water_treatment,
    varietyCode: row.variety_code,
    sensorMode: row.sensor_profile || row.sensor_mode,
    displayOrder: row.display_order,
    imei: row.imei || null,
    deviceAlias: row.device_alias || null,
    deviceEnabled: row.device_enabled === null ? null : Boolean(row.device_enabled),
    lastIngestAt: row.last_ingest_at || null,
    lastIngestResult: row.last_ingest_result || null,
    status: state.status,
    statusReasons: state.reasons,
    collectedAt: row.collected_at || null,
    metrics: {
      waterLevelMm: numberOrNull(row.water_level_mm),
      soilTensionKpa: numberOrNull(row.soil_tension_kpa),
      soilMoisturePercent: numberOrNull(row.soil_moisture_percent),
      soilTemperatureC: numberOrNull(row.soil_temperature_c),
      soilEcUsCm: numberOrNull(row.soil_ec_us_cm),
      soilPh: numberOrNull(row.soil_ph),
      batteryMv: numberOrNull(row.battery_mv),
      csq: numberOrNull(row.csq)
    }
  };
}

function metricSummary(plots, path, predicate = () => true) {
  const values = plots.filter(predicate).map((plot) => plot.metrics[path]).filter((value) => Number.isFinite(value));
  if (!values.length) return { average: null, min: null, max: null, count: 0 };
  return {
    average: values.reduce((sum, value) => sum + value, 0) / values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    count: values.length
  };
}

function summarize(plots) {
  return {
    waterLevel: metricSummary(plots, 'waterLevelMm', (plot) => plot.sensorMode === 'water_soil'),
    soilTension: metricSummary(plots, 'soilTensionKpa', (plot) => plot.sensorMode === 'tension_soil'),
    soilMoisture: metricSummary(plots, 'soilMoisturePercent'),
    soilTemperature: metricSummary(plots, 'soilTemperatureC'),
    soilEc: metricSummary(plots, 'soilEcUsCm'),
    soilPh: metricSummary(plots, 'soilPh')
  };
}

export function dashboardRoutes(app, options) {
  const { database } = options;
  app.get('/overview', async () => {
    const now = Date.now();
    const settings = readSettings(database);
    const plots = database.prepare(OVERVIEW_SQL).all().map((row) => presentPlot(row, settings, now));
    const counts = { total: plots.length, online: 0, normal: 0, abnormal: 0, missing: 0, offline: 0, unbound: 0 };
    for (const plot of plots) {
      counts[plot.status] += 1;
      if (!['offline', 'unbound'].includes(plot.status)) counts.online += 1;
    }
    return { success: true, data: { plots, counts, summary: summarize(plots), settings, generatedAt: new Date(now).toISOString() } };
  });

  app.get('/summary-trends', async (request) => {
    const range = ['1h', '6h', '24h', '7d', 'all'].includes(request.query?.range) ? request.query.range : '24h';
    const start = rangeStart(range);
    const rows = database.prepare(`
      SELECT r.collected_at, COALESCE(p.sensor_profile, p.sensor_mode) AS sensor_mode, r.water_level_mm, r.soil_tension_kpa,
        r.soil_moisture_percent, r.soil_temperature_c, r.soil_ec_us_cm, r.soil_ph
      FROM readings r JOIN plots p ON p.id = r.plot_id
      ${start ? 'WHERE r.collected_at >= ?' : ''}
      ORDER BY r.collected_at
    `).all(...(start ? [start] : []));
    const rowsByTime = new Map();
    for (const row of rows) {
      const group = rowsByTime.get(row.collected_at) || [];
      group.push(row);
      rowsByTime.set(row.collected_at, group);
    }
    const timeGroups = [...rowsByTime.entries()].map(([time, group]) => ({ time, rows: group }));
    const bucketSize = Math.max(1, Math.ceil(timeGroups.length / 60));
    const trends = [];
    for (let index = 0; index < timeGroups.length; index += bucketSize) {
      const timeBucket = timeGroups.slice(index, index + bucketSize);
      const bucket = timeBucket.flatMap((group) => group.rows);
      const average = (key, predicate = () => true) => {
        const values = bucket.filter(predicate).map((row) => row[key]).filter(Number.isFinite);
        return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
      };
      trends.push({
        time: timeBucket[timeBucket.length - 1].time,
        waterLevelMm: average('water_level_mm', (row) => row.sensor_mode === 'water_soil'),
        soilTensionKpa: average('soil_tension_kpa', (row) => row.sensor_mode === 'tension_soil'),
        soilMoisturePercent: average('soil_moisture_percent'),
        soilTemperatureC: average('soil_temperature_c'),
        soilEcUsCm: average('soil_ec_us_cm'),
        soilPh: average('soil_ph')
      });
    }
    return { success: true, data: { range, points: trends } };
  });
}
