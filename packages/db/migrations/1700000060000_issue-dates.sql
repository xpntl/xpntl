-- PER-14 — Add start_date and due_date to issues for roadmap/timeline view.

ALTER TABLE issues ADD COLUMN IF NOT EXISTS start_date timestamptz;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS due_date   timestamptz;
