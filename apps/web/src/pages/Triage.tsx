import { IssueKey, Priority } from '@xpntl/ui';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { type Issue, type WorkflowState, api } from '../lib/api';
import { useAuth } from '../lib/auth-store';
import { priorityKind } from '../lib/format';
import { useProjectScope } from '../lib/use-project-scope';
import { useToasts } from '../lib/toast-store';

export function TriagePage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const pushToast = useToasts((s) => s.push);
  const { project, projectId } = useProjectScope();

  const [issues, setIssues] = useState<Issue[]>([]);
  const [backlogStateId, setBacklogStateId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    Promise.all([
      api.listIssues({ stateType: 'triage', projectId: projectId || undefined, sort: 'created_desc' }, token),
      api.listWorkflowStates(token),
    ])
      .then(([issuesRes, statesRes]) => {
        setIssues(issuesRes.issues);
        const backlog = statesRes.states.find((s: WorkflowState) => s.type === 'backlog');
        setBacklogStateId(backlog?.id ?? null);
      })
      .catch(() => setIssues([]))
      .finally(() => setLoading(false));
  }, [token, projectId]);

  function addToBacklog(issue: Issue) {
    if (!backlogStateId) return;
    const snapshot = issues;
    setIssues((cur) => cur.filter((i) => i.id !== issue.id));
    api
      .updateIssue(issue.key, { stateId: backlogStateId }, token)
      .then(() => pushToast('success', `${issue.key} → Backlog`))
      .catch(() => {
        setIssues(snapshot);
        pushToast('danger', `Failed to move ${issue.key}`);
      });
  }

  return (
    <AppLayout>
      <div style={{ padding: '20px 24px', flex: 1, minHeight: 0, overflow: 'auto' }}>
        <h1 style={{ fontFamily: 'var(--xp-font-mono)', fontSize: 18, fontWeight: 700, color: 'var(--xp-ink)', margin: '0 0 4px' }}>
          Triage
        </h1>
        <p style={{ fontFamily: 'var(--xp-font-mono)', fontSize: 12, color: 'var(--xp-muted)', margin: '0 0 20px' }}>
          {project ? `${project.name} · ` : ''}Review incoming issues and move them into the backlog. {issues.length} to review.
        </p>

        {loading ? (
          <div style={{ fontFamily: 'var(--xp-font-mono)', fontSize: 12, color: 'var(--xp-faint)' }}>Loading…</div>
        ) : issues.length === 0 ? (
          <div style={{ fontFamily: 'var(--xp-font-mono)', fontSize: 13, color: 'var(--xp-muted)' }}>
            Nothing to triage. Nice work.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--xp-hairline)', borderRadius: 8, overflow: 'hidden' }}>
            {issues.map((issue, i) => (
              <div
                key={issue.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                  borderTop: i === 0 ? 'none' : '1px solid var(--xp-hairline)',
                  fontFamily: 'var(--xp-font-mono)', fontSize: 12.5,
                }}
              >
                <Priority kind={priorityKind(issue.priority)} size={12} />
                <button
                  type="button"
                  onClick={() => navigate(`/issues/${encodeURIComponent(issue.key)}`)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, background: 'transparent', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--xp-font-mono)', fontSize: 12.5 }}
                >
                  <IssueKey size="sm">{issue.key}</IssueKey>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--xp-ink)' }}>
                    {issue.title}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => addToBacklog(issue)}
                  disabled={!backlogStateId}
                  style={{
                    fontFamily: 'var(--xp-font-mono)', fontSize: 11, fontWeight: 600,
                    padding: '4px 12px', border: 0, borderRadius: 4,
                    background: 'var(--xp-accent)', color: 'var(--xp-accent-fg)',
                    cursor: backlogStateId ? 'pointer' : 'not-allowed', flex: 'none',
                  }}
                >
                  Add to backlog
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
