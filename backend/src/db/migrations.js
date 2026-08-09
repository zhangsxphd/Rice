const MIGRATIONS = [
  {
    id: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS plots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plot_code TEXT NOT NULL UNIQUE,
        experiment_code TEXT NOT NULL UNIQUE,
        block_code TEXT NOT NULL,
        water_treatment TEXT NOT NULL,
        variety_code TEXT NOT NULL,
        sensor_mode TEXT NOT NULL CHECK(sensor_mode IN ('water_soil', 'tension_soil')),
        display_order INTEGER NOT NULL UNIQUE,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        imei TEXT NOT NULL UNIQUE,
        alias TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        expected_interval_seconds INTEGER NOT NULL DEFAULT 300,
        remark TEXT,
        last_ingest_at TEXT,
        last_ingest_result TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS plot_bindings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plot_id INTEGER NOT NULL REFERENCES plots(id),
        device_id INTEGER NOT NULL REFERENCES devices(id),
        bound_at TEXT NOT NULL,
        unbound_at TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS ux_plot_active_binding ON plot_bindings(plot_id) WHERE active = 1;
      CREATE UNIQUE INDEX IF NOT EXISTS ux_device_active_binding ON plot_bindings(device_id) WHERE active = 1;

      CREATE TABLE IF NOT EXISTS readings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plot_id INTEGER NOT NULL REFERENCES plots(id),
        device_id INTEGER NOT NULL REFERENCES devices(id),
        imei TEXT NOT NULL,
        collected_at TEXT NOT NULL,
        received_at TEXT NOT NULL,
        time_source TEXT NOT NULL,
        time_discrepancy_seconds INTEGER,
        schema_version INTEGER,
        task_version TEXT,
        report_sequence INTEGER,
        sensor_mode TEXT NOT NULL,
        water_level_mm REAL,
        soil_tension_kpa REAL,
        soil_moisture_percent REAL,
        soil_temperature_c REAL,
        soil_ec_us_cm REAL,
        soil_ph REAL,
        battery_mv INTEGER,
        csq INTEGER,
        water_status TEXT,
        tension_status TEXT,
        soil_status TEXT,
        cycle_status TEXT,
        payload_status TEXT NOT NULL,
        payload_issues TEXT,
        raw_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(device_id, collected_at)
      );
      CREATE INDEX IF NOT EXISTS idx_readings_plot_time ON readings(plot_id, collected_at DESC);
      CREATE INDEX IF NOT EXISTS idx_readings_received ON readings(received_at DESC);

      CREATE TABLE IF NOT EXISTS latest_readings (
        plot_id INTEGER PRIMARY KEY REFERENCES plots(id),
        reading_id INTEGER NOT NULL REFERENCES readings(id),
        collected_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS api_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        key_hash TEXT NOT NULL UNIQUE,
        key_preview TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        last_used_at TEXT,
        revoked_at TEXT
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ingest_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        imei TEXT,
        plot_code TEXT,
        status TEXT NOT NULL,
        error_message TEXT,
        remote_ip TEXT,
        user_agent TEXT,
        payload_summary TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS backup_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        file_path TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
    `
  },
  {
    id: 2,
    sql: `
      ALTER TABLE plots ADD COLUMN sensor_profile TEXT NOT NULL DEFAULT 'water_soil';

      UPDATE plots
      SET sensor_profile = CASE sensor_mode
        WHEN 'water_soil' THEN 'water_soil'
        ELSE 'tension_soil'
      END;

      UPDATE plots
      SET sensor_profile = 'soil_only'
      WHERE plot_code IN (
        'P01', 'P02', 'P03', 'P04', 'P05', 'P06', 'P07', 'P08',
        'P13', 'P14', 'P19', 'P20', 'P21', 'P22', 'P24'
      );
    `
  }
];

export function runMigrations(database) {
  database.exec('CREATE TABLE IF NOT EXISTS migrations (id INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  const applied = new Set(database.prepare('SELECT id FROM migrations').all().map((row) => row.id));
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    database.transaction(() => {
      database.exec(migration.sql);
      database.prepare('INSERT INTO migrations (id, applied_at) VALUES (?, ?)').run(migration.id, new Date().toISOString());
    })();
  }
}
