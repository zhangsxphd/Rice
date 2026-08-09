import { OVERVIEW_SQL, presentPlot } from '../dashboard/routes.js';
import { readSettings } from '../../services/settings.js';
import { rangeStart } from '../../utils/time.js';

function getPlot(database, plotCode) {
  return database.prepare(`${OVERVIEW_SQL.replace('WHERE p.enabled = 1', 'WHERE p.plot_code = ?')}`).get(plotCode);
}

function presentReading(row) {
  return {
    id: row.id,
    collectedAt: row.collected_at,
    receivedAt: row.received_at,
    timeSource: row.time_source,
    waterLevelMm: row.water_level_mm,
    soilTensionKpa: row.soil_tension_kpa,
    soilMoisturePercent: row.soil_moisture_percent,
    soilTemperatureC: row.soil_temperature_c,
    soilEcUsCm: row.soil_ec_us_cm,
    soilPh: row.soil_ph,
    batteryMv: row.battery_mv,
    csq: row.csq,
    payloadStatus: row.payload_status
  };
}

export function plotsRoutes(app, { database }) {
  app.get('/', async () => {
    const settings = readSettings(database);
    return { success: true, data: database.prepare(OVERVIEW_SQL).all().map((row) => presentPlot(row, settings, Date.now())) };
  });

  app.get('/:plotCode', async (request, reply) => {
    const row = getPlot(database, request.params.plotCode);
    if (!row) return reply.code(404).send({ success: false, error: { code: 'PLOT_NOT_FOUND', message: '小区不存在' } });
    return { success: true, data: presentPlot(row, readSettings(database), Date.now()) };
  });

  app.get('/:plotCode/history', async (request, reply) => {
    const plot = database.prepare('SELECT * FROM plots WHERE plot_code = ?').get(request.params.plotCode);
    if (!plot) return reply.code(404).send({ success: false, error: { code: 'PLOT_NOT_FOUND', message: '小区不存在' } });
    const range = ['1h', '6h', '24h', '7d', 'all'].includes(request.query?.range) ? request.query.range : '1h';
    const start = rangeStart(range);
    const rows = database.prepare(`SELECT * FROM readings WHERE plot_id = ? ${start ? 'AND collected_at >= ?' : ''} ORDER BY collected_at`)
      .all(plot.id, ...(start ? [start] : []));
    const stride = Math.max(1, Math.ceil(rows.length / 1800));
    const sampled = stride === 1 ? rows : rows.filter((_, index) => index % stride === 0 || index === rows.length - 1);
    return { success: true, data: { plotCode: plot.plot_code, sensorMode: plot.sensor_profile || plot.sensor_mode, range, sampled: stride > 1, total: rows.length, points: sampled.map(presentReading) } };
  });

  app.get('/:plotCode/recent', async (request, reply) => {
    const plot = database.prepare('SELECT * FROM plots WHERE plot_code = ?').get(request.params.plotCode);
    if (!plot) return reply.code(404).send({ success: false, error: { code: 'PLOT_NOT_FOUND', message: '小区不存在' } });
    const limit = Math.min(100, Math.max(1, Number(request.query?.limit) || 10));
    const rows = database.prepare('SELECT * FROM readings WHERE plot_id = ? ORDER BY collected_at DESC LIMIT ?').all(plot.id, limit);
    return { success: true, data: { plotCode: plot.plot_code, sensorMode: plot.sensor_profile || plot.sensor_mode, rows: rows.map(presentReading) } };
  });
}
