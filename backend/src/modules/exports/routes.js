import fs from 'node:fs';
import path from 'node:path';
import { EXPORT_COLUMNS, rowsToCsv } from '../../services/csv-export.js';
import { buildAnalysisWorkbook, treatmentStatisticsRows } from '../../services/analysis-export.js';

function exportQuery(query = {}, plotCode = null) {
  const where = [];
  const params = [];
  const add = (condition, value) => { where.push(condition); params.push(value); };
  if (plotCode) add('p.plot_code = ?', plotCode);
  if (query.from) add('r.collected_at >= ?', new Date(/^\d{4}-\d{2}-\d{2}$/.test(query.from) ? `${query.from}T00:00:00+08:00` : query.from).toISOString());
  if (query.to) add('r.collected_at <= ?', new Date(/^\d{4}-\d{2}-\d{2}$/.test(query.to) ? `${query.to}T23:59:59.999+08:00` : query.to).toISOString());
  if (query.blockCode) add('p.block_code = ?', query.blockCode);
  if (query.waterTreatment) add('p.water_treatment = ?', query.waterTreatment);
  if (query.varietyCode) add('p.variety_code = ?', query.varietyCode);
  if (query.plotCode) add('p.plot_code = ?', query.plotCode);
  return { where: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

function selectRows(database, query, plotCode) {
  const filter = exportQuery(query, plotCode);
  return database.prepare(`
    SELECT p.plot_code, p.experiment_code, p.block_code, p.water_treatment, p.variety_code,
      COALESCE(p.sensor_profile, p.sensor_mode) AS sensor_mode, r.imei, r.collected_at, r.received_at, r.water_level_mm, r.soil_tension_kpa,
      r.soil_moisture_percent, r.soil_temperature_c, r.soil_ec_us_cm, r.soil_ph, r.battery_mv,
      r.csq, r.water_status, r.tension_status, r.soil_status, r.cycle_status, r.payload_status, r.raw_json
    FROM readings r JOIN plots p ON p.id = r.plot_id ${filter.where} ORDER BY r.collected_at
  `).all(...filter.params);
}

function sendCsv(reply, rows, filename) {
  reply.header('Content-Type', 'text/csv; charset=utf-8');
  reply.header('Content-Disposition', `attachment; filename="${filename}"`);
  reply.header('X-Export-Row-Count', String(rows.length));
  return reply.send(rowsToCsv(rows));
}

const STATISTICS_COLUMNS = [
  'collected_at', 'metric', 'water_treatment', 'variety_code', 'n', 'mean',
  'standard_deviation', 'minimum', 'maximum', 'unit'
];

async function sendAnalysisWorkbook(reply, database) {
  const workbook = await buildAnalysisWorkbook(database);
  reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  reply.header('Content-Disposition', 'attachment; filename="rice-analysis.xlsx"');
  reply.header('Content-Length', String(workbook.length));
  return reply.send(workbook);
}

export function exportsRoutes(app, { database }) {
  app.get('/export/analysis.xlsx', { preHandler: app.requireAdmin }, async (_request, reply) => sendAnalysisWorkbook(reply, database));
  app.get('/export/raw.csv', { preHandler: app.requireAdmin }, async (request, reply) => sendCsv(reply, selectRows(database, request.query), 'rice-raw.csv'));
  app.get('/export/treatment-statistics.csv', { preHandler: app.requireAdmin }, async (_request, reply) => {
    const rows = treatmentStatisticsRows(database);
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', 'attachment; filename="rice-treatment-statistics.csv"');
    reply.header('X-Export-Row-Count', String(rows.length));
    return reply.send(rowsToCsv(rows, STATISTICS_COLUMNS));
  });
  app.get('/export/plots/:plotCode.csv', { preHandler: app.requireAdmin }, async (request, reply) => sendCsv(reply, selectRows(database, request.query, request.params.plotCode), `${request.params.plotCode}-readings.csv`));

  app.get('/exports/readings.csv', { preHandler: app.requireAdmin }, async (request, reply) => sendCsv(reply, selectRows(database, request.query), 'rice-readings.csv'));
  app.get('/exports/plots/:plotCode.csv', { preHandler: app.requireAdmin }, async (request, reply) => sendCsv(reply, selectRows(database, request.query, request.params.plotCode), `${request.params.plotCode}-readings.csv`));
  app.get('/exports/database-backup', { preHandler: app.requireAdmin }, async (request, reply) => {
    const id = Number(request.query?.id);
    const row = database.prepare('SELECT * FROM backup_records WHERE id = ?').get(id);
    if (!row || !fs.existsSync(row.file_path)) return reply.code(404).send({ success: false, error: { code: 'BACKUP_NOT_FOUND', message: '备份不存在' } });
    reply.header('Content-Disposition', `attachment; filename="${path.basename(row.filename)}"`);
    return reply.type('application/vnd.sqlite3').send(fs.createReadStream(row.file_path));
  });
  app.get('/exports/columns', { preHandler: app.requireAdmin }, async () => ({ success: true, data: EXPORT_COLUMNS }));
}
