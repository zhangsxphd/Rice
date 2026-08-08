import fs from 'node:fs';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { config as defaultConfig } from './config/index.js';
import { openDatabase, seedDefaultSettings } from './db/database.js';
import { registerAdminAuth } from './services/admin-auth.js';
import { DEFAULT_SETTINGS } from './services/settings.js';
import { healthRoutes } from './modules/health/routes.js';
import { ingestRoutes } from './modules/ingest/routes.js';
import { dashboardRoutes } from './modules/dashboard/routes.js';
import { plotsRoutes } from './modules/plots/routes.js';
import { devicesRoutes } from './modules/devices/routes.js';
import { settingsRoutes } from './modules/settings/routes.js';
import { exportsRoutes } from './modules/exports/routes.js';

export async function buildApp(overrides = {}) {
  const runtime = { ...defaultConfig, ...overrides };
  const database = overrides.database || openDatabase(runtime.databasePath);
  seedDefaultSettings(database, {
    ...DEFAULT_SETTINGS,
    ingest: { reportIntervalSeconds: runtime.defaultReportIntervalSeconds, offlineTimeoutSeconds: runtime.defaultOfflineTimeoutSeconds }
  });
  const app = Fastify({
    logger: runtime.nodeEnv !== 'test',
    trustProxy: true,
    bodyLimit: runtime.maxIngestBodyBytes
  });
  app.decorate('database', database);
  // D100L 的 HTTP 通道会发送 JSON 正文，但不会附带 Content-Type。
  // Fastify 默认会在路由前以 415 拒绝该请求；仅为未声明类型的请求补充 JSON 解析。
  app.addContentTypeParser('*', { parseAs: 'string' }, (request, body, done) => {
    if (request.headers['content-type']) {
      const error = new Error('Unsupported Media Type');
      error.statusCode = 415;
      done(error);
      return;
    }
    try {
      done(null, JSON.parse(body));
    } catch {
      const error = new Error('请求正文不是合法JSON');
      error.statusCode = 400;
      done(error);
    }
  });
  await app.register(cors, { origin: runtime.corsOrigin === '*' ? true : runtime.corsOrigin, credentials: true });
  await app.register(rateLimit, { global: false });
  registerAdminAuth(app, { mode: runtime.adminAuthMode, username: runtime.adminUsername, passwordHash: runtime.adminPasswordHash });
  await app.register(healthRoutes, { database });
  await app.register(ingestRoutes, { prefix: '/api/device-ingest', database, maxBodyBytes: runtime.maxIngestBodyBytes });
  await app.register(dashboardRoutes, { prefix: '/api/dashboard', database });
  await app.register(plotsRoutes, { prefix: '/api/plots', database });
  await app.register(devicesRoutes, { prefix: '/api', database });
  await app.register(settingsRoutes, { prefix: '/api/settings', database, backupDir: runtime.backupDir, databasePath: runtime.databasePath });
  await app.register(exportsRoutes, { prefix: '/api', database });

  app.setErrorHandler((error, request, reply) => {
    if (runtime.nodeEnv !== 'test') request.log.error(error);
    const statusCode = error.statusCode && error.statusCode < 500 ? error.statusCode : 500;
    reply.code(statusCode).send({ success: false, error: { code: statusCode === 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR', message: statusCode === 500 ? '服务器内部错误' : error.message } });
  });

  if (runtime.serveFrontend && fs.existsSync(runtime.frontendDistPath)) {
    await app.register(fastifyStatic, { root: runtime.frontendDistPath, wildcard: false });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: '接口不存在' } });
      return reply.sendFile('index.html');
    });
  }

  app.addHook('onClose', async () => {
    if (!overrides.database) database.close();
  });
  return app;
}
