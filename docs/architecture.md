# Architecture

Last reviewed against the repo: 2026-06-02.

This document describes the current architecture first, then target-state items. Older docs in this repo used some future-state language as if it already existed; this page is intended to be operationally honest.

## 1. Current Runtime Shape

```text
Web / Mobile / Desktop / CLI / MCP clients
        |
        | HTTPS + WebSocket
        v
Azure Container App: xpntl-api
        |
        +-- Express 5 REST API at /v1/*
        +-- GraphQL Yoga at /graphql
        +-- MCP Streamable HTTP mounted at /mcp
        +-- WebSocket sync gateway at /v1/sync
        +-- Embedded background ticks
        |     - recurring issues
        |     - webhook delivery
        |     - social posting when configured
        |
        +-- Azure Postgres Flexible Server
        +-- Azure Blob Storage / Azurite through packages/storage
```

The repo contains packages for standalone `apps/mcp`, `apps/sync`, and `apps/worker`, but the current production path uses a single API container. The API imports the MCP mount, attaches the sync gateway to the same HTTP server, and runs worker ticks unless `DISABLE_EMBEDDED_TICKS=true`.

## 2. Core Packages

| Package | Current role |
|---|---|
| `apps/api` | Express app, REST routes, GraphQL, MCP mount, WebSocket sync, embedded ticks. |
| `apps/web` | React 19 + Vite app using REST APIs and local UI stores. Ships as an installable PWA (manifest + service worker) — that is the desktop story. |
| `apps/mobile` | Expo app with sign-in, onboarding states, issue screens, and notification registration. |
| `packages/domain` | Business rules, auth/session services, issue/comment/project logic, billing, imports, integrations, audit, sync op log. |
| `packages/db` | `pg` pool, migrations, transactions, and workspace-scoped query helpers. |
| `packages/storage` | Azure Blob/Azurite BlobStore implementation. |
| `packages/auth` | Role normalization and comparison helpers. |
| `packages/sync-engine` | Client mutation queue/idb primitives. |
| `packages/ui` | Shared React primitives and CSS tokens. |

## 3. Domain Layer

The domain package is the canonical behavior layer. Route handlers should validate wire input, resolve auth, and call domain services. Workspace authorization and business rules should live in domain code wherever possible.

Current pattern:

- REST routes use Express and Zod.
- GraphQL uses GraphQL Yoga and Pothos.
- MCP tools call into the same domain services.
- Domain services use parameterized SQL through `packages/db`.

Avoid duplicating behavior across REST, GraphQL, MCP, mobile, or CLI clients. If two transports need the same operation, move the shared behavior into `packages/domain`.

## 4. Authentication and Sessions

Current implementation:

- Session tokens are opaque random tokens, stored client-side as cookies and/or bearer tokens.
- Server stores only SHA-256 token hashes in `sessions`.
- Passwords use argon2id.
- MFA uses TOTP plus single-use recovery codes.
- Passkeys use `@simplewebauthn/server`.
- OAuth providers are supported when configured.
- API keys and harness keys are hashed and resolved to workspace contexts.

Important hardening note: the web app currently persists bearer tokens in Zustand/localStorage while also relying on HttpOnly cookies. That is convenient for multi-workspace UX, but it increases XSS blast radius. Prefer cookie-only web auth or memory-only bearer tokens before broader production exposure.

## 5. Workspace Tenancy

Tenancy is row-level by `workspace_id`.

The main guardrail is `tenantPoolQuery` / `tenantClientQuery` in `packages/db`, which rewrites `{TENANT}` placeholders to `workspace_id = $N` and appends the caller workspace id. This is the primary pattern for workspace-owned tables.

Current caveats:

- Some services still use direct `pool.query` where the query is global, admin-scoped, or manually includes `workspace_id`.
- Postgres RLS is a target-state defense-in-depth measure, not currently the primary enforced layer in the repo.
- Several routers still use `requireAuth` and then cast to a full workspace context. Prefer `requireFullAuth` for workspace-bound routes.

## 6. Sync

Current server sync is Postgres-backed:

- Domain writes record operations in an op log.
- The API sync gateway uses WebSocket at `/v1/sync`.
- Clients mint a short-lived sync ticket through `POST /v1/sync/ticket`.
- The gateway uses Postgres `LISTEN`/`NOTIFY` to fan out operations by workspace.
- Presence messages are in-memory per API process.

Target-state improvements:

- Explicit multi-replica behavior testing for WebSocket affinity and presence.
- Separate sync deployment only if telemetry shows the API process needs to split.
- Broader offline/client reconciliation tests around `packages/sync-engine`.

## 7. Storage

Cloud storage uses Azure Blob Storage through `DefaultAzureCredential` when `AZURE_STORAGE_ACCOUNT` is set. Local development uses an Azurite connection string when `AZURE_STORAGE_CONNECTION_STRING` is set.

File reads are proxied by the API at `/v1/files/*` when using managed identity. The proxy enforces workspace path checks before streaming blobs.

Security hardening still needed:

- Validate file type by content, not only browser-provided MIME type.
- Block or isolate active content such as SVG.
- Add safer serving headers (`X-Content-Type-Options`, `Content-Disposition` for unsafe types).
- Consider a cookieless asset domain for user uploads.

## 8. Deployment Boundary

Current cloud deployment is a single Azure Container App named `xpntl-api`, built and deployed by `.github/workflows/deploy-api.yml`.

Target-state items that are not yet committed:

- `infra/azure/` infrastructure-as-code.
- Separate worker/sync/web deployment artifacts.
- Production self-host Docker Compose.
- Helm chart.
- Automated DR backup job.

## 9. Open Architecture Work

1. Decide whether web auth becomes cookie-only.
2. Convert workspace-bound routers from `requireAuth` to `requireFullAuth`.
3. Add upload content validation and safer file-serving headers.
4. Add SSRF protections for general outbound webhooks.
5. Fix GitHub webhook raw-body verification and per-integration secret handling.
6. Capture current Azure resources as IaC.
7. Implement and test the DR backup/restore workflow.
