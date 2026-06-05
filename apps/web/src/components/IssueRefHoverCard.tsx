// apps/web/src/components/IssueRefHoverCard.tsx
//
// Hover card that appears when the user mouses over an issue reference link
// (e.g. XP-123) in rich text. Shows title, state, priority, and assignee.

import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Avatar, Priority, StateDot } from '@xpntl/ui';
import { AgentAvatar } from './AgentBadge';
import { type IssueSummary, fetchIssueSummary } from '../lib/issue-ref-cache';
import { useAuth } from '../lib/auth-store';
import { useUsers } from '../lib/user-store';

type PriorityKind = 'urgent' | 'high' | 'normal' | 'low' | 'none';

function priorityKind(p: number): PriorityKind {
  switch (p) {
    case 1: return 'urgent';
    case 2: return 'high';
    case 3: return 'normal';
    case 4: return 'low';
    default: return 'none';
  }
}

function priorityLabel(p: number): string {
  switch (p) {
    case 1: return 'Urgent';
    case 2: return 'High';
    case 3: return 'Normal';
    case 4: return 'Low';
    default: return 'None';
  }
}

interface IssueRefHoverCardProps {
  issueKey: string;
  anchorRect: DOMRect;
  onClose: () => void;
}

export function IssueRefHoverCard({ issueKey, anchorRect, onClose }: IssueRefHoverCardProps) {
  const { token } = useAuth();
  const usersById = useUsers((s) => s.byId);
  const [summary, setSummary] = useState<IssueSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const cardRef = useRef<HTMLDivElement>(null);

  // usersById only enriches the assignee name/avatar — read it via a ref so it
  // isn't a fetch dependency. The store rewrites byId on every presence tick, so
  // depending on it here re-fired this fetch on each tick (a refetch loop).
  const usersByIdRef = useRef(usersById);
  usersByIdRef.current = usersById;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchIssueSummary(issueKey, token, usersByIdRef.current).then((data) => {
      if (!cancelled) {
        setSummary(data);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [issueKey, token]);

  // Position the card above or below the anchor
  const [pos, setPos] = useState<{ top: number; left: number; placement: 'above' | 'below' }>({
    top: 0,
    left: 0,
    placement: 'below',
  });

  useEffect(() => {
    const cardHeight = 100; // approximate
    const gap = 6;
    const spaceAbove = anchorRect.top;
    const spaceBelow = window.innerHeight - anchorRect.bottom;
    const placement = spaceBelow >= cardHeight + gap || spaceBelow >= spaceAbove ? 'below' : 'above';
    const top = placement === 'below'
      ? anchorRect.bottom + gap
      : anchorRect.top - cardHeight - gap;
    const left = Math.max(8, Math.min(anchorRect.left, window.innerWidth - 300));
    setPos({ top, left, placement });
  }, [anchorRect]);

  // Close when mouse leaves the card area
  const handleMouseLeave = useCallback(() => {
    onClose();
  }, [onClose]);

  const cardStyle: CSSProperties = {
    position: 'fixed',
    top: pos.top,
    left: pos.left,
    zIndex: 9999,
    width: 280,
    padding: '10px 12px',
    background: 'var(--xp-surface)',
    border: '1px solid var(--xp-border)',
    borderRadius: 'var(--xp-r-md)',
    boxShadow: 'var(--xp-shadow-2)',
    fontSize: 12,
    lineHeight: 1.4,
    color: 'var(--xp-ink)',
    pointerEvents: 'auto',
  };

  const card = (
    <div ref={cardRef} style={cardStyle} onMouseLeave={handleMouseLeave}>
      {loading && (
        <div style={{ color: 'var(--xp-muted)', fontFamily: 'var(--xp-font-mono)', fontSize: 11 }}>
          Loading {issueKey}...
        </div>
      )}
      {!loading && !summary && (
        <div style={{ color: 'var(--xp-muted)', fontFamily: 'var(--xp-font-mono)', fontSize: 11 }}>
          Issue not found
        </div>
      )}
      {!loading && summary && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Key + Priority */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                fontFamily: 'var(--xp-font-mono)',
                fontSize: 11,
                color: 'var(--xp-muted)',
                fontWeight: 600,
              }}
            >
              {summary.key}
            </span>
            <span style={{ flex: 1 }} />
            <Priority kind={priorityKind(summary.priority)} size={12} />
            <span
              style={{
                fontFamily: 'var(--xp-font-mono)',
                fontSize: 10,
                color: 'var(--xp-muted)',
              }}
            >
              {priorityLabel(summary.priority)}
            </span>
          </div>

          {/* Title */}
          <div
            style={{
              fontWeight: 600,
              fontSize: 13,
              lineHeight: 1.3,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {summary.title}
          </div>

          {/* State + Assignee row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <StateDot kind={summary.stateType} size={12} />
            <span
              style={{
                fontFamily: 'var(--xp-font-mono)',
                fontSize: 11,
                padding: '1px 6px',
                borderRadius: 'var(--xp-r-sm)',
                border: '1px solid var(--xp-hairline)',
                background: 'var(--xp-canvas)',
              }}
            >
              {summary.stateName}
            </span>
            <span style={{ flex: 1 }} />
            {summary.assigneeName ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <AgentAvatar
                  name={summary.assigneeName}
                  src={summary.assigneeAvatar ?? undefined}
                  size={16}
                  isAgent={summary.assigneeIsAgent}
                  harness={summary.assigneeHarness}
                />
                <span
                  style={{
                    fontFamily: 'var(--xp-font-mono)',
                    fontSize: 10.5,
                    color: 'var(--xp-muted)',
                    maxWidth: 80,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {summary.assigneeName}
                </span>
              </span>
            ) : (
              <span style={{ fontFamily: 'var(--xp-font-mono)', fontSize: 10.5, color: 'var(--xp-muted)' }}>
                Unassigned
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(card, document.body);
}
