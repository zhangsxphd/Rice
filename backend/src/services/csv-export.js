const FORMULA_PREFIX = /^[=+\-@]/;

function safeCell(value) {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (FORMULA_PREFIX.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export const EXPORT_COLUMNS = [
  'plot_code', 'experiment_code', 'block_code', 'water_treatment', 'variety_code', 'sensor_mode', 'imei',
  'collected_at', 'received_at', 'water_level_mm', 'soil_tension_kpa', 'soil_moisture_percent',
  'soil_temperature_c', 'soil_ec_us_cm', 'soil_ph', 'battery_mv', 'csq', 'water_status', 'tension_status',
  'soil_status', 'cycle_status', 'payload_status', 'raw_json'
];

export function rowsToCsv(rows) {
  return `\uFEFF${EXPORT_COLUMNS.join(',')}\r\n${rows.map((row) => EXPORT_COLUMNS.map((column) => safeCell(row[column])).join(',')).join('\r\n')}\r\n`;
}
