function listDevices(database) {
  return database.prepare(`
    SELECT d.*, b.id AS binding_id, p.plot_code, p.experiment_code, p.sensor_mode,
      lr.collected_at AS latest_collected_at, r.battery_mv, r.csq
    FROM devices d
    LEFT JOIN plot_bindings b ON b.device_id = d.id AND b.active = 1
    LEFT JOIN plots p ON p.id = b.plot_id
    LEFT JOIN latest_readings lr ON lr.plot_id = p.id
    LEFT JOIN readings r ON r.id = lr.reading_id
    ORDER BY COALESCE(p.display_order, 999), d.id
  `).all().map((row) => ({
    id: row.id, imei: row.imei, alias: row.alias, enabled: Boolean(row.enabled),
    expectedIntervalSeconds: row.expected_interval_seconds, remark: row.remark,
    plotCode: row.plot_code, experimentCode: row.experiment_code, sensorMode: row.sensor_mode,
    lastIngestAt: row.last_ingest_at, lastIngestResult: row.last_ingest_result,
    batteryMv: row.battery_mv, csq: row.csq
  }));
}

function validImei(value) {
  return /^\d{15}$/.test(String(value || '').trim());
}

export function devicesRoutes(app, { database }) {
  app.get('/devices', { preHandler: app.requireAdmin }, async () => ({ success: true, data: listDevices(database) }));

  app.post('/devices', { preHandler: app.requireAdmin }, async (request, reply) => {
    const imei = String(request.body?.imei || '').trim();
    if (!validImei(imei)) return reply.code(400).send({ success: false, error: { code: 'INVALID_IMEI', message: 'IMEI必须为15位数字' } });
    const time = new Date().toISOString();
    try {
      const result = database.prepare(`INSERT INTO devices (imei, alias, enabled, expected_interval_seconds, remark, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?, ?)`)
        .run(imei, String(request.body?.alias || '').trim().slice(0, 80) || null, Number(request.body?.expectedIntervalSeconds) || 300, String(request.body?.remark || '').trim().slice(0, 500) || null, time, time);
      return reply.code(201).send({ success: true, data: { id: Number(result.lastInsertRowid), imei } });
    } catch (error) {
      if (String(error.message).includes('UNIQUE')) return reply.code(409).send({ success: false, error: { code: 'IMEI_EXISTS', message: 'IMEI已登记' } });
      throw error;
    }
  });

  app.patch('/devices/:id', { preHandler: app.requireAdmin }, async (request, reply) => {
    const device = database.prepare('SELECT * FROM devices WHERE id = ?').get(request.params.id);
    if (!device) return reply.code(404).send({ success: false, error: { code: 'DEVICE_NOT_FOUND', message: '设备不存在' } });
    const enabled = request.body?.enabled === undefined ? device.enabled : request.body.enabled ? 1 : 0;
    database.prepare('UPDATE devices SET alias = ?, enabled = ?, expected_interval_seconds = ?, remark = ?, updated_at = ? WHERE id = ?')
      .run(request.body?.alias ?? device.alias, enabled, Number(request.body?.expectedIntervalSeconds ?? device.expected_interval_seconds), request.body?.remark ?? device.remark, new Date().toISOString(), device.id);
    return { success: true, data: { id: device.id } };
  });

  app.get('/devices/:id/last-ingest', { preHandler: app.requireAdmin }, async (request, reply) => {
    const device = database.prepare('SELECT * FROM devices WHERE id = ?').get(request.params.id);
    if (!device) return reply.code(404).send({ success: false, error: { code: 'DEVICE_NOT_FOUND', message: '设备不存在' } });
    const log = database.prepare('SELECT * FROM ingest_logs WHERE imei = ? ORDER BY created_at DESC LIMIT 1').get(device.imei);
    return { success: true, data: log || null };
  });

  app.post('/plots/:plotCode/bind', { preHandler: app.requireAdmin }, async (request, reply) => {
    const plot = database.prepare('SELECT * FROM plots WHERE plot_code = ?').get(request.params.plotCode);
    if (!plot) return reply.code(404).send({ success: false, error: { code: 'PLOT_NOT_FOUND', message: '小区不存在' } });
    const imei = String(request.body?.imei || '').trim();
    if (!validImei(imei)) return reply.code(400).send({ success: false, error: { code: 'INVALID_IMEI', message: 'IMEI必须为15位数字' } });
    const time = new Date().toISOString();
    try {
      const result = database.transaction(() => {
        let device = database.prepare('SELECT * FROM devices WHERE imei = ?').get(imei);
        if (!device) {
          const inserted = database.prepare('INSERT INTO devices (imei, alias, enabled, expected_interval_seconds, created_at, updated_at) VALUES (?, ?, 1, 300, ?, ?)')
            .run(imei, String(request.body?.alias || '').trim().slice(0, 80) || null, time, time);
          device = database.prepare('SELECT * FROM devices WHERE id = ?').get(inserted.lastInsertRowid);
        }
        const occupied = database.prepare('SELECT p.plot_code FROM plot_bindings b JOIN plots p ON p.id = b.plot_id WHERE b.device_id = ? AND b.active = 1').get(device.id);
        if (occupied && occupied.plot_code !== plot.plot_code) throw Object.assign(new Error('DEVICE_ALREADY_BOUND'), { statusCode: 409 });
        database.prepare('UPDATE plot_bindings SET active = 0, unbound_at = ? WHERE plot_id = ? AND active = 1').run(time, plot.id);
        database.prepare('INSERT INTO plot_bindings (plot_id, device_id, bound_at, active, created_at) VALUES (?, ?, ?, 1, ?)').run(plot.id, device.id, time, time);
        return { plotCode: plot.plot_code, deviceId: device.id, imei };
      })();
      return { success: true, data: result };
    } catch (error) {
      if (error.statusCode === 409) return reply.code(409).send({ success: false, error: { code: 'DEVICE_ALREADY_BOUND', message: '该IMEI已绑定其他小区' } });
      throw error;
    }
  });

  app.post('/plots/:plotCode/unbind', { preHandler: app.requireAdmin }, async (request, reply) => {
    const plot = database.prepare('SELECT * FROM plots WHERE plot_code = ?').get(request.params.plotCode);
    if (!plot) return reply.code(404).send({ success: false, error: { code: 'PLOT_NOT_FOUND', message: '小区不存在' } });
    const time = new Date().toISOString();
    database.prepare('UPDATE plot_bindings SET active = 0, unbound_at = ? WHERE plot_id = ? AND active = 1').run(time, plot.id);
    return { success: true, data: { plotCode: plot.plot_code, unboundAt: time } };
  });
}
