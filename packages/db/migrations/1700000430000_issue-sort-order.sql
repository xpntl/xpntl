-- Add sort_order to issues for manual board reordering.
-- Uses DOUBLE PRECISION so we can insert between any two items by averaging.
ALTER TABLE issues ADD COLUMN sort_order DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Backfill existing issues: set sort_order from created_at so they keep their
-- current chronological ordering.  extract(epoch ...) gives a monotonic float.
UPDATE issues SET sort_order = extract(epoch FROM created_at);

CREATE INDEX issues_sort_order_idx ON issues (workspace_id, sort_order);
