-- Up Migration

ALTER TABLE users
  ADD COLUMN is_agent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN agent_harness TEXT;

COMMENT ON COLUMN users.is_agent IS 'True for AI agent identities (Claude Code, Codex, Cursor, etc.)';
COMMENT ON COLUMN users.agent_harness IS 'Coding harness type: claude_code, codex, cursor, opencode, custom';

CREATE INDEX users_agents_idx ON users (workspace_id)
  WHERE is_agent = true;

ALTER TABLE coding_harness_keys
  ADD COLUMN agent_user_id UUID REFERENCES users(id);

COMMENT ON COLUMN coding_harness_keys.agent_user_id IS 'The agent user identity this key authenticates as';

-- Down Migration

ALTER TABLE coding_harness_keys
  DROP COLUMN IF EXISTS agent_user_id;

DROP INDEX IF EXISTS users_agents_idx;

ALTER TABLE users
  DROP COLUMN IF EXISTS agent_harness,
  DROP COLUMN IF EXISTS is_agent;
