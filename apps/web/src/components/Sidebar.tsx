import { Avatar, IssueKey, Kbd } from '@xpntl/ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { User, WorkspaceMembership } from '../lib/api';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-store';
import { usePalette } from '../lib/palette-store';
import { useProjects } from '../lib/project-store';
import { listRecentIssues, syncRecentIssues } from '../lib/recent-issues';
import { ThemeToggle } from './ThemeToggle';

type NavId = 'inbox' | 'my';
interface NavSpec {
  id: NavId;
  label: string;
  countKey: string;
  href: string;
}

const NAV: NavSpec[] = [
  // XP-105: Inbox is now the notifications homepage. The count is the unread
  // notification count, fetched alongside issue counts below.
  { id: 'inbox', label: 'Inbox', countKey: 'inbox', href: '/inbox' },
  { id: 'my', label: 'My issues', countKey: 'my', href: '/issues?assignee=me' },
];

const PROJECT_STATUS_COLORS: Record<string, string> = {
  planned: 'var(--xp-muted)',
  started: 'var(--xp-accent)',
  paused: 'oklch(65% 0.16 60)',
  completed: 'var(--xp-success)',
  canceled: 'var(--xp-faint)',
};

interface SidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function Sidebar({ collapsed = false, onToggleCollapse }: SidebarProps) {
  const { workspace, user, token, memberships, setSession, clearAll } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [search] = useSearchParams();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [wsMenuOpen, setWsMenuOpen] = useState(false);
  const workspaceOptions = useMemo<WorkspaceMembership[]>(
    () =>
      memberships.length > 0
        ? memberships
        : workspace && user
          ? [{ workspace, user, isCurrent: true, isDefault: false }]
          : [],
    [memberships, workspace, user],
  );

  useEffect(() => {
    if (!token) return;
    // Issue counts + unread notification count for the Inbox link (XP-105).
    Promise.all([
      api.issueCounts(token).catch(() => ({}) as Record<string, number>),
      api.getUnreadCount(token).catch(() => ({ count: 0 })),
    ]).then(([issueC, unread]) => {
      setCounts({ ...issueC, inbox: unread.count });
    });
  }, [token]);

  const activeNavId = useMemo<NavId | null>(() => {
    if (location.pathname.startsWith('/inbox')) return 'inbox';
    if (!location.pathname.startsWith('/issues')) return null;
    const assignee = search.get('assignee');
    if (assignee === 'me' && !search.get('stateType')) return 'my';
    return null;
  }, [location.pathname, search]);

  const width = collapsed ? 56 : 240;

