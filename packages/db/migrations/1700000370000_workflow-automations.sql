CREATE TABLE workflow_automations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  trigger_type TEXT NOT NULL,  -- 'state_change', 'issue_created', 'label_added', 'due_date_passed'
  trigger_config JSONB NOT NULL DEFAULT '{}',  -- e.g., { "from_state_type": "started", "to_state_type": "completed" }
  action_type TEXT NOT NULL,  -- 'set_label', 'set_assignee', 'set_priority', 'add_comment', 'move_state'
  action_config JSONB NOT NULL DEFAULT '{}',  -- e.g., { "label_id": "..." } or { "priority": 3 }
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_automations_workspace ON workflow_automations(workspace_id) WHERE enabled = true;
