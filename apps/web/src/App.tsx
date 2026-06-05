import { type ComponentType, type ReactNode, Suspense, lazy, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Spinner } from '@xpntl/ui';
import { CommandPalette } from './components/CommandPalette';
import { ConfirmDialogProvider } from './components/ConfirmDialogProvider';
import { ToastContainer } from './components/ToastContainer';
import { type User, type Workspace, FetchError, api } from './lib/api';
import { commercialRoutes } from './lib/commercial';
import { useAuth } from './lib/auth-store';
import { useFavorites } from './lib/favorite-store';
import { useLabels } from './lib/label-store';
import { useProjects } from './lib/project-store';
import { useUsers } from './lib/user-store';
import { useViews } from './lib/view-store';
// Route pages are code-split (React.lazy) so the initial bundle stays small;
// each page chunk loads on first navigation, behind the Suspense fallback below.
const lazyPage = <K extends string>(
  loader: () => Promise<Record<K, ComponentType>>,
  name: K,
) => lazy(() => loader().then((m) => ({ default: m[name] })));

const DevicePage = lazyPage(() => import('./pages/Device'), 'DevicePage');
const IssueDetailPage = lazyPage(() => import('./pages/IssueDetail'), 'IssueDetailPage');
const IssuesPage = lazyPage(() => import('./pages/Issues'), 'IssuesPage');
const SettingsProfilePage = lazyPage(() => import('./pages/SettingsProfile'), 'SettingsProfilePage');
const SettingsSecurityPage = lazyPage(() => import('./pages/SettingsSecurity'), 'SettingsSecurityPage');
const SettingsWorkspacePage = lazyPage(() => import('./pages/SettingsWorkspace'), 'SettingsWorkspacePage');
const SettingsApiKeysPage = lazyPage(() => import('./pages/SettingsApiKeys'), 'SettingsApiKeysPage');
const SettingsAuditPage = lazyPage(() => import('./pages/SettingsAudit'), 'SettingsAuditPage');
const SettingsAutomationsPage = lazyPage(() => import('./pages/SettingsAutomations'), 'SettingsAutomationsPage');
const SettingsLabelsPage = lazyPage(() => import('./pages/SettingsLabels'), 'SettingsLabelsPage');
const SettingsTeamPage = lazyPage(() => import('./pages/SettingsTeam'), 'SettingsTeamPage');
const SettingsWebhooksPage = lazyPage(() => import('./pages/SettingsWebhooks'), 'SettingsWebhooksPage');
const SettingsNotificationsPage = lazyPage(() => import('./pages/SettingsNotifications'), 'SettingsNotificationsPage');
const SettingsGitHubPage = lazyPage(() => import('./pages/SettingsGitHub'), 'SettingsGitHubPage');
const SettingsImportPage = lazyPage(() => import('./pages/SettingsImport'), 'SettingsImportPage');
const SettingsSessionsPage = lazyPage(() => import('./pages/SettingsSessions'), 'SettingsSessionsPage');
const OnboardingPage = lazyPage(() => import('./pages/Onboarding'), 'OnboardingPage');
const OnboardingPlanPage = lazyPage(() => import('./pages/OnboardingPlan'), 'OnboardingPlanPage');
const SignInPage = lazyPage(() => import('./pages/SignIn'), 'SignInPage');
const ProjectsPage = lazyPage(() => import('./pages/Projects'), 'ProjectsPage');
const ArchivedIssuesPage = lazyPage(() => import('./pages/ArchivedIssues'), 'ArchivedIssuesPage');
const ProjectSettingsPage = lazyPage(() => import('./pages/ProjectSettings'), 'ProjectSettingsPage');
const ProjectUpdatesPage = lazyPage(() => import('./pages/ProjectUpdates'), 'ProjectUpdatesPage');
const TriagePage = lazyPage(() => import('./pages/Triage'), 'TriagePage');
const AgentActivityPage = lazyPage(() => import('./pages/AgentActivity'), 'AgentActivityPage');
const InsightsPage = lazyPage(() => import('./pages/Insights'), 'InsightsPage');
const InboxPage = lazyPage(() => import('./pages/Inbox'), 'InboxPage');
const DocsPage = lazyPage(() => import('./pages/Docs'), 'DocsPage');
const SignUpPage = lazyPage(() => import('./pages/SignUp'), 'SignUpPage');
const InviteAcceptPage = lazyPage(() => import('./pages/InviteAccept'), 'InviteAcceptPage');

