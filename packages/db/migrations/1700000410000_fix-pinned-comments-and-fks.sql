-- Fix pinned comments (migration 1700000320000 was empty) and FK mismatches.

-- 1. Add missing pinned columns to comments
ALTER TABLE comments
  ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pinned_by TEXT REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_comments_pinned ON comments (pinned_at) WHERE pinned_at IS NOT NULL;

-- 2. Fix assigned_resolved_by FK: references accounts(id) but receives user IDs.
--    Drop the bad FK and re-add referencing users(id).
ALTER TABLE comments
  DROP CONSTRAINT IF EXISTS comments_assigned_resolved_by_fkey;

ALTER TABLE comments
  ADD CONSTRAINT comments_assigned_resolved_by_fkey
  FOREIGN KEY (assigned_resolved_by) REFERENCES users(id) ON DELETE SET NULL;

-- 3. Same issue with comment-resolve migration: resolved_by references accounts(id).
ALTER TABLE comments
  DROP CONSTRAINT IF EXISTS comments_resolved_by_fkey;

ALTER TABLE comments
  ADD CONSTRAINT comments_resolved_by_fkey
  FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL;
