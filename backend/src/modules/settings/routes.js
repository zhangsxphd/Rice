import fs from 'node:fs';
import path from 'node:path';
import { createApiKey } from '../../services/api-key-auth.js';
import { createBackup } from '../../services/backup.js';
import { readSettings, writeSettings } from '../../services/settings.js';

function listKeys(database) {
  return database.prepare(`SELECT id, name, key_preview AS preview, status, created_at AS createdAt,
    last_used_at AS lastUsedAt, revoked_at AS revokedAt FROM api_keys ORDER BY created_at DESC`).all();
}

export function settingsRoutes(app, { database, backupDir, databasePath }) {
  app.get('/', { preHandler: app.requireAdmin }, async () => ({ success: true, data: { ...readSettings(database), apiKeys: listKeys(database) } }));

  app.patch('/', { preHandler: app.requireAdmin }, async (request) => ({ success: true, data: writeSettings(database, request.body || {}) }));

  app.post('/api-keys', { preHandler: app.requireAdmin }, async (request, reply) => {
    const created = createApiKey(database, request.body?.name);
    return reply.code(201).send({ success: true, data: created });
  });

  app.post('/api-keys/:id/revoke', { preHandler: app.requireAdmin }, async (request, reply) => {
    const result = database.prepare("UPDATE api_keys SET status = 'revoked', revoked_at = ? WHERE id = ? AND status = 'active'")
      .run(new Date().toISOString(), request.params.id);
    if (!result.changes) return reply.code(404).send({ success: false, error: { code: 'API_KEY_NOT_FOUND', message: 'API Key不存在或已停用' } });
    return { success: true, data: { id: Number(request.params.id), status: 'revoked' } };
  });

  app.post('/backup', { preHandler: app.requireAdmin }, async () => ({ success: true, data: await createBackup(database, backupDir) }));

  app.post('/clear-test-data', { preHandler: app.requireAdmin }, async (request, reply) => {
    const settings = readSettings(database);
    const before = request.body?.before || settings.experiment?.formalDataStartAt;
    if (!before || Number.isNaN(new Date(before).getTime())) {
      return reply.code(400).send({ success: false, error: { code: 'FORMAL_START_REQUIRED', message: '请先设置正式试验开始时间' } });
    }
    await createBackup(database, backupDir);
    const result = database.transaction(() => {
      database.prepare('DELETE FROM latest_readings').run();
      const deleted = database.prepare('DELETE FROM readings WHERE collected_at < ?').run(new Date(before).toISOString());
      database.prepare(`
        INSERT INTO latest_readings (plot_id, reading_id, collected_at, updated_at)
        SELECT r.plot_id, r.id, r.collected_at, ? FROM readings r
        JOIN (SELECT plot_id, MAX(collected_at) AS collected_at FROM readings GROUP BY plot_id) latest
          ON latest.plot_id = r.plot_id AND latest.collected_at = r.collected_at
      `).run(new Date().toISOString());
      return deleted.changes;
    })();
    return { success: true, data: { deletedRows: result, before: new Date(before).toISOString() } };
  });

  app.get('/database-status', { preHandler: app.requireAdmin }, async () => ({
    success: true,
    data: {
      readings: database.prepare('SELECT COUNT(*) AS count FROM readings').get().count,
      sizeBytes: fs.existsSync(databasePath) ? fs.statSync(databasePath).size : 0,
      backups: database.prepare('SELECT id, filename, size_bytes AS sizeBytes, created_at AS createdAt FROM backup_records ORDER BY created_at DESC LIMIT 10').all(),
      backupDir: path.resolve(backupDir)
    }
  }));
}
