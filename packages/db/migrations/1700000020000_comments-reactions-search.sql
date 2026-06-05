-- Up Migration

-- ----------------------------------------------------------------------------
-- Comments (flat, not threaded for MVP; threading lands later)
-- ----------------------------------------------------------------------------

CREATE TABLE comments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  issue_id      UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  author_id     UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  body          TEXT NOT NULL,
  edited_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX comments_issue_created_idx ON comments (issue_id, created_at ASC);
CREATE INDEX comments_workspace_idx ON comments (workspace_id);

-- Mentions are derived from the body via a regex extract; we keep them in their
-- own table so we can index on mentioned_user_id for the "things mentioning me"
-- view later. Insert/delete in the same transaction as the comment.
CREATE TABLE comment_mentions (
  comment_id        UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  workspace_id      UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  mentioned_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (comment_id, mentioned_user_id)
);

CREATE INDEX comment_mentions_user_idx ON comment_mentions (workspace_id, mentioned_user_id);

-- ----------------------------------------------------------------------------
-- Reactions (polymorphic: issue or comment)
-- ----------------------------------------------------------------------------

CREATE TABLE reactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  target_type   TEXT NOT NULL CHECK (target_type IN ('issue', 'comment')),
  target_id     UUID NOT NULL,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji         TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, target_type, target_id, user_id, emoji)
);

CREATE INDEX reactions_target_idx ON reactions (workspace_id, target_type, target_id);

-- ----------------------------------------------------------------------------
-- Full-text search on issues (tsvector generated column + GIN index)
-- ----------------------------------------------------------------------------

ALTER TABLE issues
  ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(key, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(title, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C')
  ) STORED;

CREATE INDEX issues_search_idx ON issues USING GIN(search_vector);

-- Down Migration

DROP INDEX issues_search_idx;
ALTER TABLE issues DROP COLUMN search_vector;
DROP TABLE reactions;
DROP TABLE comment_mentions;
DROP TABLE comments;
