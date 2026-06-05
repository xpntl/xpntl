import type { PoolClient } from 'pg';
import { getPool } from './pool.js';

/**
 * Run a function inside a Postgres transaction. Commits on success, rolls back
 * on throw. The function receives the same `PoolClient` so all queries inside
 * the transaction share the connection.
 *
 * Use `tenantClientQuery(client, workspaceId, sql, params)` inside `fn` for
 * tenant-scoped queries on the transaction's client.
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {
      /* best-effort */
    });
    throw err;
  } finally {
    client.release();
  }
}
