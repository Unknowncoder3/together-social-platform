import pg from 'pg';

const { Pool } = pg;

let pool = null;

export function getPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DB_POOL_MAX || 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined
    });
  }
  return pool;
}

export async function checkPostgres() {
  const db = getPool();
  if (!db) return { configured: false, ok: false };
  try {
    const result = await db.query('SELECT NOW() AS now');
    return { configured: true, ok: true, now: result.rows[0].now };
  } catch (error) {
    return { configured: true, ok: false, error: error.message };
  }
}

export async function closePostgres() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
