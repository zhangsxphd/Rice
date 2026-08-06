export function healthRoutes(app, { database }) {
  app.get('/health', async () => ({ status: 'ok', service: 'rice-backend' }));
  app.get('/ready', async (request, reply) => {
    try {
      database.prepare('SELECT 1 AS ok').get();
      const plots = database.prepare('SELECT COUNT(*) AS count FROM plots').get().count;
      const ready = plots === 24;
      return ready
        ? { status: 'ready', database: 'ok', plots }
        : reply.code(503).send({ status: 'degraded', database: 'ok', plots });
    } catch {
      return reply.code(503).send({ status: 'not_ready', database: 'error' });
    }
  });
}
