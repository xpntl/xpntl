import { IssueKey, Priority } from '@xpntl/ui';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { type Issue, api } from '../lib/api';
import { useAuth } from '../lib/auth-store';
import { priorityKind } from '../lib/format';
import { useProjectScope } from '../lib/use-project-scope';
import { useToasts } from '../lib/toast-store';

export function ArchivedIssuesPage() {
  const { token } = useAuth();
  const { project, projectId } = useProjectScope();
  const pushToast = useToasts((s) => s.push);

  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api
      .listArchivedIssues(projectId || undefined, token)
      .then((r) => setIssues(r.issues))
      .catch(() => setIssues([]))
      .finally(() => setLoading(false));
  }, [token, projectId]);

  function handleUnarchive(key: string) {
    const snapshot = issues;
    setIssues((cur) => cur.filter((i) => i.key !== key));
    api
      .unarchiveIssue(key, token)
      .then(() => pushToast('success', `Unarchived ${key}`))
      .catch(() => {
        setIssues(snapshot);
        pushToast('danger', `Failed to unarchive ${key}`);
      });
  }

  return (
    <AppLayout>
      <div style={{ padding: '20px 24px', flex: 1, minHeight: 0, overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <Link
            to="/projects"
            style={{ fontSize: 11, color: 'var(--xp-muted)', textDecoration: 'none' }}
          >
            ← Projects
          </Link>
        </div>
        <h1 style={{ fontFamily: 'var(--xp-font-mono)', fontSize: 18, fontWeight: 700, color: 'var(--xp-ink)', margin: '0 0 4px' }}>
          Archived issues
        </h1>
        <p style={{ fontFamily: 'var(--xp-font-mono)', fontSize: 12, color: 'var(--xp-muted)', margin: '0 0 20px' }}>
          {project ? project.name : 'All projects'} · hidden from the board and lists
        </p>

        {loading ? (
          <div style={{ fontFamily: 'var(--xp-font-mono)', fontSize: 12, color: 'var(--xp-faint)' }}>Loading…</div>
        ) : issues.length === 0 ? (
          <div style={{ fontFamily: 'var(--xp-font-mono)', fontSize: 13, color: 'var(--xp-muted)' }}>
            No archived issues.
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
                <IssueKey size="sm">{issue.key}</IssueKey>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--xp-ink)' }}>
                  {issue.title}
                </span>
                <button
                  type="button"
                  onClick={() => handleUnarchive(issue.key)}
                  style={{
                    fontFamily: 'var(--xp-font-mono)', fontSize: 11, fontWeight: 500,
                    padding: '4px 10px', border: '1px solid var(--xp-border)', borderRadius: 4,
                    background: 'var(--xp-layer)', color: 'var(--xp-ink)', cursor: 'pointer', flex: 'none',
                  }}
                >
                  Unarchive
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
