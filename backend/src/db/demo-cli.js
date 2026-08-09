import { config } from '../config/index.js';
import { openDatabase, seedDefaultSettings } from './database.js';
import { PLOT_SEED } from './seed-plots.js';
import { createApiKey } from '../services/api-key-auth.js';
import { normalizePayload } from '../services/payload-normalizer.js';
import { persistReading } from '../services/reading-writer.js';
import { DEFAULT_SETTINGS, writeSettings } from '../services/settings.js';

if (!config.demoMode) {
  console.error('拒绝写入演示数据：请显式设置 RICE_DEMO_MODE=true');
  process.exit(1);
}

const database = openDatabase(config.databasePath);
seedDefaultSettings(database, DEFAULT_SETTINGS);
const key = database.prepare("SELECT id FROM api_keys WHERE status = 'active' LIMIT 1").get() ? null : createApiKey(database, '本地演示Key');
const now = Date.now();

database.transaction(() => {
  database.prepare('DELETE FROM latest_readings').run();
  database.prepare('DELETE FROM readings').run();
  database.prepare('DELETE FROM plot_bindings').run();
  database.prepare('DELETE FROM devices').run();
})();

for (const plotSeed of PLOT_SEED) {
  const plot = database.prepare('SELECT * FROM plots WHERE plot_code = ?').get(plotSeed.plotCode);
  const imei = String(862323089930700 + plot.display_order).padStart(15, '0');
  const createdAt = new Date(now - 86_400_000).toISOString();
  const deviceResult = database.prepare(`INSERT INTO devices (imei, alias, enabled, expected_interval_seconds, created_at, updated_at)
    VALUES (?, ?, 1, 300, ?, ?)`).run(imei, `${plot.plot_code} 采集终端`, createdAt, createdAt);
  const device = database.prepare('SELECT * FROM devices WHERE id = ?').get(deviceResult.lastInsertRowid);
  database.prepare('INSERT INTO plot_bindings (plot_id, device_id, bound_at, active, created_at) VALUES (?, ?, ?, 1, ?)')
    .run(plot.id, device.id, createdAt, createdAt);

  for (let point = 48; point >= 0; point -= 1) {
    const timestamp = Math.floor((now - point * 300_000) / 1000);
    const wave = Math.sin((point + plot.display_order) / 4);
    const sensorProfile = plot.sensor_profile || plot.sensor_mode;
    const payload = {
      schema_version: 1,
      imei,
      timestamp,
      report_sequence: 49 - point,
      task_version: sensorProfile === 'soil_only' ? 'rice_soil_only_demo' : sensorProfile === 'water_soil' ? 'rice_w0_water_soil_demo' : 'rice_tension_soil_demo',
      sensor_mode: sensorProfile,
      soil_moisture_percent: Number((34 + (plot.display_order % 8) + wave * 2).toFixed(1)),
      soil_temperature_c: Number((25.1 + wave * 0.5).toFixed(1)),
      soil_ec_us_cm: Math.round(780 + plot.display_order * 12 + wave * 35),
      soil_ph: Number((6.3 + (plot.display_order % 5) * 0.05 + wave * 0.03).toFixed(2)),
      battery_mv: 3920 + (plot.display_order % 6) * 18,
      csq: 17 + (plot.display_order % 8),
      soil_rs485_status: plot.plot_code === 'P03' && point === 0 ? 'crc_error' : 'ok',
      cycle_status: plot.plot_code === 'P03' && point === 0 ? 'partial' : 'ok'
    };
    if (sensorProfile === 'water_soil') {
      payload.water_level_mm = Number((28 + (plot.display_order % 4) * 3 + wave * 5).toFixed(1));
      payload.water_4_20ma_status = 'ok';
    } else if (sensorProfile === 'tension_soil' && !(plot.plot_code === 'P11' && point === 0)) {
      payload.soil_tension_kpa = Number((-16 - (plot.water_treatment === 'W2' ? 18 : 7) - (plot.display_order % 5) - wave * 2).toFixed(1));
      payload.soil_tension_rs485_status = 'ok';
    }
    const reading = normalizePayload(payload, plot, new Date(timestamp * 1000 + 1200));
    persistReading(database, { plot, device, reading });
  }
}

database.prepare("UPDATE devices SET last_ingest_at = ? WHERE imei = ?")
  .run(new Date(now - 3_600_000).toISOString(), String(862323089930724));
writeSettings(database, { experiment: { ...DEFAULT_SETTINGS.experiment, formalDataStartAt: new Date(now - 86_400_000).toISOString() } });
console.log(JSON.stringify({ status: 'ok', plots: 24, readings: database.prepare('SELECT COUNT(*) AS count FROM readings').get().count, createdApiKey: key?.apiKey || null }, null, 2));
database.close();
