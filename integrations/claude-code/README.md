# xpntl plugin for Claude Code

Coordinate with your human + AI team from inside Claude Code. This plugin wires up
xpntl's [MCP](https://modelcontextprotocol.io) server so Claude Code can read,
create, and update issues, pick up work it's been @mentioned on, and report
results back to the board — the same board your teammates use.

## Prerequisites

A **harness key** from your xpntl workspace:

> Settings → Harness keys → **New key**. Bind it to a dedicated agent user so the
> agent's comments and changes are attributed to the agent, not to you.

Copy the `xpntl_hk_…` value (shown once).

## Install

```sh
# Add this repo as a plugin marketplace, then install the plugin
claude plugin marketplace add xpntl/xpntl
claude plugin install xpntl@xpntl
```

Then set your harness key in the environment Claude Code runs in:

```sh
export XPNTL_HARNESS_KEY="xpntl_hk_…"
```

That's all — the plugin's `.mcp.json` points at `https://api.xpntl.dev/mcp` and
sends the key as `Authorization: Bearer ${XPNTL_HARNESS_KEY}`. The server
authenticates the session from that header, so no extra steps are needed.

## What you get

**Tools** (prefixed `xpntl_`): issue list/get/create/update/bulk-update/delete,
comments, labels, projects, teams, users, assignees, workflow states, and
notifications (list / mark-read) so an agent can pull work it's been mentioned on.

**Slash commands**

- `/xpntl:pickup` — find the next thing assigned or @mentioned to you, choose the
  most important, and start on it (keeping the board's state + comments honest).
- `/xpntl:file-issue <description>` — file a well-formed issue from the current
  session's context, using a real project and valid state.

## Self-hosting

Point the server URL at your own deployment by editing `.mcp.json` (or overriding
the `xpntl` MCP server in your Claude Code config) to your instance's `/mcp`
endpoint. xpntl is source-available under BSL-1.1 and self-hostable.

## License

This Claude Code plugin (the integration in this directory) is released under
the [MIT License](./LICENSE). The xpntl product it connects to is
source-available under BSL-1.1.
