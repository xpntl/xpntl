import { type ReactNode, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useIdleTimeout } from '../lib/idle-timeout';
import { useQuickCreate } from '../lib/quick-create-store';
import { Kbd } from '@xpntl/ui';
import { usePalette } from '../lib/palette-store';
import { useChord, useShortcut } from '../lib/shortcuts';
import { useSyncConnection, useSyncStore } from '../lib/sync-store';
import { useProjects } from '../lib/project-store';
import { useAuth } from '../lib/auth-store';
import { useTheme } from '../lib/theme';
import { IdleWarning } from './IdleWarning';
import { GlobalQuickCreate } from './GlobalQuickCreate';
import { ShortcutSheet } from './ShortcutSheet';
import { SyncIndicator } from './SyncIndicator';
import { NotificationBell } from './NotificationBell';
import { Sidebar } from './Sidebar';
import { UpgradeBanner } from './UpgradeBanner';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** Map the current route to a browser-tab title (so tabs aren't all "xpntl"). */
function routeTitle(pathname: string, search: string): string | null {
  const sp = new URLSearchParams(search);
  if (pathname === '/issues') {
    if (sp.get('assignee') === 'me' && sp.get('stateType') === 'triage') return 'Inbox';
    if (sp.get('assignee') === 'me') return 'My issues';
    return 'Issues';
  }
  const issue = pathname.match(/^\/issues\/([^/]+)/);
  if (issue) return decodeURIComponent(issue[1]!);
  const board = pathname.match(/^\/p\/([^/]+)\/board\/([^/]+)/);
  if (board) return decodeURIComponent(board[2]!);
  const proj = pathname.match(/^\/p\/([^/]+)\/(board|triage|docs|archived)/);
  if (proj) {
    const section = proj[2]![0]!.toUpperCase() + proj[2]!.slice(1);
    return `${decodeURIComponent(proj[1]!)} · ${section}`;
  }
  if (pathname.startsWith('/projects')) return 'Projects';
  if (pathname.startsWith('/insights')) return 'Insights';
  if (pathname.startsWith('/docs')) return 'Docs';
  if (pathname.startsWith('/feedback')) return 'Feedback';
  if (pathname.startsWith('/triage')) return 'Triage';
  if (pathname.startsWith('/agents')) return 'Agent activity';
  if (pathname.startsWith('/settings')) return 'Settings';
  if (pathname.startsWith('/admin')) return 'Admin';
  return null;
}

function XpntlLogo({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 16 16" fill="none"
      className="flex-none"
      role="img" aria-label="xpntl"
    >
      <title>xpntl</title>
      <rect width="16" height="16" rx="0.6" ry="0.6" fill="oklch(85% 0.18 90)" />
      <path
        d="M 3 12 L 13.3 11.2 L 13.3 3.2 C 10.7 9.8, 6.7 12, 3 12 Z"
        fill="oklch(65% 0.14 80)"
      />
      <line
        x1="3" y1="12" x2="13.3" y2="11.2"
        stroke="oklch(30% 0.06 60)" strokeWidth="1.2"
        strokeDasharray="0 1.5" strokeLinecap="round"
      />
      <path
        d="M 3 12 C 6.7 12, 10.7 9.8, 13.3 3.2"
        stroke="oklch(15% 0.04 60)" strokeWidth="1.5"
        strokeLinecap="square" fill="none"
      />
    </svg>
  );
}

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const navigate = useNavigate();
  const openQuickCreate = useQuickCreate((s) => s.setOpen);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('xp-sidebar-collapsed') === '1';
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Per-route browser-tab title (so tabs aren't all just "xpntl").
  const location = useLocation();
  useEffect(() => {
    const t = routeTitle(location.pathname, location.search);
    document.title = t ? `${t} · xpntl` : 'xpntl';
    return () => {
      document.title = 'xpntl';
    };
  }, [location.pathname, location.search]);

  // Real-time sync (XP-3): keep one live connection while signed in, and
  // refresh the project store when a project op arrives (sidebar stays live).
  useSyncConnection();
  const token = useAuth((s) => s.token);
  const projectRev = useSyncStore((s) => s.projectRev);
  useEffect(() => {
    if (projectRev > 0) void useProjects.getState().reload(token);
  }, [projectRev, token]);

  useEffect(() => {
    window.localStorage.setItem('xp-sidebar-collapsed', collapsed ? '1' : '0');
  }, [collapsed]);

  useEffect(() => useTheme.getState().hydrate(), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        setCollapsed((c) => !c);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [navigate]);

  const { showWarning, staySignedIn } = useIdleTimeout();

  useShortcut('shift+?', () => setSheetOpen(true), { ignoreInputs: true });

  useChord(
    'g',
    {
      i: () => navigate('/issues?assignee=me&stateType=triage'),
      m: () => navigate('/issues?assignee=me'),
      a: () => navigate('/issues?stateType=started'),
      b: () => navigate('/issues?stateType=backlog'),
      l: () => navigate('/issues'),
      p: () => navigate('/projects'),
      s: () => navigate('/settings/profile'),
    },
    { ignoreInputs: true },
  );

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-xp-canvas text-xp-ink">
      <UpgradeBanner />

      {/* Unified header — full width */}
      <header className="flex-none flex items-center h-[44px] px-[12px] border-b border-xp-hairline">
        {/* Mobile hamburger */}
        <button
          type="button"
          className="inline-flex items-center justify-center w-[28px] h-[28px] rounded-xp-sm border border-xp-border bg-xp-surface text-xp-ink cursor-pointer font-mono text-[12px] mr-[8px] md:hidden"
          onClick={() => setMobileOpen(true)}
          aria-label="Open sidebar"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2">
            <path d="M2 4h10M2 7h10M2 10h10" />
          </svg>
        </button>

        <Link to="/issues" className="flex items-center gap-[8px] no-underline">
          <XpntlLogo size={22} />
          <span className="font-mono font-bold text-[14px] tracking-[-0.02em] text-xp-ink">
            xpntl
          </span>
        </Link>

        {/* XP-76: fill the dead header space with a global search that opens
            the command palette (issues, projects, docs, actions). */}
        <div className="flex-1 flex justify-center px-[16px]">
          <button
            type="button"
            onClick={() => usePalette.getState().setOpen(true)}
            aria-label="Search"
            className="hidden sm:flex items-center gap-[8px] w-full max-w-[420px] h-[28px] px-[10px] rounded-xp-sm border border-xp-border bg-xp-surface text-xp-faint cursor-text font-mono text-[11.5px] hover:bg-xp-layer transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
              <circle cx="6" cy="6" r="4" />
              <path d="M9 9l3 3" strokeLinecap="round" />
            </svg>
            <span className="flex-1 text-left">Search issues or jump to…</span>
            <Kbd size="sm">{isMac ? '⌘K' : 'Ctrl K'}</Kbd>
          </button>
        </div>

        <div className="flex items-center gap-[6px]">
          <NotificationBell />
          <button
            type="button"
            onClick={() => openQuickCreate(true)}
            className="inline-flex items-center gap-[6px] h-[28px] px-[10px] rounded-xp-sm border border-xp-border bg-xp-surface text-xp-ink cursor-pointer font-mono text-[11.5px] font-medium hover:bg-xp-layer transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="square" aria-hidden>
              <path d="M6 2v8M2 6h8" />
            </svg>
            <span className="hidden sm:inline">New issue</span>
          </button>
        </div>
      </header>

      {/* Sidebar + content row */}
      <div className="flex flex-1 min-h-0">
        {/* Mobile sidebar overlay */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-40 bg-xp-overlay md:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* Sidebar — hidden on mobile unless drawer is open */}
        <div
          className={`
            fixed inset-y-0 left-0 z-50 md:relative md:z-0 md:flex md:flex-col
            transition-transform duration-[var(--xp-dur-base)] ease-[var(--xp-ease)]
            ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          `}
        >
          <Sidebar collapsed={collapsed} onToggleCollapse={() => setCollapsed((c) => !c)} />
        </div>

        <div className="flex-1 min-w-0 flex flex-col pr-[6px] pt-[4px] md:pl-0 pl-[6px]">
          <main className="flex-1 min-w-0 flex flex-col overflow-hidden bg-xp-surface rounded-[8px] shadow-xp-2 relative z-[1]">
            {children}
          </main>
          {/* Status bar — sits on the canvas under the content panel,
              bottom-right. The sidebar now reaches the viewport bottom on its
              own, so the workspace/user menu is flush. */}
          <StatusBar />
        </div>

        <ShortcutSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
        {showWarning && <IdleWarning onStay={staySignedIn} />}
        <SyncIndicator />
        <GlobalQuickCreate />
      </div>
    </div>
  );
}

