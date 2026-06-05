# Tooling

Last reviewed against the repo: 2026-06-02.

## 1. Runtime and Package Manager

- Node.js 22.
- pnpm workspaces.
- Turbo for task orchestration.
- TypeScript across API, web, domain, storage, CLI, MCP, sync, and worker packages.
- Rust only for the Tauri desktop shell.

## 2. Actual Workspace Layout

```text
apps/
  api/       Express 5 REST + GraphQL + MCP mount + WebSocket sync
  web/       React 19 + Vite 6
  mobile/    Expo / React Native
  desktop/   Tauri 2
  cli/       Node CLI
  mcp/       MCP package, mounted by API in current prod path
  sync/      standalone sync package, not separately deployed today
  worker/    standalone worker package, not separately deployed today

packages/
  auth/
  db/
  domain/
  storage/
  sync-engine/
  ui/
```

The root workspace only includes `apps/*` and `packages/*`.

## 3. Common Commands

```bash
pnpm install
pnpm db:up
pnpm db:migrate
pnpm seed:dev
pnpm dev
pnpm build
pnpm typecheck
pnpm test
pnpm lint
```

Useful scoped checks:

```bash
pnpm --filter @xpntl/api typecheck
pnpm --filter @xpntl/domain test
pnpm --filter @xpntl/web typecheck
pnpm exec biome check apps/api apps/web/src packages/auth packages/db packages/domain packages/storage
```

## 4. Current Check Status

Recent review results:

- `pnpm --filter @xpntl/api typecheck` passed.
- `pnpm --filter @xpntl/domain test` passed.
- `pnpm lint` currently fails because Biome scans `.claude/worktrees` and reports a very large number of formatting diagnostics from side worktrees.
- A scoped Biome check on active app/package paths also reports formatting/import-order issues.

Recommended cleanup:

1. Add `.claude/` and generated/archive folders to Biome ignores.
2. Run formatting on active source paths.
3. Decide whether archived public-site/package snapshots should be checked or excluded.

## 5. Framework Choices

| Concern | Current choice |
|---|---|
| HTTP | Express 5 |
| REST validation | Zod |
| GraphQL | GraphQL Yoga + Pothos |
| DB access | `pg` + raw SQL helpers |
| Migrations | `node-pg-migrate` with SQL migrations |
| Web | React 19 + Vite 6 + `react-router-dom` |
| State | Zustand for app/UI state, sync-engine primitives for queued mutations |
| Rich text | TipTap |
| Mobile | Expo |
| Desktop | Tauri 2 |
| MCP | `@modelcontextprotocol/sdk` |
| Formatting/lint | Biome |
| Tests | Vitest, Playwright |

## 6. CI / Deploy Reality

Committed workflow today:

- `.github/workflows/deploy-api.yml`
  - installs db dependencies
  - runs database migrations using `DATABASE_URL`
  - logs into Azure
  - builds and pushes one API image to `xpntlcr.azurecr.io/xpntl-api`
  - updates the `xpntl-api` Container App

Not yet present as committed workflows:

- PR check workflow covering lint/typecheck/test/build.
- Separate image builds for web/sync/mcp/worker.
- Release branch workflow.
- Staging/prod approval gate.
- DR backup freshness checks.

## 7. Local Development

Local services are defined in `infra/docker-compose/docker-compose.yml`:

- Postgres 17
- Azurite Blob
- Mailpit
- SAML test IdP

`infra/docker-compose/docker-compose.override.yml` remaps some host ports for this developer machine; keep that in mind if copying commands.

## 8. Documentation Rule

When adding docs, label states explicitly:

- `Current` means the code/artifact exists in this repo.
- `Configured in Azure` means the code references it but the setting must be verified live.
- `Planned` means target-state, not a promise that the artifact exists.
