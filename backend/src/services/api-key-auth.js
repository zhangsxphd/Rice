import crypto from 'node:crypto';

export function hashKey(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function createApiKey(database, name = 'D100L设备上报') {
  const rawKey = `rice_${crypto.randomBytes(24).toString('hex')}`;
  const time = new Date().toISOString();
  const result = database.prepare(`
    INSERT INTO api_keys (name, key_hash, key_preview, status, created_at)
    VALUES (?, ?, ?, 'active', ?)
  `).run(String(name).trim().slice(0, 80) || 'D100L设备上报', hashKey(rawKey), `${rawKey.slice(0, 9)}…${rawKey.slice(-4)}`, time);
  return { id: Number(result.lastInsertRowid), apiKey: rawKey, preview: `${rawKey.slice(0, 9)}…${rawKey.slice(-4)}`, createdAt: time };
}

export function authenticateApiKey(database, request) {
  const raw = request.headers['x-api-key'] || request.query?.api_key || request.body?.apiKey || null;
  if (!raw) return { ok: false };
  const key = database.prepare("SELECT id, status FROM api_keys WHERE key_hash = ?").get(hashKey(raw));
  if (!key || key.status !== 'active') return { ok: false };
  database.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?').run(new Date().toISOString(), key.id);
  return { ok: true, id: key.id };
}

const SECRET_KEYS = new Set(['apikey', 'api_key', 'x-api-key', 'token', 'secret', 'password']);

export function redactSecrets(value, depth = 0) {
  if (depth > 8 || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item, depth + 1));
  if (typeof value !== 'object') return value;
  const clean = {};
  for (const [key, item] of Object.entries(value)) {
    clean[key] = SECRET_KEYS.has(key.toLowerCase()) ? '[redacted]' : redactSecrets(item, depth + 1);
  }
  return clean;
}