export function App() {
  return (
    <BrowserRouter>
      <SessionLoader>
        <Suspense
          fallback={
            <div style={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
              <Spinner size={20} />
            </div>
          }
        >
        <Routes>
          <Route path="/" element={<RequireAuth><LandingRedirect /></RequireAuth>} />
          <Route path="/signup" element={<SignUpPage />} />
          <Route path="/signin" element={<SignInPage />} />
          {/* Not wrapped in RequireAuth: the page handles its own auth state so
              the partial-session onboarding redirect can't hijack the invite. */}
          <Route path="/invites/accept" element={<InviteAcceptPage />} />
          <Route path="/device" element={<RequireAuth><DevicePage /></RequireAuth>} />
          <Route
            path="/onboarding"
            element={
              <RequirePartialOrFullAuth>
                <OnboardingPage />
              </RequirePartialOrFullAuth>
            }
          />
          <Route
            path="/onboarding/plan"
            element={
              <RequireAuth>
                <OnboardingPlanPage />
              </RequireAuth>
            }
          />
          <Route
            path="/issues"
            element={
              <RequireAuth>
                <IssuesPage />
              </RequireAuth>
            }
          />
          {/* List stays mounted; the :key path overlays the slide-over peek (PER-106). */}
          <Route
            path="/issues/:key"
            element={
              <RequireAuth>
                <IssuesPage />
              </RequireAuth>
            }
          />
          {/* Full-page view, the "↗" promotion target from the peek. */}
          <Route
            path="/issues/:key/full"
            element={
              <RequireAuth>
                <IssueDetailPage />
              </RequireAuth>
            }
          />
          <Route
            path="/projects"
            element={
              <RequireAuth>
                <ProjectsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/archived"
            element={
              <RequireAuth>
                <ArchivedIssuesPage />
              </RequireAuth>
            }
          />
          <Route
            path="/triage"
            element={
              <RequireAuth>
                <TriagePage />
              </RequireAuth>
            }
          />
          {/* Project-scoped routes — first-class projects. The pages read the
              :projectKey route param via useProjectScope(). */}
          <Route
            path="/p/:projectKey/board"
            element={
              <RequireAuth>
                <IssuesPage />
              </RequireAuth>
            }
          />
          <Route
            path="/p/:projectKey/board/:key"
            element={
              <RequireAuth>
                <IssuesPage />
              </RequireAuth>
            }
          />
          <Route
            path="/p/:projectKey/triage"
            element={
              <RequireAuth>
                <TriagePage />
              </RequireAuth>
            }
          />
          <Route
            path="/p/:projectKey/docs"
            element={
              <RequireAuth>
                <DocsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/p/:projectKey/archived"
            element={
              <RequireAuth>
                <ArchivedIssuesPage />
              </RequireAuth>
            }
          />
          <Route
            path="/p/:projectKey/settings"
            element={
              <RequireAuth>
                <ProjectSettingsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/p/:projectKey/updates"
            element={
              <RequireAuth>
                <ProjectUpdatesPage />
              </RequireAuth>
            }
          />
          <Route
            path="/insights"
            element={
              <RequireAuth>
                <InsightsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/inbox"
            element={
              <RequireAuth>
                <InboxPage />
              </RequireAuth>
            }
          />
          <Route
            path="/docs"
            element={
              <RequireAuth>
                <DocsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/agents/activity"
            element={
              <RequireAuth>
                <AgentActivityPage />
              </RequireAuth>
            }
          />
          {/* Settings */}
          <Route
            path="/settings/profile"
            element={
              <RequireAuth>
                <SettingsProfilePage />
              </RequireAuth>
            }
          />
          <Route
            path="/settings/security"
            element={
              <RequireAuth>
                <SettingsSecurityPage />
              </RequireAuth>
            }
          />
          <Route
            path="/settings/sessions"
            element={
              <RequireAuth>
                <SettingsSessionsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/settings/workspaces"
            element={<Navigate to="/settings/workspace" replace />}
          />
          <Route
            path="/settings/workspace"
            element={
              <RequireAuth>
                <SettingsWorkspacePage />
              </RequireAuth>
            }
          />
          <Route
            path="/settings/api-keys"
            element={
              <RequireAuth>
                <SettingsApiKeysPage />
              </RequireAuth>
            }
          />
          <Route
            path="/settings/audit"
            element={
              <RequireAuth>
                <SettingsAuditPage />
              </RequireAuth>
            }
          />
          <Route
            path="/settings/automations"
            element={
              <RequireAuth>
                <SettingsAutomationsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/settings/team"
            element={
              <RequireAuth>
                <SettingsTeamPage />
              </RequireAuth>
            }
          />
          <Route
            path="/settings/labels"
            element={
              <RequireAuth>
                <SettingsLabelsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/settings/webhooks"
            element={
              <RequireAuth>
                <SettingsWebhooksPage />
              </RequireAuth>
            }
          />
          <Route
            path="/settings/notifications"
            element={
              <RequireAuth>
                <SettingsNotificationsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/settings/github"
            element={
              <RequireAuth>
                <SettingsGitHubPage />
              </RequireAuth>
            }
          />
          <Route
            path="/settings/import"
            element={
              <RequireAuth>
                <SettingsImportPage />
              </RequireAuth>
            }
          />
          <Route path="/settings" element={<Navigate to="/settings/profile" replace />} />
          {/* Commercial routes — admin / billing / organizations / feedback.
              Empty in the open (self-host) build; see lib/commercial. */}
          {commercialRoutes.map(({ path, guard, Component }) => (
            <Route
              key={path}
              path={path}
              element={
                guard === 'superadmin' ? (
                  <RequireSuperAdmin>
                    <Component />
                  </RequireSuperAdmin>
                ) : (
                  <RequireAuth>
                    <Component />
                  </RequireAuth>
                )
              }
            />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
        <SignedInOnly>
          <CommandPalette />
        </SignedInOnly>
        <ConfirmDialogProvider />
        <ToastContainer />
      </SessionLoader>
    </BrowserRouter>
  );
}

/** On boot, if we have a persisted token, populate workspace + user from /me.
 *  If the persisted state is a partial session (token + account but no workspace),
 *  skip /me — the user still needs to complete onboarding. */
function SessionLoader({ children }: { children: ReactNode }) {
  const { token, account, setSession, setPartialSession, setMemberships, clear } = useAuth();
  const loadUsers = useUsers((s) => s.load);
  const resetUsers = useUsers((s) => s.reset);
  const loadLabels = useLabels((s) => s.load);
  const resetLabels = useLabels((s) => s.reset);
  const loadProjects = useProjects((s) => s.load);
  const resetProjects = useProjects((s) => s.reset);
  const loadFavorites = useFavorites((s) => s.load);
  const resetFavorites = useFavorites((s) => s.reset);
  const loadViews = useViews((s) => s.load);
  const resetViews = useViews((s) => s.reset);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!token) {
      // No Zustand token — try cookie-based auth (e.g. after OAuth redirect).
      // The cookie authenticates via credentials: 'include'; we use a placeholder
      // token in the store so Zustand guards pass.
      api
        .me()
        .then((profile) => {
          if (profile.workspace && profile.user) {
            const cookieToken = `cookie:${profile.user.id}`;
            setSession({ workspace: profile.workspace, user: profile.user, token: cookieToken });
            api.listWorkspaceMemberships(cookieToken).then((result) => setMemberships(result.memberships));
            loadUsers(cookieToken);
            loadLabels(cookieToken);
            loadProjects(cookieToken);
            loadFavorites(cookieToken);
            loadViews(cookieToken);
          } else if (profile.account) {
            const cookieToken = `cookie:${profile.account.id}`;
            setPartialSession({ account: profile.account, token: cookieToken });
          }
        })
        .catch(() => {
          resetUsers();
          resetLabels();
          resetProjects();
          resetFavorites();
          resetViews();
          setMemberships([]);
        })
        .finally(() => setReady(true));
      return;
    }
    // Partial session — has token but no workspace yet (mid-onboarding). Don't call /me.
    if (account) {
      setReady(true);
      return;
    }
    setReady(false);
    const dropSession = () => {
      clear();
      resetUsers();
      resetLabels();
      resetProjects();
      resetFavorites();
      resetViews();
      setMemberships([]);
    };
    api
      .me(token)
      .then((profile) => {
        // /me now answers 200 even when signed out — treat a profile with no
        // workspace/user as an expired/invalid session rather than a session.
        if (!profile.workspace || !profile.user) {
          dropSession();
          return;
        }
        setSession({ workspace: profile.workspace, user: profile.user, token });
        api.listWorkspaceMemberships(token).then((result) => setMemberships(result.memberships));
        loadUsers(token);
        loadLabels(token);
        loadProjects(token);
        loadFavorites(token);
        loadViews(token);
      })
      .catch((err) => {
        if (err instanceof FetchError && err.status === 401) dropSession();
      })
      .finally(() => setReady(true));
  }, [
    token,
    account,
    setSession,
    setPartialSession,
    setMemberships,
    clear,
    loadUsers,
    resetUsers,
    loadLabels,
    resetLabels,
    loadProjects,
    resetProjects,
    loadFavorites,
    resetFavorites,
    loadViews,
    resetViews,
  ]);

  if (!ready) {
    return (
      <div className="min-h-screen bg-xp-canvas text-xp-muted flex items-center justify-center font-mono">
        Loading
      </div>
    );
  }
  return <>{children}</>;
}

/**
 * Default landing (`/`): resume the user's last-used project board, falling back
 * to their first project, then to "My issues" if they have no projects. Rendered
 * inside RequireAuth, so auth/onboarding redirects are already handled.
 */
function LandingRedirect() {
  const token = useAuth((s) => s.token);
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let key: string | null = null;
      try {
        if (token) await useProjects.getState().load(token);
        const all = useProjects.getState().all;
        if (token) {
          try {
            const { projectId } = await api.getLastUsedProjectId(token);
            if (projectId) key = all.find((p) => p.id === projectId)?.key ?? null;
          } catch {
            /* fall through to first project */
          }
        }
        if (!key && all.length > 0) key = all[0]!.key;
      } catch {
        /* fall through to My issues */
      }
      if (!cancelled) {
        setTarget(key ? `/p/${encodeURIComponent(key)}/board` : '/issues?assignee=me');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (!target) return null;
  return <Navigate to={target} replace />;
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, token, workspace } = useAuth();
  const location = useLocation();
  // Has a token but no workspace yet — send to onboarding
  if (token && !workspace) {
    return <Navigate to="/onboarding" replace />;
  }
  if (!user) {
    return <Navigate to="/signin" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}

/** Allow access when token exists (partial or full), redirect to /signin if no token.
 *  If the session is already complete (workspace exists), redirect to /issues. */
function RequirePartialOrFullAuth({ children }: { children: ReactNode }) {
  const { token, workspace } = useAuth();
  if (!token) {
    return <Navigate to="/signin" replace />;
  }
  if (workspace) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function RequireSuperAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) {
    return <Navigate to="/signin" state={{ from: location }} replace />;
  }
  if (!user.isSuperAdmin) {
    return <Navigate to="/issues" replace />;
  }
  return <>{children}</>;
}

function SignedInOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return null;
  return <>{children}</>;
}
