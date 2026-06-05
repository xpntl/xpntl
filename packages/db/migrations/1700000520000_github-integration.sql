CREATE TABLE github_integrations (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  installation_id BIGINT,
  owner           TEXT NOT NULL,
  repo            TEXT NOT NULL,
  webhook_secret  TEXT NOT NULL,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, owner, repo)
);

CREATE TABLE issue_pr_links (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  issue_id        TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  pr_number       INT NOT NULL,
  pr_url          TEXT NOT NULL,
  pr_title        TEXT,
  repo_owner      TEXT NOT NULL,
  repo_name       TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'merged', 'closed')),
  auto_close      BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, issue_id, pr_url)
);

CREATE INDEX idx_issue_pr_links_issue ON issue_pr_links (issue_id);
CREATE INDEX idx_issue_pr_links_repo ON issue_pr_links (repo_owner, repo_name, pr_number);
CREATE INDEX idx_github_integrations_ws ON github_integrations (workspace_id);
