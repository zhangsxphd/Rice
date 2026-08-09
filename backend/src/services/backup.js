import fs from 'node:fs';
import path from 'node:path';
import { rowsToCsv } from './csv-export.js';

function stamp() {
  return new Date().toISOString().replaceAll(':', '').replaceAll('-', '').replace(/\.\d{3}Z$/, 'Z');
}

export async function createBackup(database, backupDir) {
  fs.mkdirSync(backupDir, { recursive: true });
  const id = stamp();
  const databasePath = path.join(backupDir, `rice-${id}.sqlite`);
  const csvPath = path.join(backupDir, `rice-${id}.csv`);
  await database.backup(databasePath);
  const rows = database.prepare(`
    SELECT p.plot_code, p.experiment_code, p.block_code, p.water_treatment, p.variety_code,
      COALESCE(p.sensor_profile, p.sensor_mode) AS sensor_mode, r.imei, r.collected_at, r.received_at, r.water_level_mm, r.soil_tension_kpa,
      r.soil_moisture_percent, r.soil_temperature_c, r.soil_ec_us_cm, r.soil_ph, r.battery_mv,
      r.csq, r.water_status, r.tension_status, r.soil_status, r.cycle_status, r.payload_status, r.raw_json
    FROM readings r JOIN plots p ON p.id = r.plot_id ORDER BY r.collected_at
  `).all();
  fs.writeFileSync(csvPath, rowsToCsv(rows), 'utf8');
  const sizeBytes = fs.statSync(databasePath).size;
  const createdAt = new Date().toISOString();
  const result = database.prepare('INSERT INTO backup_records (filename, file_path, size_bytes, created_at) VALUES (?, ?, ?, ?)')
    .run(path.basename(databasePath), databasePath, sizeBytes, createdAt);
  return { id: Number(result.lastInsertRowid), filename: path.basename(databasePath), databasePath, csvPath, sizeBytes, createdAt };
}
