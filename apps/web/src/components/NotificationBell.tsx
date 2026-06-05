import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { type Notification, api } from '../lib/api';
import { useAuth } from '../lib/auth-store';
import { formatRelative } from '../lib/format';

const POLL_INTERVAL = 30_000;

const TYPE_ICONS: Record<string, string> = {
  mention: '@',
  assigned: '=',
  state_change: '~',
  comment: '#',
  due_soon: '!',
};

export function NotificationBell() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);

  // Poll unread count
  useEffect(() => {
    if (!token) return;
    let active = true;

    const poll = () => {
      api.getUnreadCount(token).then((r) => {
        if (active) setCount(r.count);
      }).catch(() => {});
    };

    poll();
    const id = setInterval(poll, POLL_INTERVAL);
    return () => { active = false; clearInterval(id); };
  }, [token]);

  // Load notifications when panel opens
  useEffect(() => {
    if (!open || !token) return;
    setLoading(true);
    api.listNotifications({ limit: 30 }, token)
      .then((r) => setItems(r.notifications))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, token]);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        bellRef.current && !bellRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); e.preventDefault(); }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [open]);

  const handleMarkAllRead = useCallback(() => {
    if (!token) return;
    api.markAllNotificationsRead(token).then(() => {
      setCount(0);
      setItems((prev) => prev.map((n) => ({ ...n, readAt: new Date().toISOString() })));
    }).catch(() => {});
  }, [token]);

  const handleClick = useCallback((n: Notification) => {
    if (!token) return;
    // Mark read
    if (!n.readAt) {
      api.markNotificationRead(n.id, token).then(() => {
        setCount((c) => Math.max(0, c - 1));
        setItems((prev) => prev.map((item) =>
          item.id === n.id ? { ...item, readAt: new Date().toISOString() } : item,
        ));
      }).catch(() => {});
    }
    // Navigate to issue
    if (n.issueKey) {
      setOpen(false);
      navigate(`/issues/${encodeURIComponent(n.issueKey)}`);
    }
  }, [token, navigate]);

  // Group notifications by date
  const grouped = groupByDate(items);

  return (
    <div className="relative">
      <button
        ref={bellRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative inline-flex items-center justify-center w-[30px] h-[30px] rounded-xp-sm bg-transparent border-0 cursor-pointer text-xp-muted hover:text-xp-ink hover:bg-xp-layer transition-colors"
        aria-label={`Notifications${count > 0 ? ` (${count} unread)` : ''}`}
        title="Notifications"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="square" strokeLinejoin="miter">
          <title>Notifications</title>
          <path d="M4 6a4 4 0 0 1 8 0c0 3 1.5 4.5 2 5H2c.5-.5 2-2 2-5z" />
          <path d="M6 11v.5a2 2 0 0 0 4 0V11" />
        </svg>
        {count > 0 && (
          <span
            className="absolute -top-[2px] -right-[2px] min-w-[16px] h-[16px] flex items-center justify-center rounded-full text-[9px] font-bold leading-none px-[3px]"
            style={{
              background: 'var(--xp-accent-strong)',
              color: 'var(--xp-on-accent)',
            }}
          >
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-[38px] z-[200] w-[380px] max-h-[520px] overflow-y-auto bg-xp-surface border border-xp-border rounded-xp-lg shadow-xp-2 font-mono"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-[14px] py-[10px] border-b border-xp-hairline">
            <span className="text-[13px] font-semibold text-xp-ink">Notifications</span>
            {count > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="bg-transparent border-0 font-mono text-[11px] cursor-pointer text-xp-muted hover:text-xp-ink"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Body */}
          {loading && items.length === 0 && (
            <div className="px-[14px] py-[24px] text-center text-xp-muted text-[11.5px]">
              Loading...
            </div>
          )}

          {!loading && items.length === 0 && (
            <div className="px-[14px] py-[32px] text-center text-xp-muted text-[11.5px]">
              No notifications yet
            </div>
          )}

          {grouped.map(([label, group]) => (
            <div key={label}>
              <div className="px-[14px] pt-[10px] pb-[4px]">
                <span className="xp-meta">{label}</span>
              </div>
              {group.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleClick(n)}
                  className={`
                    w-full text-left flex items-start gap-[10px] px-[14px] py-[8px]
                    bg-transparent border-0 font-mono cursor-pointer
                    hover:bg-xp-layer transition-colors
                    ${!n.readAt ? 'bg-xp-layer' : ''}
                  `}
                >
                  {/* Unread dot */}
                  <div className="flex-none w-[6px] pt-[6px]">
                    {!n.readAt && (
                      <span
                        className="block w-[6px] h-[6px] rounded-full"
                        style={{ background: 'var(--xp-accent-strong)' }}
                      />
                    )}
                  </div>

                  {/* Type icon */}
                  <span className="flex-none w-[20px] h-[20px] rounded-xp-sm bg-xp-layer flex items-center justify-center text-[11px] text-xp-muted font-bold">
                    {TYPE_ICONS[n.type] ?? '?'}
                  </span>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className={`text-[11.5px] leading-[1.4] ${!n.readAt ? 'text-xp-ink font-medium' : 'text-xp-muted'}`}>
                      {n.title}
                    </div>
                    {n.body && (
                      <div className="text-[10.5px] text-xp-faint mt-[2px] overflow-hidden text-ellipsis whitespace-nowrap">
                        {n.body}
                      </div>
                    )}
                  </div>

                  {/* Time */}
                  <span className="flex-none text-[10px] text-xp-faint pt-[2px] whitespace-nowrap">
                    {formatRelative(n.createdAt)}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function groupByDate(items: Notification[]): [string, Notification[]][] {
  const groups = new Map<string, Notification[]>();
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  for (const item of items) {
    const d = new Date(item.createdAt);
    let label: string;
    if (isSameDay(d, today)) {
      label = 'TODAY';
    } else if (isSameDay(d, yesterday)) {
      label = 'YESTERDAY';
    } else {
      label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
    }

    const list = groups.get(label) ?? [];
    list.push(item);
    groups.set(label, list);
  }

  return [...groups.entries()];
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}
