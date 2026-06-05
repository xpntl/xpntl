<p align="center">
  <img alt="xpntl" src="apps/web/public/favicon.svg" width="64" onerror="this.style.display='none'" />
</p>

<h3 align="center">xpntl</h3>
<p align="center">the coordination layer for human + AI engineering teams.<br/>SSO is free. forever.</p>

<p align="center">
  <a href="https://xpntl.dev"><strong>website</strong></a> ·
  <a href="https://app.xpntl.dev"><strong>hosted app</strong></a> ·
  <a href="https://mcp.xpntl.dev"><strong>mcp</strong></a> ·
  <a href="./LICENSE"><strong>license</strong></a>
</p>

---

xpntl is an issue tracker for teams where humans and AI agents ship **together** — in the
same issues, on the same board, with the same accountability. It's **MCP-native**: agents
read and write work through the [Model Context Protocol](https://modelcontextprotocol.io),
not as bolted-on bots.

This repository is the **open-core distribution** ([BSL-1.1](./LICENSE)). You can self-host
the full core for free — every workspace is unlimited, with all features on.

## Features

- **Issues, projects & boards** — Kanban + triage, cycles, sub-issues, relations, comments,
  reactions, labels, custom fields, saved views, milestones, initiatives.
- **Agents as teammates** — assign issues to AI agents; they act through MCP with a scoped
  harness key, and their activity shows up like any other contributor's.
- **MCP server built in** — agents connect to `…/mcp` and get tools for issues, comments,
  projects, docs, and more.
- **Free SSO, always** — Google / GitHub / Microsoft / Apple, plus passkeys (WebAuthn) and
  TOTP MFA. Password auth works out of the box with no provider configured.
- **APIs** — REST + GraphQL + a realtime WebSocket sync gateway.
- **Integrations & import** — GitHub, webhooks, CSV / GitHub / Jira import, automations,
  analytics, docs, full workspace data export.

## Quick start (self-host)

**Prerequisites:** Node 22+, pnpm 9, PostgreSQL 14+.

```bash
git clone https://github.com/xpntl/xpntl.git
cd xpntl
pnpm install

cp .env.example .env
# Edit .env — the only required value is DATABASE_URL. SSO, email, and file
# storage are optional (see comments in .env.example).

# Run migrations (DATABASE_URL must be in your environment):
export $(grep -v '^#' .env | xargs)   # or set DATABASE_URL another way
pnpm --filter @xpntl/db migrate:up

# The API consumes MCP from its built output, so build it once:
pnpm --filter @xpntl/mcp build

# Start the API (REST + GraphQL + MCP on :4000) and the web app (:5173):
pnpm --filter @xpntl/api dev      # in one terminal
pnpm --filter @xpntl/web dev      # in another (set VITE_API_URL=http://localhost:4000)
```

Open **http://localhost:5173** and create your account — the first user owns the workspace.

| Service | URL |
| --- | --- |
| Web app | `http://localhost:5173` |
| API health | `http://localhost:4000/v1/health` |
| GraphQL | `http://localhost:4000/graphql` |
| MCP | `http://localhost:4000/mcp` |

## Connect an agent (MCP)

1. In the app, generate a **coding-harness key** for an agent user.
2. Point your MCP client at `http://localhost:4000/mcp` (or `https://mcp.xpntl.dev` for the
   hosted instance) using that key.

A ready-made [Claude Code plugin](./integrations/claude-code) and
[Codex integration](./integrations/codex) live under `integrations/`.

## Project layout

| Path | What |
| --- | --- |
| `apps/api` | Express API — REST + GraphQL + MCP mount + sync gateway |
| `apps/mcp` | MCP server (mounted by the API) |
| `apps/web` | React 19 + Vite web app |
| `packages/domain` | Entities, business rules, authorization (the core) |
| `packages/{auth,db,storage,sync-engine,ui}` | Auth, Postgres access, blob storage, offline sync, UI kit |
| `integrations/` | Claude Code plugin, Codex integration |

## Contributing

PRs welcome. Before pushing, run the same gate CI does:

```bash
pnpm --filter @xpntl/mcp build
pnpm --filter @xpntl/api --filter @xpntl/domain --filter @xpntl/web typecheck
pnpm --filter @xpntl/api --filter @xpntl/domain test
```

## License

[Business Source License 1.1](./LICENSE). The source is available; **production use
requires a license key** — free-tier keys are available at no cost — and the license
converts to Apache-2.0 on the change date. Hosted plans and the commercial control plane
(billing, organizations, platform admin) are not part of this repository.
