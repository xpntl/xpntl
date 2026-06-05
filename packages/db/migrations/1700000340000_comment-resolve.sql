ALTER TABLE comments
  ADD COLUMN resolved_at TIMESTAMPTZ,
  ADD COLUMN resolved_by TEXT REFERENCES accounts(id);

CREATE INDEX idx_comments_resolved_at ON comments (resolved_at) WHERE resolved_at IS NOT NULL;
