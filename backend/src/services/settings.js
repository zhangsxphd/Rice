export const DEFAULT_SETTINGS = {
  experiment: {
    name: '水稻生育后期水分处理试验',
    startDate: null,
    expectedEndDate: null,
    formalDataStartAt: null,
    timezone: 'Asia/Shanghai'
  },
  dashboard: { refreshSeconds: 10, defaultHistoryRange: '1h' },
  ingest: { reportIntervalSeconds: 300, offlineTimeoutSeconds: 900 },
  thresholds: {
    waterLevelW0: { min: null, max: null },
    tensionW1: { min: null, max: null },
    tensionW2: { min: null, max: null },
    soilMoisture: { min: null, max: null },
    soilTemperature: { min: null, max: null },
    soilEc: { min: null, max: null },
    soilPh: { min: null, max: null },
    batteryMv: { min: null, max: null },
    csq: { min: null, max: null }
  }
};

export function readSettings(database) {
  const values = { ...DEFAULT_SETTINGS };
  for (const row of database.prepare('SELECT key, value FROM settings').all()) {
    try {
      values[row.key] = JSON.parse(row.value);
    } catch {
      values[row.key] = row.value;
    }
  }
  return values;
}

export function writeSettings(database, patch) {
  const allowed = new Set(Object.keys(DEFAULT_SETTINGS));
  const save = database.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);
  const time = new Date().toISOString();
  database.transaction(() => {
    for (const [key, value] of Object.entries(patch || {})) {
      if (!allowed.has(key)) continue;
      save.run(key, JSON.stringify(value), time);
    }
  })();
  return readSettings(database);
}
