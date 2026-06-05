-- Enforce one reaction per user per target (keep the most recent).

DELETE FROM reactions a
  USING reactions b
  WHERE a.target_type = b.target_type
    AND a.target_id = b.target_id
    AND a.user_id = b.user_id
    AND a.workspace_id = b.workspace_id
    AND a.created_at < b.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS reactions_one_per_user
  ON reactions (workspace_id, target_type, target_id, user_id);
