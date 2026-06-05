import { useEffect, useState } from 'react';
import { type WorkflowState, api } from '../lib/api';
import { useAuth } from '../lib/auth-store';
import { useProjects } from '../lib/project-store';
import { useQuickCreate } from '../lib/quick-create-store';
import { useToasts } from '../lib/toast-store';
import { QuickCreateIssue } from './QuickCreateIssue';

/**
 * App-wide "New issue" modal (XP-59). Previously the modal was only mounted on
 * the Issues page, so the header's New-issue button did nothing on other
 * routes. Mounting it once in AppLayout, driven by the shared quick-create
 * store, makes it work everywhere. The board stays in sync via the create op.
 */
export function GlobalQuickCreate() {
  const open = useQuickCreate((s) => s.open);
  const setOpen = useQuickCreate((s) => s.setOpen);
  const token = useAuth((s) => s.token);
  const projects = useProjects((s) => s.all);
  const pushToast = useToasts((s) => s.push);
  const [states, setStates] = useState<WorkflowState[]>([]);

  // Make sure projects + states are available when the modal opens anywhere.
  useEffect(() => {
    if (!open || !token) return;
    void useProjects.getState().load(token);
    if (states.length === 0) {
      api
        .listWorkflowStates(token)
        .then((r) => setStates(r.states))
        .catch(() => {});
    }
  }, [open, token, states.length]);

  return (
    <QuickCreateIssue
      open={open}
      onClose={() => setOpen(false)}
      onCreated={(issue) => {
        pushToast('success', `Created ${issue.key}`);
        setOpen(false);
      }}
      projects={projects}
      states={states}
      defaultProjectId={projects[0]?.id}
    />
  );
}
