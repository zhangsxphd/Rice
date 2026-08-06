export function persistReading(database, { plot, device, reading }) {
  const existing = database.prepare('SELECT id FROM readings WHERE device_id = ? AND collected_at = ?').get(device.id, reading.collectedAt);
  if (existing) {
    database.prepare('UPDATE devices SET last_ingest_at = ?, last_ingest_result = ?, updated_at = ? WHERE id = ?')
      .run(reading.receivedAt, 'duplicated', reading.receivedAt, device.id);
    return { inserted: false, duplicated: true, readingId: existing.id };
  }

  return database.transaction(() => {
    const result = database.prepare(`
      INSERT INTO readings (
        plot_id, device_id, imei, collected_at, received_at, time_source, time_discrepancy_seconds,
        schema_version, task_version, report_sequence, sensor_mode, water_level_mm, soil_tension_kpa,
        soil_moisture_percent, soil_temperature_c, soil_ec_us_cm, soil_ph, battery_mv, csq,
        water_status, tension_status, soil_status, cycle_status, payload_status, payload_issues, raw_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      plot.id, device.id, device.imei, reading.collectedAt, reading.receivedAt, reading.timeSource,
      reading.timeDiscrepancySeconds, reading.schemaVersion, reading.taskVersion, reading.reportSequence,
      plot.sensor_mode, reading.waterLevelMm, reading.soilTensionKpa, reading.soilMoisturePercent,
      reading.soilTemperatureC, reading.soilEcUsCm, reading.soilPh, reading.batteryMv, reading.csq,
      reading.waterStatus, reading.tensionStatus, reading.soilStatus, reading.cycleStatus,
      reading.payloadStatus, JSON.stringify(reading.payloadIssues), JSON.stringify(reading.rawJson), reading.receivedAt
    );
    const readingId = Number(result.lastInsertRowid);
    database.prepare(`
      INSERT INTO latest_readings (plot_id, reading_id, collected_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(plot_id) DO UPDATE SET
        reading_id = excluded.reading_id,
        collected_at = excluded.collected_at,
        updated_at = excluded.updated_at
      WHERE excluded.collected_at >= latest_readings.collected_at
    `).run(plot.id, readingId, reading.collectedAt, reading.receivedAt);
    database.prepare('UPDATE devices SET last_ingest_at = ?, last_ingest_result = ?, updated_at = ? WHERE id = ?')
      .run(reading.receivedAt, reading.payloadStatus, reading.receivedAt, device.id);
    return { inserted: true, duplicated: false, readingId };
  })();
}