// Rolling build identity, injected at build time by the deploy workflow:
//   VITE_APP_BUILD = GitHub Actions run number (monotonic build number)
//   VITE_APP_SHA   = commit SHA shipped
// Local dev builds have neither → shown as "dev".
const APP_BUILD = import.meta.env.VITE_APP_BUILD as string | undefined;
const APP_SHA = (import.meta.env.VITE_APP_SHA as string | undefined)?.slice(0, 7);
const VERSION_LABEL = APP_BUILD ? `v0.1·#${APP_BUILD}` : 'v0.1·dev';

function StatusBar() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  return (
    <div className="h-[22px] flex-none flex items-center justify-end gap-[8px] pr-[10px] font-mono text-[10px] text-xp-faint select-none">
      <span className="inline-flex items-center gap-[5px]" title={online ? 'Connected' : 'Offline'}>
        <span
          className="inline-block w-[6px] h-[6px] rounded-full"
          style={{ background: online ? 'var(--xp-success)' : 'var(--xp-danger, oklch(60% 0.2 25))' }}
        />
        {online ? 'Connected' : 'Offline'}
      </span>
      <span className="text-xp-hairline">·</span>
      <span title={APP_SHA ? `commit ${APP_SHA}` : 'local dev build'}>xpntl {VERSION_LABEL}</span>
      <span className="text-xp-hairline">·</span>
      <span className="tracking-[0.1em]">ALPHA</span>
    </div>
  );
}
