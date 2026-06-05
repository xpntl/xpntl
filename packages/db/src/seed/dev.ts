/**
 * Local-dev fixture data. Idempotent: safe to re-run.
 *
 * For now this is a stub. The signup flow already creates a workspace, user,
 * default states, and key counter, so a manual signup at http://localhost:5173/signup
 * is the recommended way to bootstrap a dev workspace.
 *
 * When this script grows, it should:
 *   - Create a known dev workspace (slug "dev", key "DEV") if not present
 *   - Create a known dev user (dev@xpntl.local / known password) if not present
 *   - Insert a handful of issues across states for UI exercise
 *   - Print the credentials so the developer can sign in immediately
 */

import { closePool } from '../pool.js';

async function main() {
  console.log('[xpntl/db seed:dev] nothing seeded yet; sign up at /signup to bootstrap a workspace.');
  console.log('[xpntl/db seed:dev] when you need fixtures, fill in src/seed/dev.ts.');
}

main()
  .catch((err) => {
    console.error('[xpntl/db seed:dev] failed:', err);
    process.exitCode = 1;
  })
  .finally(() => closePool());
