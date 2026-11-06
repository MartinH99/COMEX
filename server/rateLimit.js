import db from './db.js';

// En Vercel la IP real llega en x-forwarded-for, que la plataforma reescribe y no se puede falsificar.
// Fuera de Vercel ese encabezado lo controla quien hace el pedido, así que se usa la conexión.
export function clientIp(req) {
  if (process.env.VERCEL) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded) return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'desconocida';
}

// Los contadores viven en la base porque en Vercel cada pedido puede caer en una instancia distinta
export async function isLimited(key, max) {
  const { rows } = await db.execute({
    sql: 'SELECT count FROM rate_limits WHERE key = ? AND reset_at > ?',
    args: [key, new Date().toISOString()]
  });
  return rows.length > 0 && Number(rows[0].count) >= max;
}

export async function recordHit(key, windowMinutes) {
  const now = new Date().toISOString();
  const resetAt = new Date(Date.now() + windowMinutes * 60 * 1000).toISOString();
  await db.batch([
    { sql: 'DELETE FROM rate_limits WHERE reset_at <= ?', args: [now] },
    {
      sql: `
        INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)
        ON CONFLICT(key) DO UPDATE SET count = count + 1
      `,
      args: [key, resetAt]
    }
  ], 'write');
}

export const clearHits = (key) => db.execute({ sql: 'DELETE FROM rate_limits WHERE key = ?', args: [key] });
