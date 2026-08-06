import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const projectRoot = path.resolve(backendRoot, '..');

function intEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  host: process.env.HOST || '127.0.0.1',
  port: intEnv('PORT', 3201),
  timezone: 'Asia/Shanghai',
  databasePath: process.env.DATABASE_PATH || path.join(projectRoot, 'data', 'rice.sqlite'),
  frontendDistPath: process.env.FRONTEND_DIST_PATH || path.join(projectRoot, 'frontend', 'dist', 'client'),
  logDir: process.env.LOG_DIR || path.join(projectRoot, 'logs'),
  backupDir: process.env.BACKUP_DIR || path.join(projectRoot, 'backups'),
  corsOrigin: process.env.CORS_ORIGIN || 'http://127.0.0.1:5173',
  demoMode: String(process.env.RICE_DEMO_MODE || 'false').toLowerCase() === 'true',
  adminAuthMode: process.env.ADMIN_AUTH_MODE || 'none',
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || '',
  maxIngestBodyBytes: intEnv('MAX_INGEST_BODY_BYTES', 16384),
  defaultReportIntervalSeconds: intEnv('DEFAULT_REPORT_INTERVAL_SECONDS', 300),
  defaultOfflineTimeoutSeconds: intEnv('DEFAULT_OFFLINE_TIMEOUT_SECONDS', 900)
};