  return (
    <aside
      className="flex-1 min-h-0 flex flex-col font-mono text-[12.5px] text-xp-ink overflow-hidden transition-[width] duration-[var(--xp-dur-base)] ease-[var(--xp-ease)]"
      style={{ width }}
    >
      {/* Search trigger */}
      <SearchButton collapsed={collapsed} />

      {/* Primary nav */}
      <nav className="px-[6px] pt-[8px] pb-[4px]">
        {NAV.map((it) => {
          const selected = it.id === activeNavId;
          return (
            <Link
              key={it.id}
              to={it.href}
              title={collapsed ? it.label : undefined}
              className={`
                flex items-center gap-[10px] h-[var(--xp-nav-row-h,30px)]
                relative cursor-pointer rounded-xp-sm no-underline text-xp-ink
                hover:bg-xp-layer
                ${collapsed ? 'justify-center px-0' : 'justify-start px-[10px]'}
                ${selected ? 'bg-xp-layer' : 'bg-transparent'}
              `}
            >
              {selected && (
                <span
                  aria-hidden
                  className="absolute left-0 top-[4px] bottom-[4px] w-[2px] bg-xp-accent-strong"
                />
              )}
              <span
                className={`w-[14px] inline-flex items-center justify-center text-[12px] ${selected ? 'text-xp-accent-strong' : 'text-xp-muted'}`}
                aria-hidden
              >
                {iconFor(it.id)}
              </span>
              {!collapsed && (
                <>
                  <span className={`flex-1 ${selected ? 'font-semibold' : 'font-medium'}`}>
                    {it.label}
                  </span>
                  <span className="font-mono text-[9.5px] tracking-[var(--xp-track-caps)] text-xp-faint min-w-[10px] text-right">
                    {counts[it.countKey] ?? ''}
                  </span>
                </>
              )}
            </Link>
          );
        })}
        <InsightsNavLink collapsed={collapsed} />
        <FeedbackNavLink collapsed={collapsed} />
      </nav>

      {!collapsed && workspace && <ProjectsSection />}
      {collapsed && workspace && <CollapsedProjectsRail />}
      {!collapsed && <RecentSection />}

      <div className="flex-1" />

      {/* Collapse / expand toggle (XP-92) — discoverable, not just Ctrl+\ */}
      {onToggleCollapse && (
        <button
          type="button"
          onClick={onToggleCollapse}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={`flex items-center gap-[8px] h-[28px] mx-[6px] mb-[4px] rounded-xp-sm text-xp-muted bg-transparent border-0 cursor-pointer hover:bg-xp-layer hover:text-xp-ink ${collapsed ? 'justify-center px-0' : 'justify-start px-[10px]'}`}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            aria-hidden="true"
            style={{
              transform: collapsed ? 'rotate(180deg)' : 'none',
              transition: 'transform 120ms',
            }}
          >
            <path d="M7.5 2.5 L4 6 L7.5 9.5" />
          </svg>
          {!collapsed && <span className="text-[11px]">Collapse</span>}
        </button>
      )}

      {/* Workspace / settings — bottom */}
      <div className="relative border-t border-xp-hairline">
        <button
          type="button"
          onClick={() => setWsMenuOpen((o) => !o)}
          className={`
            w-full h-[44px] flex items-center gap-[10px]
            bg-transparent border-0
            cursor-pointer font-mono text-[12.5px] text-xp-ink text-left
            hover:bg-xp-layer
            ${collapsed ? 'justify-center px-0' : 'justify-start px-[12px]'}
          `}
        >
          {workspace?.avatarUrl ? (
            <Avatar name={workspace.name} src={workspace.avatarUrl} size={24} />
          ) : (
            <div className="w-[24px] h-[24px] rounded-xp-sm bg-xp-ink text-xp-canvas flex items-center justify-center font-bold text-[13px] leading-none flex-none">
              {(workspace?.key?.[0] ?? 'x').toUpperCase()}
            </div>
          )}
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0">
                <div className="font-semibold overflow-hidden text-ellipsis whitespace-nowrap text-[11.5px]">
                  {workspace?.name ?? 'xpntl'}
                </div>
                <div className="xp-meta mt-px overflow-hidden text-ellipsis whitespace-nowrap">
                  {user?.displayName ?? user?.email ?? ''}
                </div>
              </div>
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                aria-hidden="true"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
                className="text-xp-muted flex-none"
              >
                <path d="M2.5 6 L5 3.5 L7.5 6" />
              </svg>
            </>
          )}
        </button>
        {wsMenuOpen && !collapsed && (
          <WorkspaceMenu
            user={user}
            onClose={() => setWsMenuOpen(false)}
            onSettings={() => {
              setWsMenuOpen(false);
              navigate('/settings/profile');
            }}
            onAdmin={() => {
              setWsMenuOpen(false);
              navigate('/admin');
            }}
            onLogout={() => {
              void api.logout(token).catch(() => undefined);
              clearAll();
              navigate('/signin');
            }}
            onSwitchWorkspace={(workspaceId) => {
              void api.switchWorkspace({ workspaceId }, token).then((result) => {
                setSession(result);
                setWsMenuOpen(false);
                navigate('/');
              });
            }}
            memberships={workspaceOptions}
            onCreateWorkspace={() => {
              setWsMenuOpen(false);
              navigate('/settings/workspaces');
            }}
            onAddWorkspace={() => {
              setWsMenuOpen(false);
              navigate('/settings/workspaces');
            }}
          />
        )}
      </div>
    </aside>
  );
}

