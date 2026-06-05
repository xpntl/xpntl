import { useEffect } from 'react';
import { setViewingIssue, usePresenceViewers } from '../lib/sync-store';
import { useUsers } from '../lib/user-store';
import { AgentAvatar } from './AgentBadge';

/**
 * Live presence (XP-3 Phase 3): announces that the current user is viewing
 * `issueId` for as long as this is mounted, and renders an overlapping stack of
 * the *other* people currently viewing the same issue.
 */
export function PresenceDots({ issueId, size = 20 }: { issueId: string | null | undefined; size?: number }) {
  useEffect(() => {
    if (!issueId) return;
    setViewingIssue(issueId);
    return () => setViewingIssue(null);
  }, [issueId]);

  const viewerIds = usePresenceViewers(issueId);
  const byId = useUsers((s) => s.byId);
  if (viewerIds.length === 0) return null;

  const shown = viewerIds.slice(0, 3);
  return (
    <div
      style={{ display: 'flex', alignItems: 'center' }}
      title={`${viewerIds.length} other ${viewerIds.length === 1 ? 'person' : 'people'} viewing`}
    >
      {shown.map((id, i) => {
        const u = byId[id];
        const name = u?.displayName ?? u?.email ?? '?';
        return (
          <div
            key={id}
            style={{
              marginLeft: i === 0 ? 0 : -6,
              borderRadius: '50%',
              boxShadow: '0 0 0 1.5px var(--xp-surface)',
              zIndex: shown.length - i,
            }}
          >
            <AgentAvatar
              name={name}
              src={u?.avatarUrl ?? undefined}
              size={size}
              isAgent={u?.isAgent}
              harness={u?.agentHarness}
            />
          </div>
        );
      })}
      {viewerIds.length > 3 && (
        <span
          style={{
            marginLeft: -6,
            width: size,
            height: size,
            borderRadius: '50%',
            background: 'var(--xp-layer)',
            boxShadow: '0 0 0 1.5px var(--xp-surface)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 9,
            fontWeight: 700,
            color: 'var(--xp-muted)',
          }}
        >
          +{viewerIds.length - 3}
        </span>
      )}
    </div>
  );
}
