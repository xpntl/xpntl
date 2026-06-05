CREATE TABLE feedback_customers (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  company TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_feedback_customers_ws ON feedback_customers (workspace_id);

CREATE TABLE feedback_items (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES feedback_customers(id) ON DELETE SET NULL,
  issue_id TEXT REFERENCES issues(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'email', 'slack', 'api')),
  votes INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'planned', 'closed')),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_feedback_items_ws ON feedback_items (workspace_id);
CREATE INDEX idx_feedback_items_issue ON feedback_items (issue_id);
CREATE INDEX idx_feedback_items_status ON feedback_items (workspace_id, status);

CREATE TABLE feedback_votes (
  id TEXT PRIMARY KEY,
  feedback_id TEXT NOT NULL REFERENCES feedback_items(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES feedback_customers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (feedback_id, customer_id)
);
