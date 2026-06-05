CREATE TABLE api_keys (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,  -- first 8 chars for display (e.g., "xp_abc12...")
  key_hash TEXT NOT NULL,  -- SHA-256 hash of the full key
  scopes TEXT[] NOT NULL DEFAULT '{}',  -- e.g., ['issues:read', 'issues:write', 'comments:read']
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_api_keys_workspace ON api_keys(workspace_id) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX idx_api_keys_prefix ON api_keys(prefix);