function FeedbackNavLink({ collapsed }: { collapsed: boolean }) {
  const location = useLocation();
  const selected = location.pathname === '/feedback';
  return (
    <Link
      to="/feedback"
      title={collapsed ? 'Feedback' : undefined}
      className={`
        flex items-center gap-[10px] h-[var(--xp-nav-row-h,30px)]
        relative cursor-pointer rounded-xp-sm no-underline text-xp-ink
        hover:bg-xp-layer
        ${collapsed ? 'justify-center px-0' : 'justify-start px-[10px]'}
        ${selected ? 'bg-xp-layer' : 'bg-transparent'}
      `}
    >
      {selected && (
        <span
          aria-hidden
          className="absolute left-0 top-[4px] bottom-[4px] w-[2px] bg-xp-accent-strong"
        />
      )}
      <span
        className={`w-[14px] inline-flex items-center justify-center ${selected ? 'text-xp-accent-strong' : 'text-xp-muted'}`}
        aria-hidden
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="square"
          strokeLinejoin="miter"
          role="img"
          aria-label="Feedback"
        >
          <title>Feedback</title>
          <path d="M2.5 3.5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H5.5L2.5 11V8.5V3.5z" />
          <path d="M5 6h4M5 7.5h2.5" />
        </svg>
      </span>
      {!collapsed && (
        <span className={`flex-1 ${selected ? 'font-semibold' : 'font-medium'}`}>Feedback</span>
      )}
    </Link>
  );
}

function InsightsNavLink({ collapsed }: { collapsed: boolean }) {
  const location = useLocation();
  const selected = location.pathname === '/insights';
  return (
    <Link
      to="/insights"
      title={collapsed ? 'Insights' : undefined}
      className={`
        flex items-center gap-[10px] h-[var(--xp-nav-row-h,30px)]
        relative cursor-pointer rounded-xp-sm no-underline text-xp-ink
        hover:bg-xp-layer
        ${collapsed ? 'justify-center px-0' : 'justify-start px-[10px]'}
        ${selected ? 'bg-xp-layer' : 'bg-transparent'}
      `}
    >
      {selected && (
        <span
          aria-hidden
          className="absolute left-0 top-[4px] bottom-[4px] w-[2px] bg-xp-accent-strong"
        />
      )}
      <span
        className={`w-[14px] inline-flex items-center justify-center ${selected ? 'text-xp-accent-strong' : 'text-xp-muted'}`}
        aria-hidden
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="square"
          strokeLinejoin="miter"
          role="img"
          aria-label="Insights"
        >
          <title>Insights</title>
          <path d="M2 12V2" />
          <path d="M2 12h10" />
          <rect x="4" y="7" width="2" height="3" />
          <rect x="7.5" y="5" width="2" height="5" />
          <rect x="11" y="3.5" width="0" height="0" />
          <path d="M4 6 L7 4 L10 5.5" />
        </svg>
      </span>
      {!collapsed && (
        <span className={`flex-1 ${selected ? 'font-semibold' : 'font-medium'}`}>Insights</span>
      )}
    </Link>
  );
}

function iconFor(id: NavId) {
  const p = {
    width: 14,
    height: 14,
    viewBox: '0 0 14 14',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.2,
    strokeLinecap: 'square' as const,
    strokeLinejoin: 'miter' as const,
  };
  if (id === 'inbox')
    return (
      <svg {...p} role="img" aria-label="Inbox">
        <title>Inbox</title>
        <path d="M2 8.5V11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V8.5" />
        <path d="M2 8.5 3.4 3.5A1 1 0 0 1 4.4 2.8h5.2a1 1 0 0 1 1 .7L12 8.5" />
        <path d="M2 8.5h3l.7 1.4h2.6L9 8.5h3" />
      </svg>
    );
  if (id === 'my')
    return (
      <svg {...p} role="img" aria-label="My issues">
        <title>My issues</title>
        <circle cx="7" cy="5" r="2.2" />
        <path d="M2.8 12c0-2.2 1.9-3.4 4.2-3.4S11.2 9.8 11.2 12" />
      </svg>
    );
  return (
    <svg {...p} role="img" aria-label="Issues">
      <title>Issues</title>
      <rect x="2.5" y="2.5" width="9" height="9" />
    </svg>
  );
}

// XP-86: projects are expanded by default; a per-project collapse preference is
// persisted per device. The active project is always shown expanded.
const COLLAPSE_KEY = 'xp-sidebar-collapsed-projects';
function loadCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY);
    return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set<string>();
  }
}
function saveCollapsed(s: Set<string>) {
  try {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...s]));
  } catch {
    /* ignore quota / private-mode errors */
  }
}

