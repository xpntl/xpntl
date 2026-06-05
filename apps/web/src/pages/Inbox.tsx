import { Avatar, Spinner, Tabs } from '@xpntl/ui';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { api, type Notification } from '../lib/api';
import { useAuth } from '../lib/auth-store';
import { useUsers } from '../lib/user-store';

type Tab = 'unread' | 'all' | 'archived';

const TAB_OPTS: Array<{ value: Tab; label: string }> = [
  { value: 'unread', label: 'Unread' },
  { value: 'all', label: 'All' },
  { value: 'archived', label: 'Archived' },
];

export function InboxPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const usersById = useUsers((s) => s.byId);

  const [tab, setTab] = useState<Tab>('unread');
  const [items, setItems] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [list, count] = await Promise.all([
        api.listNotifications(
          tab === 'unread'
            ? { unread: true, archived: 'active', limit: 100 }
            : tab === 'archived'
              ? { archived: 'archived', limit: 100 }
              : { archived: 'active', limit: 100 },
          token,
        ),
        api.getUnreadCount(token),
      ]);
      setItems(list.notifications);
      setUnreadCount(count.count);
    } finally {
      setLoading(false);
    }
  }, [token, tab]);

  useEffect(() => { load(); }, [load]);

  async function patchOne(n: Notification, action: 'read' | 'unread' | 'archive' | 'unarchive') {
    if (!token || busy === n.id) return;
    setBusy(n.id);

    // Optimistic update — drop or mutate locally so the UI stays snappy.
    setItems((prev) => {
      if (action === 'archive' && tab !== 'archived') return prev.filter((x) => x.id !== n.id);
      if (action === 'unarchive' && tab === 'archived') return prev.filter((x) => x.id !== n.id);
      if (action === 'read' && tab === 'unread') return prev.filter((x) => x.id !== n.id);
      return prev.map((x) =>
        x.id === n.id
          ? {
              ...x,
              readAt: action === 'read' ? new Date().toISOString() : action === 'unread' ? null : x.readAt,
              archivedAt: action === 'archive' ? new Date().toISOString() : action === 'unarchive' ? null : x.archivedAt,
            }
          : x,
      );
    });
    if (!n.readAt && (action === 'read' || action === 'archive')) {
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    if (n.readAt && action === 'unread') {
      setUnreadCount((c) => c + 1);
    }

    try {
      if (action === 'read') await api.markNotificationRead(n.id, token);
      else if (action === 'unread') await api.markNotificationUnread(n.id, token);
      else if (action === 'archive') await api.archiveNotification(n.id, token);
      else await api.unarchiveNotification(n.id, token);
    } catch {
      // On failure, refresh to reset state.
      load();
    } finally {
      setBusy(null);
    }
  }

  async function markAllRead() {
    if (!token) return;
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    setUnreadCount(0);
    try {
      await api.markAllNotificationsRead(token);
      // After marking all, the Unread tab is empty; refresh to confirm.
      if (tab === 'unread') load();
    } catch {
      load();
    }
  }

  function openNotification(n: Notification) {
    // Mark read on click, then navigate to the linked issue (or comment thread).
    if (!n.readAt) patchOne(n, 'read');
    if (n.issueKey) {
      const path = n.commentId
        ? `/issues/${encodeURIComponent(n.issueKey)}/full#c-${n.commentId}`
        : `/issues/${encodeURIComponent(n.issueKey)}`;
      navigate(path);
    }
  }

  const tabs = TAB_OPTS.map((t) => ({
    value: t.value,
    label: t.label,
    count: t.value === 'unread' ? unreadCount : undefined,
  }));

  return (
    <AppLayout>
      <div
        style={{
          height: '100%',
          width: '100%',
          overflow: 'auto',
          fontFamily: 'var(--xp-font-mono)',
          color: 'var(--xp-ink)',
        }}
      >
        <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', margin: 0 }}>
              Inbox
            </h1>
            <div style={{ flex: 1, minWidth: 8 }} />
            {tab === 'unread' && unreadCount > 0 && (
              <button type="button" onClick={markAllRead} style={headerBtn}>
                Mark all read
              </button>
            )}
          </div>

          <Tabs value={tab} onChange={(v) => setTab(v as Tab)} tabs={tabs} />

          {loading ? (
            <Spinner label="Loading notifications…" />
          ) : items.length === 0 ? (
            <EmptyState tab={tab} />
          ) : (
            <ul style={listStyle}>
              {items.map((n) => (
                <NotificationRow
                  key={n.id}
                  notification={n}
                  actor={n.actorId ? usersById[n.actorId] : undefined}
                  onOpen={() => openNotification(n)}
                  onAction={(action) => patchOne(n, action)}
                  isArchived={tab === 'archived'}
                  busy={busy === n.id}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  const msg =
    tab === 'unread'
      ? 'Inbox zero. Nothing unread.'
      : tab === 'archived'
        ? 'No archived notifications yet.'
        : 'No notifications yet.';
  return (
    <div
      style={{
        padding: '64px 16px',
        textAlign: 'center',
        color: 'var(--xp-muted)',
        fontSize: 13,
      }}
    >
      {msg}
    </div>
  );
}

type ActorLike = { displayName?: string | null; email?: string | null; avatarUrl?: string | null } | undefined;

function NotificationRow({
  notification: n,
  actor,
  onOpen,
  onAction,
  isArchived,
  busy,
}: {
  notification: Notification;
  actor: ActorLike;
  onOpen: () => void;
  onAction: (action: 'read' | 'unread' | 'archive' | 'unarchive') => void;
  isArchived: boolean;
  busy: boolean;
}) {
  const actorName = actor?.displayName ?? actor?.email ?? 'Someone';
  const unread = !n.readAt;

  return (
    <li
      style={{
        ...rowStyle,
        background: unread ? 'var(--xp-layer)' : 'transparent',
        opacity: busy ? 0.6 : 1,
      }}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      tabIndex={0}
    >
      {/* Unread dot */}
      <div style={{ width: 8, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
        {unread && (
          <span
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: 'var(--xp-accent-strong)',
            }}
          />
        )}
      </div>

      {/* Actor avatar */}
      <div style={{ flexShrink: 0 }}>
        <Avatar name={actorName} size={28} src={actor?.avatarUrl ?? undefined} />
      </div>

      {/* Type icon */}
      <span
        aria-label={n.type}
        title={n.type}
        style={{ ...typeBadge, color: typeColor(n.type) }}
      >
        {typeIcon(n.type)}
      </span>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: unread ? 600 : 500,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {n.title}
        </div>
        {n.body && (
          <div
            style={{
              fontSize: 11.5,
              color: 'var(--xp-muted)',
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 1,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {n.body}
          </div>
        )}
      </div>

      {/* Right metadata */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
        {n.issueKey && (
          <span
            style={{
              fontSize: 10.5,
              letterSpacing: '0.04em',
              color: 'var(--xp-muted)',
              fontFamily: 'var(--xp-font-mono)',
              padding: '2px 6px',
              border: '1px solid var(--xp-hairline)',
              borderRadius: 'var(--xp-r-sm)',
            }}
          >
            {n.issueKey}
          </span>
        )}
        <span style={{ fontSize: 11, color: 'var(--xp-faint)', fontVariantNumeric: 'tabular-nums' }}>
          {formatRelative(n.createdAt)}
        </span>
        {/* Actions */}
        <div className="xp-inbox-actions" style={{ display: 'flex', gap: 4 }}>
          {!isArchived && unread && (
            <button
              type="button"
              title="Mark as read"
              onClick={(e) => { e.stopPropagation(); onAction('read'); }}
              style={iconBtn}
            >
              ✓
            </button>
          )}
          {!isArchived && !unread && (
            <button
              type="button"
              title="Mark as unread"
              onClick={(e) => { e.stopPropagation(); onAction('unread'); }}
              style={iconBtn}
            >
              ↺
            </button>
          )}
          {!isArchived && (
            <button
              type="button"
              title="Archive"
              onClick={(e) => { e.stopPropagation(); onAction('archive'); }}
              style={iconBtn}
            >
              ⌫
            </button>
          )}
          {isArchived && (
            <button
              type="button"
              title="Unarchive"
              onClick={(e) => { e.stopPropagation(); onAction('unarchive'); }}
              style={iconBtn}
            >
              ↑
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

function typeIcon(type: Notification['type']): string {
  switch (type) {
    case 'mention': return '@';
    case 'assigned': return '★';
    case 'state_change': return '●';
    case 'comment': return '💬';
    case 'due_soon': return '⏰';
    default: return '·';
  }
}

function typeColor(type: Notification['type']): string {
  switch (type) {
    case 'mention': return 'var(--xp-accent-strong)';
    case 'assigned': return 'var(--xp-accent-strong)';
    case 'state_change': return 'var(--xp-muted)';
    case 'comment': return 'var(--xp-muted)';
    case 'due_soon': return 'var(--xp-danger, oklch(55% 0.22 25))';
    default: return 'var(--xp-muted)';
  }
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return 'now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ───────────────────────────────────────────────────────────────────────────
// Styles
// ───────────────────────────────────────────────────────────────────────────

const listStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  border: '1px solid var(--xp-hairline)',
  borderRadius: 'var(--xp-r-md)',
  overflow: 'hidden',
  background: 'var(--xp-surface)',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '10px 14px',
  borderBottom: '1px solid var(--xp-hairline)',
  cursor: 'pointer',
  transition: 'background var(--xp-dur-base) var(--xp-ease)',
};

const typeBadge: React.CSSProperties = {
  flexShrink: 0,
  width: 18,
  height: 18,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 12,
  fontWeight: 700,
};

const headerBtn: React.CSSProperties = {
  fontFamily: 'var(--xp-font-mono)',
  fontSize: 11,
  fontWeight: 500,
  padding: '5px 10px',
  background: 'var(--xp-layer)',
  color: 'var(--xp-ink)',
  border: '1px solid var(--xp-border)',
  borderRadius: 'var(--xp-r-sm)',
  cursor: 'pointer',
};

const iconBtn: React.CSSProperties = {
  fontFamily: 'var(--xp-font-mono)',
  fontSize: 13,
  width: 22,
  height: 22,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  background: 'transparent',
  color: 'var(--xp-muted)',
  border: '1px solid var(--xp-hairline)',
  borderRadius: 'var(--xp-r-sm)',
  cursor: 'pointer',
};
