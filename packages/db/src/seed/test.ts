import { closePool } from '../pool.js';

async function main() {
  console.log(
    '[xpntl/db seed:test] no shared fixtures inserted; integration tests self-bootstrap workspaces via /auth/signup.',
  );
  console.log(
    '[xpntl/db seed:test] add deterministic seed data here when Playwright scenarios need known issue/project state.',
  );
}

main()
  .catch((err) => {
    console.error('[xpntl/db seed:test] failed:', err);
    process.exitCode = 1;
  })
  .finally(() => closePool());