function ProjectsSection() {
  const projects = useProjects((s) => s.all);
  const location = useLocation();
  const { projectKey: activeKey } = useParams<{ projectKey?: string }>();
  const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsed);

  const toggle = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      saveCollapsed(next);
      return next;
    });
  };

  return (
    <div className="px-[6px] pt-[8px] pb-[4px]">
      <div className="flex items-center gap-[8px] px-[10px] pb-[6px]">
        <Link to="/projects" className="no-underline">
          <span className="xp-meta cursor-pointer">PROJECTS</span>
        </Link>
        <span className="flex-1 h-px bg-xp-hairline" />
        <Link to="/projects" className="no-underline text-xp-muted text-[14px] leading-none">
          +
        </Link>
      </div>
      {projects.map((p) => {
        const isActive = activeKey === p.key;
        const isOpen = isActive || !collapsed.has(p.key);
        return (
          <div key={p.id}>
            <div
              className={`flex items-center rounded-xp-sm hover:bg-xp-layer ${isActive ? 'bg-xp-layer' : ''}`}
            >
              <button
                type="button"
                onClick={() => toggle(p.key)}
                aria-label={isOpen ? `Collapse ${p.name}` : `Expand ${p.name}`}
                aria-expanded={isOpen}
                className="w-[16px] h-[var(--xp-nav-row-h,30px)] flex items-center justify-center flex-none text-xp-faint hover:text-xp-ink bg-transparent border-0 cursor-pointer"
              >
                <svg
                  width="8"
                  height="8"
                  viewBox="0 0 8 8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  className="transition-transform duration-[var(--xp-dur-base)]"
                  style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
                  aria-hidden="true"
                >
                  <path d="M2.5 1.5 L5.5 4 L2.5 6.5" />
                </svg>
              </button>
              <Link
                to={`/p/${p.key}/board`}
                className={`flex-1 min-w-0 flex items-center gap-[6px] pr-[10px] h-[var(--xp-nav-row-h,30px)] text-[11.5px] text-xp-ink no-underline cursor-pointer ${isActive ? 'font-semibold' : ''}`}
                title={`${p.name} (${p.key})`}
              >
                <span
                  className="inline-block w-[6px] h-[6px] rounded-full flex-none"
                  style={{ background: PROJECT_STATUS_COLORS[p.status] ?? 'var(--xp-muted)' }}
                />
                <span className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                  {p.name}
                </span>
                <span className="text-[9px] text-xp-faint tracking-[0.06em] flex-none font-mono">
                  {p.key}
                </span>
              </Link>
            </div>
            {isOpen && (
              <div className="ml-[16px] border-l border-xp-hairline">
                <ProjectSubNavLink
                  to={`/p/${p.key}/board`}
                  label="Board"
                  current={location.pathname}
                />
                <ProjectSubNavLink
                  to={`/p/${p.key}/triage`}
                  label="Triage"
                  current={location.pathname}
                />
                <ProjectSubNavLink
                  to={`/p/${p.key}/docs`}
                  label="Docs"
                  current={location.pathname}
                />
                <ProjectSubNavLink
                  to={`/p/${p.key}/updates`}
                  label="Updates"
                  current={location.pathname}
                />
                <ProjectSubNavLink
                  to={`/p/${p.key}/archived`}
                  label="Archived"
                  current={location.pathname}
                />
                <ProjectSubNavLink
                  to={`/p/${p.key}/settings`}
                  label="Settings"
                  current={location.pathname}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// XP-92: when the sidebar is collapsed, projects still appear as an icon rail —
// key initials + status dot, full name on hover, click → board.
function CollapsedProjectsRail() {
  const projects = useProjects((s) => s.all);
  const { projectKey: activeKey } = useParams<{ projectKey?: string }>();
  if (projects.length === 0) return null;
  return (
    <div className="px-[6px] pt-[8px] flex flex-col items-center gap-[2px]">
      {projects.map((p) => {
        const active = activeKey === p.key;
        return (
          <Link
            key={p.id}
            to={`/p/${p.key}/board`}
            title={`${p.name} (${p.key})`}
            className={`flex items-center justify-center h-[30px] w-full rounded-xp-sm no-underline hover:bg-xp-layer ${active ? 'bg-xp-layer' : ''}`}
          >
            <span
              className="relative inline-flex items-center justify-center w-[22px] h-[22px] rounded-xp-sm text-[9.5px] font-bold text-xp-ink"
              style={{ background: 'var(--xp-layer)' }}
            >
              {p.key.slice(0, 2).toUpperCase()}
              <span
                className="absolute -top-[1px] -right-[1px] w-[6px] h-[6px] rounded-full"
                style={{
                  background: PROJECT_STATUS_COLORS[p.status] ?? 'var(--xp-muted)',
                  boxShadow: '0 0 0 1.5px var(--xp-canvas)',
                }}
              />
            </span>
          </Link>
        );
      })}
    </div>
  );
}

function ProjectSubNavLink({ to, label, current }: { to: string; label: string; current: string }) {
  const selected = current === to;
  return (
    <Link
      to={to}
      className={`flex items-center pl-[12px] pr-[10px] h-[26px] text-[11px] no-underline rounded-xp-sm hover:bg-xp-layer ${selected ? 'text-xp-accent-strong font-semibold' : 'text-xp-muted'}`}
    >
      {label}
    </Link>
  );
}

function RecentSection() {
  const { token } = useAuth();
  const [recents, setRecents] = useState<Array<{ issueKey: string; issueTitle: string }>>([]);

  useEffect(() => {
    if (!token) return;
    api
      .listRecentIssues(token, 5)
      .then((r) => {
        setRecents(r.recentIssues);
        syncRecentIssues(r.recentIssues.map((i) => ({ key: i.issueKey, title: i.issueTitle })));
      })
      .catch(() => {
        const local = listRecentIssues().slice(0, 5);
        setRecents(local.map((l) => ({ issueKey: l.key, issueTitle: l.title })));
      });
  }, [token]);

  if (recents.length === 0) return null;

  return (
    <div className="px-[6px] pt-[8px] pb-[4px]">
      <div className="flex items-center gap-[8px] px-[10px] pb-[6px]">
        <span className="xp-meta">RECENT</span>
        <span className="flex-1 h-px bg-xp-hairline" />
      </div>
      {recents.map((r) => (
        <Link
          key={r.issueKey}
          to={`/issues/${encodeURIComponent(r.issueKey)}`}
          className="flex items-center px-[12px] h-[var(--xp-nav-row-h,30px)] text-[11.5px] text-xp-ink no-underline overflow-hidden text-ellipsis whitespace-nowrap rounded-xp-sm hover:bg-xp-layer"
        >
          <IssueKey size="sm">{r.issueKey}</IssueKey>
          <span className="ml-[6px] text-xp-muted">{r.issueTitle}</span>
        </Link>
      ))}
    </div>
  );
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

function SearchButton({ collapsed }: { collapsed: boolean }) {
  const openPalette = usePalette((s) => s.setOpen);

  return (
    <div className="px-[6px] pt-[8px] pb-[2px]">
      <button
        type="button"
        onClick={() => openPalette(true)}
        className={`
          flex items-center gap-[10px] w-full h-[var(--xp-nav-row-h,30px)]
          border border-xp-border rounded-xp-sm bg-xp-surface
          cursor-pointer font-mono text-[12px] text-xp-muted
          hover:border-xp-input hover:text-xp-ink
          transition-colors duration-[var(--xp-dur-base)] ease-[var(--xp-ease)]
          ${collapsed ? 'justify-center px-0' : 'px-[10px]'}
        `}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="square"
          strokeLinejoin="miter"
          className="flex-none"
          aria-hidden="true"
        >
          <circle cx="6" cy="6" r="3.8" />
          <path d="M9 9l2.5 2.5" />
        </svg>
        {!collapsed && (
          <>
            <span className="flex-1 text-left">Search</span>
            <Kbd size="sm">{isMac ? '⌘K' : 'Ctrl+K'}</Kbd>
          </>
        )}
      </button>
    </div>
  );
}

function WorkspaceMenu({
  user,
  onClose,
  onSettings,
  onAdmin,
  onLogout,
  onSwitchWorkspace,
  onCreateWorkspace,
  onAddWorkspace,
  memberships,
}: {
  user: User | null;
  onClose: () => void;
  onSettings: () => void;
  onAdmin: () => void;
  onLogout: () => void;
  onSwitchWorkspace: (workspaceId: string) => void;
  onCreateWorkspace: () => void;
  onAddWorkspace: () => void;
  memberships: WorkspaceMembership[];
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickAway(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        e.preventDefault();
      }
    }
    document.addEventListener('mousedown', handleClickAway);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickAway);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const itemCls =
    'flex items-center gap-[10px] w-full py-[6px] px-[12px] bg-transparent border-0 font-mono text-[12px] text-xp-ink cursor-pointer text-left rounded-xp-sm hover:bg-xp-layer';

  return (
    <div
      ref={menuRef}
      className="absolute bottom-[48px] left-[6px] right-[6px] z-[100] bg-xp-surface border border-xp-border rounded-xp-lg shadow-xp-2 py-[4px] font-mono"
    >
      {user && (
        <div className="py-[8px] px-[12px] flex items-center gap-[10px]">
          <Avatar
            name={user.displayName ?? user.email}
            src={user.avatarUrl ?? undefined}
            size={24}
          />
          <div className="flex-1 min-w-0">
            <div className="text-[11.5px] font-semibold overflow-hidden text-ellipsis whitespace-nowrap">
              {user.displayName ?? user.email}
            </div>
            <div className="xp-meta mt-px overflow-hidden text-ellipsis whitespace-nowrap">
              {user.email}
            </div>
          </div>
        </div>
      )}

      <div className="h-px bg-xp-hairline my-[4px]" />

      {memberships.length > 0 && (
        <>
          <div className="xp-meta px-[12px] pt-[6px] pb-[4px]">WORKSPACES</div>
          <div className="flex flex-col gap-[2px] px-[6px] pb-[4px]">
            {memberships.map((membership) => {
              const active = membership.isCurrent;
              return (
                <button
                  key={membership.workspace.id}
                  type="button"
                  onClick={() => onSwitchWorkspace(membership.workspace.id)}
                  className={`${itemCls} py-[8px] px-[10px] ${active ? 'bg-xp-layer' : ''}`}
                >
                  {membership.workspace.avatarUrl ? (
                    <Avatar
                      name={membership.workspace.name}
                      src={membership.workspace.avatarUrl}
                      size={22}
                    />
                  ) : (
                    <div className="w-[22px] h-[22px] rounded-xp-sm bg-xp-layer inline-flex items-center justify-center text-[11px] font-bold flex-none">
                      {(membership.workspace.key?.[0] ?? 'X').toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div
                      className={`overflow-hidden text-ellipsis whitespace-nowrap ${active ? 'font-semibold' : 'font-medium'}`}
                    >
                      {membership.workspace.name}
                    </div>
                    <div className="xp-meta mt-px overflow-hidden text-ellipsis whitespace-nowrap">
                      {(membership.user.displayName ?? membership.user.email).slice(0, 40)}
                    </div>
                  </div>
                  {active && <span className="text-xp-accent-strong font-bold text-[12px]">✓</span>}
                </button>
              );
            })}
          </div>
          <div className="h-px bg-xp-hairline my-[4px]" />
        </>
      )}

      <button type="button" className={itemCls} onClick={onSettings}>
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="square"
          strokeLinejoin="miter"
          className="flex-none"
        >
          <circle cx="7" cy="7" r="2" />
          <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.8 2.8l1 1M10.2 10.2l1 1M11.2 2.8l-1 1M3.8 10.2l-1 1" />
        </svg>
        <span>Settings</span>
        <span className="ml-auto text-xp-faint text-[10px]">G then S</span>
      </button>

      <button type="button" className={itemCls} onClick={onAddWorkspace}>
        <span className="w-[14px] text-center flex-none">+</span>
        <span>Add existing workspace</span>
      </button>

      <button type="button" className={itemCls} onClick={onCreateWorkspace}>
        <span className="w-[14px] text-center flex-none">⊕</span>
        <span>Create workspace</span>
      </button>

      {user?.isSuperAdmin && (
        <button type="button" className={itemCls} onClick={onAdmin}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="square"
            strokeLinejoin="miter"
            className="flex-none"
          >
            <rect x="2" y="6" width="10" height="6" rx="1" />
            <path d="M4 6V4a3 3 0 0 1 6 0v2" />
          </svg>
          <span>Admin</span>
        </button>
      )}

      <div className="h-px bg-xp-hairline my-[4px]" />

      <div className="py-[6px] px-[12px] flex items-center gap-[10px]">
        <ThemeToggle compact={false} />
      </div>

      <div className="h-px bg-xp-hairline my-[4px]" />

      <button type="button" className={`${itemCls} text-xp-muted`} onClick={onLogout}>
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="square"
          strokeLinejoin="miter"
          className="flex-none"
        >
          <path d="M5 2H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2" />
          <path d="M9 10l3-3-3-3" />
          <path d="M12 7H5" />
        </svg>
        <span>Log out</span>
      </button>
    </div>
  );
}
