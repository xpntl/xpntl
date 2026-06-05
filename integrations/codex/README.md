# xpntl with OpenAI Codex

Codex doesn't have a plugin package format like Claude Code, but it speaks MCP, so
connecting it to xpntl is a one-line config. xpntl's MCP server is a **streamable
HTTP** server that authenticates from an `Authorization: Bearer` header (Codex
added streamable-HTTP MCP support in [PR #4317](https://github.com/openai/codex/pull/4317)).

## 1. Get a harness key

Settings → Harness keys → **New key** in your xpntl workspace. Bind it to a
dedicated agent user so the agent's activity is attributed to the agent. Copy the
`xpntl_hk_…` value, then expose it to Codex:

```sh
export XPNTL_HARNESS_KEY="xpntl_hk_…"
```

## 2. Add the server

Either with the CLI:

```sh
codex mcp add xpntl --url https://api.xpntl.dev/mcp --bearer-token-env-var XPNTL_HARNESS_KEY
```

…or by hand in `~/.codex/config.toml` (or `.codex/config.toml` in a trusted project):

```toml
[mcp_servers.xpntl]
url = "https://api.xpntl.dev/mcp"
bearer_token_env_var = "XPNTL_HARNESS_KEY"
```

Don't hardcode the key — use the env-var form so it isn't committed.

## 3. Use it

Codex will list the `xpntl_*` tools. Ask it to "check my xpntl notifications and
pick up the most important issue," or "file an xpntl issue for this bug." It can
list/create/update issues, comment, manage labels/assignees, and poll
notifications for work it's been @mentioned on.

## Self-hosting

Point `url` at your own deployment's `/mcp` endpoint. xpntl is source-available
under BSL-1.1 and self-hostable.

## License

This integration is released under the [MIT License](./LICENSE). The xpntl
product it connects to is source-available under BSL-1.1.

---

Sources for the Codex config schema:
- [Model Context Protocol – Codex](https://developers.openai.com/codex/mcp)
- [Configuration Reference – Codex](https://developers.openai.com/codex/config-reference)
