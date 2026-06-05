# xpntl docs

Last reviewed against the repo: 2026-06-02.

These docs now separate current implementation from target-state. If a page says "planned" or "target", do not assume the artifact exists in the repo or in Azure.

## Start Here

- [Architecture](./architecture.md) - current runtime shape, data boundaries, auth, sync, and storage.
- [Tooling](./tooling.md) - actual packages, commands, checks, and current CI gaps.
- [Deployment](./deployment.md) - current Azure deploy plus planned self-host/multi-process work.
- [Disaster recovery](./operations/disaster-recovery.md) - target DR plan and concrete setup backlog.

## Current Reality Snapshot

- Current cloud deploy is `xpntl-api` in Azure Container Apps.
- The API process serves REST, GraphQL, MCP, WebSocket sync, and embedded recurring/webhook/social ticks.
- Local development uses `infra/docker-compose/docker-compose.yml` for Postgres, Azurite, Mailpit, and a SAML test IdP.
- `infra/azure/`, self-host compose, Helm, and DR automation are not committed yet.

## Guiding Principles

1. SSO should be a security baseline, not a pricing lever.
2. Agents should use first-class APIs/MCP, not scrape the UI.
3. Domain behavior belongs in `packages/domain`; transports adapt to it.
4. Workspace data must stay workspace-scoped at every query boundary.
5. Operational docs should say what exists today and what is still target-state.
