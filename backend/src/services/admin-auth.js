import crypto from 'node:crypto';

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function registerAdminAuth(app, options) {
  app.decorate('requireAdmin', async (request, reply) => {
    if (options.mode !== 'basic') return;
    if (!options.passwordHash) {
      return reply.code(503).send({ success: false, error: { code: 'ADMIN_AUTH_NOT_CONFIGURED', message: '管理员认证尚未配置' } });
    }
    const header = String(request.headers.authorization || '');
    if (!header.startsWith('Basic ')) {
      reply.header('WWW-Authenticate', 'Basic realm="Rice Trial"');
      return reply.code(401).send({ success: false, error: { code: 'ADMIN_AUTH_REQUIRED', message: '需要管理员认证' } });
    }
    let decoded = '';
    try { decoded = Buffer.from(header.slice(6), 'base64').toString('utf8'); } catch { decoded = ''; }
    const separator = decoded.indexOf(':');
    const username = separator >= 0 ? decoded.slice(0, separator) : '';
    const password = separator >= 0 ? decoded.slice(separator + 1) : '';
    if (!safeEqual(username, options.username) || !safeEqual(sha256(password), options.passwordHash)) {
      reply.header('WWW-Authenticate', 'Basic realm="Rice Trial"');
      return reply.code(401).send({ success: false, error: { code: 'ADMIN_AUTH_FAILED', message: '管理员认证失败' } });
    }
  });
}
