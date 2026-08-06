import { authenticateApiKey, redactSecrets } from '../../services/api-key-auth.js';
import { normalizePayload } from '../../services/payload-normalizer.js';
import { persistReading } from '../../services/reading-writer.js';

function ingestLog(database, request, values) {
  try {
    database.prepare(`
      INSERT INTO ingest_logs (imei, plot_code, status, error_message, remote_ip, user_agent, payload_summary, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      values.imei || null, values.plotCode || null, values.status, values.error || null,
      request.ip || null, String(request.headers['user-agent'] || '').slice(0, 200),
      values.payload ? JSON.stringify(redactSecrets(values.payload)).slice(0, 4000) : null,
      new Date().toISOString()
    );
  } catch {
    // 审计日志失败不影响设备上报主流程。
  }
}

export function ingestRoutes(app, { database, maxBodyBytes }) {
  app.post('/d100l2', {
    bodyLimit: maxBodyBytes,
    config: { rateLimit: { max: 240, timeWindow: '1 minute' } },
    schema: {
      body: { type: 'object', additionalProperties: true },
      response: { 200: { type: 'object', additionalProperties: true } }
    }
  }, async (request, reply) => {
    const payload = request.body || {};
    const auth = authenticateApiKey(database, request);
    if (!auth.ok) {
      ingestLog(database, request, { imei: payload.imei, status: 'invalid_api_key' });
      return reply.code(401).send({ success: false, error: { code: 'INVALID_API_KEY', message: 'API Key 无效或已停用' } });
    }

    const imei = String(payload.imei || '').trim();
    if (!imei) {
      ingestLog(database, request, { status: 'validation_failed', error: '缺少IMEI', payload });
      return reply.code(400).send({ success: false, error: { code: 'INVALID_IMEI', message: 'imei不能为空' } });
    }
    const device = database.prepare('SELECT * FROM devices WHERE imei = ?').get(imei);
    if (!device) {
      ingestLog(database, request, { imei, status: 'unknown_imei', payload });
      return reply.code(404).send({ success: false, error: { code: 'DEVICE_NOT_REGISTERED', message: 'IMEI未登记' } });
    }
    if (!device.enabled) {
      ingestLog(database, request, { imei, status: 'device_disabled' });
      return reply.code(403).send({ success: false, error: { code: 'DEVICE_DISABLED', message: '设备已停用' } });
    }
    const binding = database.prepare(`
      SELECT b.id AS binding_id, p.* FROM plot_bindings b JOIN plots p ON p.id = b.plot_id
      WHERE b.device_id = ? AND b.active = 1 AND p.enabled = 1
    `).get(device.id);
    if (!binding) {
      ingestLog(database, request, { imei, status: 'device_unbound' });
      return reply.code(404).send({ success: false, error: { code: 'DEVICE_NOT_BOUND', message: 'IMEI未绑定活动小区' } });
    }

    const reading = normalizePayload(payload, binding, new Date());
    const result = persistReading(database, { plot: binding, device, reading });
    ingestLog(database, request, {
      imei,
      plotCode: binding.plot_code,
      status: result.duplicated ? 'duplicated' : reading.payloadStatus,
      payload: { schemaVersion: reading.schemaVersion, taskVersion: reading.taskVersion, issues: reading.payloadIssues }
    });
    return {
      success: true,
      data: {
        deviceId: device.id,
        plotCode: binding.plot_code,
        experimentCode: binding.experiment_code,
        inserted: result.inserted,
        duplicated: result.duplicated,
        payloadStatus: reading.payloadStatus,
        receivedAt: reading.receivedAt
      }
    };
  });
}
