import { Pool } from 'pg';

let _pool: Pool | undefined;

/**
 * Lazy-initialized singleton Postgres pool. The first call reads `DATABASE_URL`
 * from the environment; subsequent calls return the same pool.
 *
 * We initialize lazily so importing `@xpntl/db` does not require env vars to be
 * set at module-load time. This matters for codegen, tests, and tooling.
 */
export function getPool(): Pool {
  if (!_pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set. Copy .env.example to .env and re-run.');
    }
    _pool = new Pool({ connectionString });
  }
  return _pool;
}

/** Close the pool. Call from graceful shutdown. */
export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = undefined;
  }
}
