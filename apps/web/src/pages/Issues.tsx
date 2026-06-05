import {
  AlertDialog,
  Avatar,
  Button,
  Checkbox,
  EmptyState,
  Input,
  IssueKey,
  Priority,
  PromptDialog,
  Select,
  Skeleton,
  StateDot,
  Switch,
  type WorkflowState as StateKind,
} from '@xpntl/ui';
import {
  type KeyboardEvent,
  type MouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import {
  AssigneePicker,
  LabelPicker,
  PriorityPicker,
  StatePicker,
  TagPicker,
} from '../components/CellPickers';
import { IssueContextMenuPortal, useIssueContextMenu } from '../components/IssueContextMenu';
import { IssuePeek } from '../components/IssuePeek';
import { IssueRefText } from '../components/IssueRefText';
import { KanbanBoard } from '../components/KanbanBoard';
import { LabelChip } from '../components/LabelChip';
import { TagChip } from '../components/TagChip';
import { RoadmapTimeline } from '../components/RoadmapTimeline';
import { ViewToggle } from '../components/ViewToggle';
import { FetchError, type Issue, type Label, type Project, type ProjectList, type Tag, type WorkflowState, api } from '../lib/api';
import { useAuth } from '../lib/auth-store';
import { useFavorites } from '../lib/favorite-store';
import {
  GROUP_OPTIONS,
  type GroupKey,
  type ParsedFilter,
  SORT_OPTIONS,
  type SortKey,
  type ViewKey,
  parseFromSearchParams,
  toApiQuery,
  toSearchParams,
} from '../lib/filter-url';
import { PRIORITY_LABELS, formatRelative, priorityKind } from '../lib/format';
import { groupIssues } from '../lib/group-issues';
import { useLabels } from '../lib/label-store';
import { useProjects } from '../lib/project-store';
import { useSyncStore } from '../lib/sync-store';
import {
  enqueueIssueArchive,
  enqueueIssueSetAssignees,
  enqueueIssueUpdate,
  useMutationQueue,
} from '../lib/mutation-queue-store';
import { useTags } from '../lib/tag-store';
import { useQuickCreate } from '../lib/quick-create-store';
import { useShortcut } from '../lib/shortcuts';
import { useToasts } from '../lib/toast-store';
import { nameForUser, useUsers } from '../lib/user-store';
import { AgentAvatar } from '../components/AgentBadge';
import { useViews } from '../lib/view-store';

const kbdStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '1px 4px',
  border: '1px solid var(--xp-border)',
  borderRadius: 'var(--xp-r-sm)',
  background: 'var(--xp-canvas)',
  fontFamily: 'var(--xp-font-mono)',
  fontSize: 10,
  lineHeight: '14px',
};

export function IssuesPage() {
  const navigate = useNavigate();
  const { workspace, token, clear } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  // /issues/:key (and /p/:projectKey/board/:key) open the slide-over peek.
  const { key: peekKey, projectKey: routeProjectKey } = useParams<{ key?: string; projectKey?: string }>();

  const filter = useMemo(() => parseFromSearchParams(searchParams), [searchParams]);
  const favoriteIds = useFavorites((s) => s.ids);
  const toggleFavorite = useFavorites((s) => s.toggle);

  const [issues, setIssues] = useState<Issue[]>([]);
  const [states, setStates] = useState<WorkflowState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setQuickCreateOpen = useQuickCreate((s) => s.setOpen);

  // Project state for issue creation
  const projects = useProjects((s) => s.all);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [lastUsedProjectId, setLastUsedProjectId] = useState<string | null>(null);

  // PER-111 — row focus + selection state. focusedIdx is into the FLAT issues array.
  const [focusedIdx, setFocusedIdx] = useState<number>(-1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // PER-108 / PER-43 — inline-edit popover. One at a time across the entire list.
  const [popover, setPopover] = useState<{
    kind: 'state' | 'priority' | 'assignee' | 'labels' | 'tags';
    anchor: HTMLElement;
    issueId: string;
  } | null>(null);
  const [bulkPopover, setBulkPopover] = useState<{
    kind: 'state' | 'priority' | 'assignee';
    anchor: HTMLElement;
  } | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [collapseEmpty, setCollapseEmpty] = useState(false);

  // Themed dialog state — replaces window.confirm / window.prompt
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    keys: string[];
    ids: string[];
    message: string;
  }>({ open: false, keys: [], ids: [], message: '' });
  const [viewNameDialog, setViewNameDialog] = useState(false);

  function openCellPopoverForFocused(kind: 'state' | 'priority' | 'assignee' | 'labels' | 'tags') {
    const target = issues[focusedIdx];
    if (!target) return;
    const anchor = document.querySelector<HTMLElement>(
      `[data-row-id="${target.id}"] [data-cell="${kind}"]`,
    );
    if (anchor) setPopover({ kind, anchor, issueId: target.id });
  }

  function applyPatch(issueId: string, patch: Partial<Issue>): void {
    // Optimistic local update. Delivery + retry/offline is handled by the
    // mutation queue (XP-3 Phase 2); reconcile-on-ack arrives via op-apply when
    // the server confirms and our own sync connection replays the op.
    setIssues((current) => current.map((i) => (i.id === issueId ? { ...i, ...patch } : i)));
    const target = issues.find((i) => i.id === issueId);
    if (!target) return;
    enqueueIssueUpdate(target.key, {
      stateId: patch.stateId,
      priority: patch.priority,
      assigneeId: patch.assigneeId,
      blocked: patch.blocked,
      listId: patch.listId,
      startDate: patch.startDate,
      dueDate: patch.dueDate,
      sortOrder: patch.sortOrder,
    });
  }

  function handleSetAssignees(issueKey: string, userIds: string[]): void {
    const usersByIdNow = useUsers.getState().byId;
    const assignees = userIds
      .map((id) => usersByIdNow[id])
      .filter((u): u is NonNullable<typeof u> => Boolean(u));
    // Optimistically reflect the new list + primary (first) assignee; the queue
    // handles delivery/retry and op-apply reconciles on ack.
    setIssues((current) =>
      current.map((i) =>
        i.key === issueKey ? { ...i, assignees, assigneeId: userIds[0] ?? null } : i,
      ),
    );
    enqueueIssueSetAssignees(issueKey, userIds);
  }

  function handleArchive(issueKey: string): void {
    // Optimistically drop it from the board — archived issues are hidden.
    setIssues((current) => current.filter((i) => i.key !== issueKey));
    enqueueIssueArchive(issueKey);
    pushToast('info', `Archived ${issueKey}`);
  }

  function applyBulkPatch(
    patch: Pick<Partial<Issue>, 'stateId' | 'priority' | 'assigneeId' | 'blocked'>,
  ): void {
    const selected = issues.filter((issue) => selectedIds.has(issue.id));
    if (selected.length === 0) return;

    const snapshot = issues;
    const selectedIdSet = new Set(selected.map((issue) => issue.id));
    setBulkSaving(true);
    setIssues((current) =>
      current.map((issue) => (selectedIdSet.has(issue.id) ? { ...issue, ...patch } : issue)),
    );

    api
      .bulkUpdateIssues(
        selected.map((issue) => issue.key),
        {
          stateId: patch.stateId,
          priority: patch.priority,
          assigneeId: patch.assigneeId,
          blocked: patch.blocked,
        },
        token,
      )
      .then((result) => {
        const updatedById = new Map(result.issues.map((issue) => [issue.id, issue]));
        setIssues((current) => current.map((issue) => updatedById.get(issue.id) ?? issue));
      })
      .catch((err) => {
        setIssues(snapshot);
        setError(err instanceof FetchError ? err.message : 'Failed to update selected issues');
      })
      .finally(() => {
        setBulkSaving(false);
      });
  }

  const contextMenu = useIssueContextMenu();
  const pushToast = useToasts((s) => s.push);

  const users = Object.values(useUsers((s) => s.byId));
  const allLabels = useLabels((s) => s.all);
  const reloadLabels = useLabels((s) => s.reload);
  const allTags = useTags((s) => s.all);
  const reloadTags = useTags((s) => s.reload);

  function applyLabelToggle(issueId: string, labelId: string, attach: boolean) {
    const snapshot = issues;
    const target = snapshot.find((i) => i.id === issueId);
    if (!target) return;
    const currentLabels = target.labels ?? [];
    const optimistic = attach
      ? [...currentLabels, allLabels.find((l) => l.id === labelId)].filter((l): l is Label => !!l)
      : currentLabels.filter((l) => l.id !== labelId);
    setIssues((current) =>
      current.map((i) => (i.id === issueId ? { ...i, labels: optimistic } : i)),
    );
    const op = attach
      ? api.attachLabel(target.key, labelId, token)
      : api.detachLabel(target.key, labelId, token);
    op.then((result) => {
      setIssues((current) =>
        current.map((i) => (i.id === issueId ? { ...i, labels: result.labels } : i)),
      );
    }).catch(() => {
      setIssues(snapshot);
    });
  }

  async function handleCreateLabel(name: string): Promise<Label | null> {
    try {
      const result = await api.createLabel({ name }, token);
      await reloadLabels(token);
      return result.label;
    } catch {
      return null;
    }
  }

  function applyTagToggle(issueId: string, tagId: string, attach: boolean) {
    const snapshot = issues;
    const target = snapshot.find((i) => i.id === issueId);
    if (!target) return;
    const currentTags = target.tags ?? [];
    const optimistic = attach
      ? [...currentTags, allTags.find((t) => t.id === tagId)].filter((t): t is Tag => !!t)
      : currentTags.filter((t) => t.id !== tagId);
    setIssues((current) =>
      current.map((i) => (i.id === issueId ? { ...i, tags: optimistic } : i)),
    );
    const op = attach
      ? api.attachTag(target.key, tagId, token)
      : api.detachTag(target.key, tagId, token);
    op.then((result) => {
      setIssues((current) =>
        current.map((i) => (i.id === issueId ? { ...i, tags: result.tags } : i)),
      );
    }).catch(() => {
      setIssues(snapshot);
    });
  }

  async function handleCreateTag(name: string): Promise<Tag | null> {
    try {
      const result = await api.createTag({ name }, token);
      await reloadTags(token);
      return result.tag;
    } catch {
      return null;
    }
  }

  useShortcut('c', () => setQuickCreateOpen(true));
  useShortcut('/', () => document.getElementById('issue-search-input')?.focus());

  // Row navigation
  useShortcut('j', () => {
    setFocusedIdx((i) => Math.min(i + 1, issues.length - 1));
  });
  useShortcut('k', () => {
    setFocusedIdx((i) => Math.max(i - 1, 0));
  });
  useShortcut('enter', () => {
    const target = issues[focusedIdx];
    if (target) {
      navigate({
        pathname: `/issues/${encodeURIComponent(target.key)}`,
        search: searchParams.toString(),
      });
    }
  });
  useShortcut('e', () => {
    const target = issues[focusedIdx];
    if (target) {
      navigate({
        pathname: `/issues/${encodeURIComponent(target.key)}`,
        search: searchParams.toString(),
      });
    }
  });
  useShortcut('x', () => {
    const target = issues[focusedIdx];
    if (!target) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(target.id)) {
        next.delete(target.id);
      } else {
        next.add(target.id);
      }
      return next;
    });
  });
  useShortcut('escape', () => {
    if (popover) {
      setPopover(null);
      return;
    }
    if (peekKey) {
      navigate({ pathname: '/issues', search: searchParams.toString() });
      return;
    }
    if (selectedIds.size > 0) {
      setSelectedIds(new Set());
      return;
    }
    setFocusedIdx(-1);
  });

  // PER-108 / PER-43 — property-edit shortcuts on focused row.
  useShortcut('s', () => {
    if (isTriage) {
      const target = issues[focusedIdx];
      if (target) triageIssue(target.id, 'started');
    } else {
      openCellPopoverForFocused('state');
    }
  });
  useShortcut('p', () => openCellPopoverForFocused('priority'));
  useShortcut('a', () => openCellPopoverForFocused('assignee'));
  useShortcut('l', () => openCellPopoverForFocused('labels'));
  // `t` is context-dependent (mirrors `s`): accept→Backlog in triage,
  // otherwise open the tags picker. Single registration to avoid a
  // double-fire conflict in the inbox.
  useShortcut('t', () => {
    if (isTriage) {
      const target = issues[focusedIdx];
      if (target) triageIssue(target.id, 'backlog');
    } else {
      openCellPopoverForFocused('tags');
    }
  });

  // Clamp focused index when the list shrinks.
  useEffect(() => {
    if (focusedIdx >= issues.length) setFocusedIdx(issues.length - 1);
  }, [issues.length, focusedIdx]);

  useEffect(() => {
    setSelectedIds((prev) => {
      const visibleIds = new Set(issues.map((issue) => issue.id));
      const next = new Set([...prev].filter((id) => visibleIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [issues]);

  // Scroll the focused row into view when it changes.
  useEffect(() => {
    if (focusedIdx < 0) return;
    const focused = issues[focusedIdx];
    if (!focused) return;
    const el = document.querySelector<HTMLElement>(`[data-issue-id="${focused.id}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focusedIdx, issues]);

  useEffect(() => {
    if (searchParams.get('create') === '1') {
      setQuickCreateOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete('create');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Load workflow states once.
  useEffect(() => {
    api
      .listWorkflowStates(token)
      .then((r) => setStates(r.states))
      .catch(() => {
        /* if states fail, the page can still show issues */
      });
  }, [token]);

  // Load last-used project for the create form (projects come from store).
  useEffect(() => {
    if (!token) return;
    api.getLastUsedProjectId(token).then((r) => {
      setLastUsedProjectId(r.projectId);
      const defaultId = r.projectId || projects[0]?.id || '';
      setSelectedProjectId(defaultId);
    }).catch(() => {});
  }, [token, projects]);

  const projectByKey = useMemo(
    () => new Map(projects.map((p) => [p.key, p])),
    [projects],
  );
  const projectById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  );

  const resolvedProjectId = useMemo(() => {
    // Project-scoped route (/p/:projectKey/board) wins over the legacy ?project= filter.
    const scopeKey = routeProjectKey ?? filter.project;
    if (!scopeKey) return '';
    const byKey = projectByKey.get(scopeKey);
    if (byKey) return byKey.id;
    const byId = projectById.get(scopeKey);
    if (byId) return byId.id;
    return '';
  }, [routeProjectKey, filter.project, projectByKey, projectById]);

  useEffect(() => {
    if (resolvedProjectId) {
      setSelectedProjectId(resolvedProjectId);
    }
  }, [resolvedProjectId]);

  // Lists (XP-74) — only meaningful inside a single project's board.
  const [lists, setLists] = useState<ProjectList[]>([]);
  const listsById = useMemo(
    () => Object.fromEntries(lists.map((l) => [l.id, l])) as Record<string, ProjectList>,
    [lists],
  );

  useEffect(() => {
    if (!resolvedProjectId) {
      setLists([]);
      return;
    }
    let cancelled = false;
    api
      .listProjectLists(resolvedProjectId, token)
      .then((r) => {
        if (!cancelled) setLists(r.lists);
      })
      .catch(() => {
        if (!cancelled) setLists([]);
      });
    return () => {
      cancelled = true;
    };
  }, [resolvedProjectId, token]);

  async function handleAddList(name: string) {
    if (!resolvedProjectId) return;
    try {
      const { list } = await api.createProjectList(resolvedProjectId, { name }, token);
      setLists((cur) => [...cur, list]);
    } catch (err) {
      pushToast('danger', err instanceof FetchError ? err.message : 'Failed to add list');
    }
  }

  function handleRenameList(listId: string, name: string) {
    if (!resolvedProjectId) return;
    const snapshot = lists;
    setLists((cur) => cur.map((l) => (l.id === listId ? { ...l, name } : l)));
    api.updateProjectList(resolvedProjectId, listId, { name }, token).catch(() => {
      setLists(snapshot);
      pushToast('danger', 'Failed to rename list');
    });
  }

  function handleDeleteList(listId: string) {
    if (!resolvedProjectId) return;
    const listSnapshot = lists;
    const issueSnapshot = issues;
    setLists((cur) => cur.filter((l) => l.id !== listId));
    // Issues keep existing — they're just unfiled (server SET NULL).
    setIssues((cur) => cur.map((i) => (i.listId === listId ? { ...i, listId: null } : i)));
    api.deleteProjectList(resolvedProjectId, listId, token).catch(() => {
      setLists(listSnapshot);
      setIssues(issueSnapshot);
      pushToast('danger', 'Failed to delete list');
    });
  }

  // Load issues whenever filter changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listIssues(toApiQuery(filter, resolvedProjectId), token)
      .then((r) => {
        if (cancelled) return;
        setIssues(r.issues);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof FetchError && err.status === 401) {
          clear();
          navigate('/signin');
          return;
        }
        setError(err instanceof FetchError ? err.message : 'Failed to load issues');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filter, token, clear, navigate]);

  // Real-time op-apply (XP-3 Phase 2): apply each incoming issue op surgically
  // instead of reloading the whole list. Delete → drop the card; update of a
  // loaded issue → fetch just that one and upsert (re-groups on the board);
  // create / update of a not-loaded issue → refetch the current query, since
  // membership against the active filter may have changed.
  const issuesRef = useRef<Issue[]>([]);
  issuesRef.current = issues;
  const lastOp = useSyncStore((s) => s.lastOp);
  useEffect(() => {
    if (!lastOp || !token || lastOp.entityType !== 'issue') return;
    const { entityId, mutation } = lastOp;

    if (mutation === 'delete') {
      setIssues((cur) => cur.filter((i) => i.id !== entityId));
      return;
    }

    const known = issuesRef.current.find((i) => i.id === entityId);
    let cancelled = false;

    if (mutation === 'update' && known) {
      api
        .getIssue(known.key, token)
        .then(({ issue }) => {
          if (!cancelled) setIssues((cur) => cur.map((i) => (i.id === entityId ? issue : i)));
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }

    const timer = setTimeout(() => {
      api
        .listIssues(toApiQuery(filter, resolvedProjectId), token)
        .then((r) => {
          if (!cancelled) setIssues(r.issues);
        })
        .catch(() => {});
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // We trigger on each new op; filter/resolvedProjectId are read fresh inside.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastOp, token]);

  // If a queued mutation is dropped permanently (e.g. server 4xx), refetch to
  // undo the optimistic edit that will never be confirmed.
  const dropRev = useMutationQueue((s) => s.dropRev);
  useEffect(() => {
    if (dropRev === 0 || !token) return;
    api
      .listIssues(toApiQuery(filter, resolvedProjectId), token)
      .then((r) => setIssues(r.issues))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dropRev]);

  function updateFilter(patch: Partial<ParsedFilter>) {
    const next = toSearchParams({ ...filter, ...patch });
    setSearchParams(next);
  }


  async function handleBoardCreate(title: string, columnKey: string) {
    const groupBy = effectiveGroup === 'none' ? 'state' : effectiveGroup;
    const priority = groupBy === 'priority' ? Number(columnKey) : undefined;
    const result = await api.createIssue({ title, priority, projectId: selectedProjectId }, token);
    let created = result.issue;
    const patch: Record<string, unknown> = {};
    if (groupBy === 'state' && created.stateId !== columnKey) {
      patch.stateId = columnKey;
    }
    if (groupBy === 'assignee' && columnKey !== '__unassigned') {
      patch.assigneeId = columnKey;
    }
    if (groupBy === 'list' && columnKey !== '__nolist') {
      patch.listId = columnKey;
    }
    if (Object.keys(patch).length > 0) {
      const updated = await api.updateIssue(created.key, patch as Partial<Issue>, token);
      created = updated.issue;
    }
    setIssues((current) => [created, ...current]);
  }

  const stateById = useMemo(() => new Map(states.map((s) => [s.id, s])), [states]);
  const usersById = useUsers((s) => s.byId);
  const effectiveGroup =
    filter.view === 'board' && filter.group === 'none' ? 'state' : filter.group;
  const isBoard = filter.view === 'board';
  const grouped = useMemo(
    () =>
      groupIssues(issues, effectiveGroup, stateById, usersById, {
        includeEmpty: isBoard,
        listsById,
      }),
    [issues, effectiveGroup, stateById, usersById, isBoard, listsById],
  );
  const selectedIssues = useMemo(
    () => issues.filter((issue) => selectedIds.has(issue.id)),
    [issues, selectedIds],
  );

  const isTriage = filter.stateTypes.length === 1 && filter.stateTypes[0] === 'triage';
  const triageTargets = useMemo(() => {
    const find = (type: WorkflowState['type']) => states.find((s) => s.type === type);
    return {
      backlog: find('backlog'),
      started: find('started'),
      canceled: find('canceled'),
    };
  }, [states]);

  function triageIssue(issueId: string, target: 'backlog' | 'started' | 'canceled') {
    const stateId = triageTargets[target]?.id;
    if (!stateId) return;
    applyPatch(issueId, { stateId });
    setIssues((cur) => cur.filter((i) => i.id !== issueId));
    if (focusedIdx >= issues.length - 1) {
      setFocusedIdx(Math.max(0, focusedIdx - 1));
    }
  }

  // Triage-only: decline the focused issue. (Accept→Backlog is `t`, and
  // Start-now is `s` — both consolidated with their list-view bindings above.)
  useShortcut('d', () => {
    if (!isTriage) return;
    const target = issues[focusedIdx];
    if (target) triageIssue(target.id, 'canceled');
  });

  return (
    <AppLayout>
      <div
        style={{
          padding: '6px 20px',
          borderBottom: '1px solid var(--xp-hairline)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'var(--xp-surface)',
        }}
      >
        <span className="xp-caps" style={{ color: 'var(--xp-muted)' }}>
          {workspace?.key ?? ''} · {isTriage ? 'TRIAGE INBOX' : 'ALL ISSUES'}
        </span>
        <span className="xp-mono xp-muted" style={{ fontSize: 11 }}>
          {issues.length} ITEM{issues.length === 1 ? '' : 'S'}
        </span>
      </div>

      {/* View tabs — hidden in triage/inbox since it's always a flat list */}
      {!isTriage && (
        <ViewToggle
          value={filter.view}
          onChange={(v) =>
            updateFilter({
              view: v,
              group: v === 'board' && filter.group === 'none' ? 'state' : filter.group,
            })
          }
        />
      )}

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          padding: '16px 24px',
        }}
      >
        {/* Filter bar */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 8,
            marginBottom: 12,
          }}
        >
          <div style={{ flex: '1 1 240px', minWidth: 240, maxWidth: 360 }}>
            <Input
              id="issue-search-input"
              type="search"
              value={filter.q}
              onChange={(e) => updateFilter({ q: e.target.value })}
              placeholder="Search issues"
              leading={<span style={{ fontFamily: 'var(--xp-font-mono)', fontSize: 12 }}>⌕</span>}
              trailing={
                <span
                  style={{
                    fontFamily: 'var(--xp-font-mono)',
                    fontSize: 10,
                    color: 'var(--xp-faint)',
                    letterSpacing: 'var(--xp-track-caps)',
                  }}
                >
                  /
                </span>
              }
            />
          </div>
          <div style={{ width: 180 }}>
            <Select
              value={filter.sort}
              onValueChange={(value) => updateFilter({ sort: value as SortKey })}
              options={SORT_OPTIONS.map((s) => ({
                value: s,
                label: `Sort · ${s.replace('_', ' ')}`,
              }))}
            />
          </div>
          <div style={{ width: 140 }}>
            <Select
              value={filter.group}
              onValueChange={(value) => updateFilter({ group: value as GroupKey })}
              options={GROUP_OPTIONS.filter((g) => g !== 'list' || resolvedProjectId).map((g) => ({
                value: g,
                label: `Group · ${g}`,
              }))}
            />
          </div>
          <SaveViewButton filter={filter} token={token} />
          {isBoard && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 10px',
                height: 'var(--xp-input-h)',
                border: '1px solid var(--xp-border)',
                borderRadius: 'var(--xp-r-sm)',
                background: 'var(--xp-surface)',
              }}
            >
              <Switch
                checked={collapseEmpty}
                onChange={() => setCollapseEmpty((current) => !current)}
                label="Collapse empty columns"
              />
            </div>
          )}
        </div>

        {/* Filter chips */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 6,
            marginBottom: 14,
          }}
        >
          {states
            .filter((s) => s.type !== 'triage' && s.type !== 'canceled')
            .map((s) => {
            const active = filter.stateIds.includes(s.id);
            return (
              <FilterChip
                key={s.id}
                active={active}
                onClick={() =>
                  updateFilter({
                    stateIds: active
                      ? filter.stateIds.filter((x) => x !== s.id)
                      : [...filter.stateIds, s.id],
                  })
                }
                leading={<StateDot kind={(s.type as StateKind) ?? 'unstarted'} size={10} />}
              >
                {s.name}
              </FilterChip>
            );
          })}
          {[1, 2, 3, 4].map((p) => {
            const active = filter.priorities.includes(p);
            return (
              <FilterChip
                key={`p-${p}`}
                active={active}
                onClick={() =>
                  updateFilter({
                    priorities: active
                      ? filter.priorities.filter((x) => x !== p)
                      : [...filter.priorities, p],
                  })
                }
                leading={<Priority kind={priorityKind(p)} size={10} />}
              >
                {PRIORITY_LABELS[p]}
              </FilterChip>
            );
          })}
          {(filter.stateIds.length > 0 || filter.priorities.length > 0 || filter.q) && (
            <FilterChip onClick={() => setSearchParams(new URLSearchParams())}>Clear</FilterChip>
          )}
        </div>

        {error && (
          <p
            style={{
              marginBottom: 12,
              color: 'var(--xp-danger)',
              fontSize: 12,
              fontFamily: 'var(--xp-font-mono)',
            }}
          >
            {error}
          </p>
        )}

        {selectedIssues.length > 0 && (
          <BulkToolbar
            count={selectedIssues.length}
            allVisibleSelected={selectedIssues.length === issues.length}
            mixedVisibleSelection={
              selectedIssues.length > 0 && selectedIssues.length < issues.length
            }
            bulkSaving={bulkSaving}
            onToggleAll={() => {
              if (selectedIssues.length === issues.length) {
                setSelectedIds(new Set());
                return;
              }
              setSelectedIds(new Set(issues.map((issue) => issue.id)));
            }}
            onOpen={(kind, anchor) => setBulkPopover({ kind, anchor })}
            onClear={() => setSelectedIds(new Set())}
          />
        )}

        {isTriage && !loading && issues.length > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              padding: '8px 12px',
              marginBottom: 10,
              borderRadius: 'var(--xp-r-sm)',
              border: '1px solid var(--xp-hairline)',
              background: 'var(--xp-surface)',
              fontFamily: 'var(--xp-font-mono)',
              fontSize: 11,
              color: 'var(--xp-muted)',
            }}
          >
            <span style={{ fontWeight: 600, color: 'var(--xp-ink)' }}>TRIAGE</span>
            <span>
              <kbd style={kbdStyle}>T</kbd> accept
            </span>
            <span>
              <kbd style={kbdStyle}>S</kbd> start
            </span>
            <span>
              <kbd style={kbdStyle}>D</kbd> decline
            </span>
            <span>
              <kbd style={kbdStyle}>J</kbd>/<kbd style={kbdStyle}>K</kbd> navigate
            </span>
          </div>
        )}

        {loading ? (
          isBoard ? (
            // Board-shaped skeleton (columns of cards) instead of list rows.
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              {[0, 1, 2, 3].map((col) => (
                <div
                  key={col}
                  style={{
                    flex: '1 1 0',
                    minWidth: 200,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    padding: 8,
                    border: '1px solid var(--xp-hairline)',
                    borderRadius: 8,
                  }}
                >
                  <Skeleton h={14} />
                  {[0, 1, 2].map((c) => (
                    <Skeleton key={c} h={56} />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} h={32} />
              ))}
            </div>
          )
        ) : issues.length === 0 ? (
          <div
            style={{
              padding: '24px',
              border: '1px dashed var(--xp-border)',
              borderRadius: 'var(--xp-r-sm)',
              background: 'var(--xp-surface)',
            }}
          >
            <EmptyState
              icon={
                isTriage ? (
                  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="14" cy="14" r="10" /><path d="M10 14l3 3 5-6" /></svg>
                ) : (
                  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="5" y="7" width="18" height="14" rx="2" /><path d="M9 12h10M9 16h6" /></svg>
                )
              }
              title={isTriage ? 'All clear' : 'No issues yet'}
              description={
                isTriage
                  ? 'Nothing to triage. Nice work.'
                  : filter.q || filter.stateIds.length > 0 || filter.priorities.length > 0
                    ? 'No issues match your current filters. Try adjusting or clearing them.'
                    : 'Create your first issue to get started.'
              }
              action={
                !isTriage && !filter.q && filter.stateIds.length === 0 && filter.priorities.length === 0
                  ? <Button size="sm" onClick={() => setQuickCreateOpen(true)}>New issue</Button>
                  : undefined
              }
            />
          </div>
        ) : filter.view === 'roadmap' ? (
          <RoadmapTimeline
            issues={issues}
            states={states}
            stateById={stateById}
            usersById={usersById}
            onPatch={applyPatch}
          />
        ) : filter.view === 'board' ? (
          <KanbanBoard
            groups={grouped}
            groupBy={effectiveGroup === 'none' ? 'state' : effectiveGroup}
            states={states}
            stateById={stateById}
            usersById={usersById}
            onPatch={applyPatch}
            onCreate={handleBoardCreate}
            onContextMenu={(e, issue) => contextMenu.open(e, issue, selectedIds)}
            onArchive={handleArchive}
            onSetAssignees={handleSetAssignees}
            listsById={listsById}
            onAddList={resolvedProjectId ? handleAddList : undefined}
            onRenameList={resolvedProjectId ? handleRenameList : undefined}
            onDeleteList={resolvedProjectId ? handleDeleteList : undefined}
            collapseEmpty={collapseEmpty}
          />
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 24,
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
            }}
          >
            {grouped.map((g) => (
              <div key={g.key}>
                {g.key !== 'all' && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 8,
                      padding: '0 6px',
                    }}
                  >
                    <span className="xp-meta" style={{ color: 'var(--xp-muted)' }}>
                      {g.label}
                    </span>
                    <span
                      className="xp-mono xp-muted"
                      style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums' }}
                    >
                      {String(g.issues.length).padStart(2, '0')}
                    </span>
                    <span
                      aria-hidden
                      style={{ flex: 1, height: 1, background: 'var(--xp-hairline)' }}
                    />
                  </div>
                )}
                <ul
                  style={{
                    listStyle: 'none',
                    padding: 0,
                    margin: 0,
                    border: '1px solid var(--xp-hairline)',
                    borderRadius: 'var(--xp-r-sm)',
                    background: 'var(--xp-surface)',
                    overflow: 'hidden',
                  }}
                >
                  {g.issues.map((issue, idx) => {
                    const state = stateById.get(issue.stateId);
                    const stateKind: StateKind = (state?.type as StateKind) ?? 'unstarted';
                    const flatIdx = issues.indexOf(issue);
                    const isFocused = flatIdx === focusedIdx;
                    const isSelected = selectedIds.has(issue.id);
                    return (
                      <li
                        key={issue.id}
                        data-issue-id={issue.id}
                        onContextMenu={(e) => contextMenu.open(e, issue, selectedIds)}
                        style={{
                          borderTop: idx === 0 ? 'none' : '1px solid var(--xp-hairline)',
                          background: isSelected
                            ? 'var(--xp-accent-tint)'
                            : isFocused
                              ? 'var(--xp-layer)'
                              : 'transparent',
                          position: 'relative',
                        }}
                      >
                        {isSelected && (
                          <span
                            aria-hidden
                            style={{
                              position: 'absolute',
                              left: 0,
                              top: 0,
                              bottom: 0,
                              width: 2,
                              background: 'var(--xp-accent-strong)',
                            }}
                          />
                        )}
                        <Link
                          to={{
                            pathname: `/issues/${encodeURIComponent(issue.key)}`,
                            search: searchParams.toString(),
                          }}
                          onClick={() => setFocusedIdx(flatIdx)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            height: 'var(--xp-row-h, 28px)',
                            padding: '0 12px',
                            textDecoration: 'none',
                            color: 'var(--xp-ink)',
                            fontFamily: 'var(--xp-font-mono)',
                            fontSize: 12.5,
                            outline: isFocused ? '2px solid var(--xp-accent-strong)' : 'none',
                            outlineOffset: -2,
                            borderRadius: 'var(--xp-r-sm)',
                          }}
                        >
                          <RowSelectionToggle
                            checked={isSelected}
                            onToggle={() => {
                              setFocusedIdx(flatIdx);
                              setSelectedIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(issue.id)) {
                                  next.delete(issue.id);
                                } else {
                                  next.add(issue.id);
                                }
                                return next;
                              });
                            }}
                          />
                          <span
                            data-cell="state"
                            role="button"
                            aria-label="Change state"
                            tabIndex={-1}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setFocusedIdx(flatIdx);
                              setPopover({
                                kind: 'state',
                                anchor: e.currentTarget,
                                issueId: issue.id,
                              });
                            }}
                            style={{ display: 'inline-flex', cursor: 'pointer' }}
                          >
                            <StateDot kind={stateKind} size={12} />
                          </span>
                          <span style={{ width: 72, flex: 'none' }}>
                            <IssueKey size="sm">{issue.key}</IssueKey>
                          </span>
                          <span
                            data-cell="priority"
                            role="button"
                            aria-label="Change priority"
                            tabIndex={-1}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setFocusedIdx(flatIdx);
                              setPopover({
                                kind: 'priority',
                                anchor: e.currentTarget,
                                issueId: issue.id,
                              });
                            }}
                            style={{ display: 'inline-flex', cursor: 'pointer' }}
                          >
                            <Priority kind={priorityKind(issue.priority)} size={12} />
                          </span>
                          <span
                            style={{
                              flex: 1,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              letterSpacing: 'var(--xp-track-snug)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <IssueRefText text={issue.title} />
                            {issue.subIssueCount && issue.subIssueCount.total > 0 && (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 3,
                                  fontSize: 10,
                                  color: 'var(--xp-muted)',
                                  flexShrink: 0,
                                }}
                                title={`${issue.subIssueCount.completed}/${issue.subIssueCount.total} sub-issues done`}
                              >
                                <svg
                                  width={12}
                                  height={12}
                                  viewBox="0 0 12 12"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth={1.2}
                                >
                                  <path d="M2 6h3v4H2zM5 3h3v7H5zM8 5h2v4H8z" />
                                </svg>
                                {issue.subIssueCount.completed}/{issue.subIssueCount.total}
                              </span>
                            )}
                            {issue.recurrenceRule && (
                              <span
                                title={`Repeats: ${issue.recurrenceRule}`}
                                style={{
                                  fontSize: 12,
                                  color: issue.recurrenceActive ? 'var(--xp-accent-strong)' : 'var(--xp-faint)',
                                  flexShrink: 0,
                                }}
                              >
                                ↻
                              </span>
                            )}
                          </span>
                          <span
                            data-cell="labels"
                            role="button"
                            aria-label="Change labels"
                            tabIndex={-1}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setFocusedIdx(flatIdx);
                              setPopover({
                                kind: 'labels',
                                anchor: e.currentTarget,
                                issueId: issue.id,
                              });
                            }}
                            style={{
                              display: 'inline-flex',
                              gap: 4,
                              flex: 'none',
                              cursor: 'pointer',
                              maxWidth: 220,
                              overflow: 'hidden',
                              alignItems: 'center',
                            }}
                          >
                            {(issue.labels ?? []).slice(0, 3).map((l) => (
                              <LabelChip key={l.id} label={l} />
                            ))}
                            {(issue.labels?.length ?? 0) === 0 && (
                              <span
                                aria-hidden
                                style={{
                                  width: 18,
                                  height: 14,
                                  borderRadius: 'var(--xp-r-pill)',
                                  border: '1px dashed var(--xp-muted)',
                                  opacity: 0.6,
                                }}
                              />
                            )}
                            {(issue.labels?.length ?? 0) > 3 && (
                              <span className="xp-mono xp-muted" style={{ fontSize: 10 }}>
                                +{(issue.labels?.length ?? 0) - 3}
                              </span>
                            )}
                          </span>
                          <span
                            data-cell="tags"
                            role="button"
                            aria-label="Change tags"
                            tabIndex={-1}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setFocusedIdx(flatIdx);
                              setPopover({
                                kind: 'tags',
                                anchor: e.currentTarget,
                                issueId: issue.id,
                              });
                            }}
                            style={{
                              display: 'inline-flex',
                              gap: 4,
                              flex: 'none',
                              cursor: 'pointer',
                              maxWidth: 180,
                              overflow: 'hidden',
                              alignItems: 'center',
                            }}
                          >
                            {(issue.tags ?? []).slice(0, 3).map((t) => (
                              <TagChip key={t.id} tag={t} />
                            ))}
                            {(issue.tags?.length ?? 0) > 3 && (
                              <span className="xp-mono xp-muted" style={{ fontSize: 10 }}>
                                +{(issue.tags?.length ?? 0) - 3}
                              </span>
                            )}
                          </span>
                          <span
                            data-cell="assignee"
                            role="button"
                            aria-label="Change assignee"
                            tabIndex={-1}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setFocusedIdx(flatIdx);
                              setPopover({
                                kind: 'assignee',
                                anchor: e.currentTarget,
                                issueId: issue.id,
                              });
                            }}
                            style={{ display: 'inline-flex', flex: 'none', cursor: 'pointer' }}
                          >
                            {issue.assigneeId ? (
                              <AgentAvatar name={nameForUser(issue.assigneeId, usersById)} src={issue.assigneeId ? usersById[issue.assigneeId]?.avatarUrl ?? undefined : undefined} size={18} isAgent={issue.assigneeId ? usersById[issue.assigneeId]?.isAgent : undefined} harness={issue.assigneeId ? usersById[issue.assigneeId]?.agentHarness : undefined} />
                            ) : (
                              <span
                                aria-hidden
                                style={{
                                  width: 18,
                                  height: 18,
                                  borderRadius: 'var(--xp-r-sm)',
                                  border: '1px dashed var(--xp-muted)',
                                }}
                              />
                            )}
                          </span>
                          <span
                            className="xp-mono"
                            style={{
                              fontSize: 10.5,
                              color: 'var(--xp-muted)',
                              width: 96,
                              textAlign: 'right',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {state?.name?.toUpperCase() ?? ''}
                          </span>
                          <span
                            className="xp-mono"
                            style={{
                              fontSize: 10.5,
                              color: 'var(--xp-faint)',
                              width: 60,
                              textAlign: 'right',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {formatRelative(issue.createdAt)}
                          </span>
                        </Link>
                        <div
                          className={isTriage ? undefined : 'xp-row-actions'}
                          style={{
                            position: 'absolute',
                            right: 10,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            display: 'inline-flex',
                            gap: 4,
                          }}
                        >
                          {isTriage && (
                            <>
                              <button
                                type="button"
                                className="xp-row-action-btn"
                                title="Accept → Backlog (T)"
                                aria-label="Accept to backlog"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  triageIssue(issue.id, 'backlog');
                                }}
                                style={{ fontSize: 11, width: 'auto', padding: '0 6px' }}
                              >
                                ✓
                              </button>
                              <button
                                type="button"
                                className="xp-row-action-btn"
                                title="Start now (S)"
                                aria-label="Start now"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  triageIssue(issue.id, 'started');
                                }}
                                style={{ fontSize: 11, width: 'auto', padding: '0 6px' }}
                              >
                                ▶
                              </button>
                              <button
                                type="button"
                                className="xp-row-action-btn"
                                title="Decline (D)"
                                aria-label="Decline"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  triageIssue(issue.id, 'canceled');
                                }}
                                style={{ fontSize: 11, width: 'auto', padding: '0 6px' }}
                              >
                                ✕
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            className="xp-row-action-btn"
                            title={favoriteIds.has(`issue:${issue.id}`) ? 'Unfavorite' : 'Favorite'}
                            aria-label="Toggle favorite"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              toggleFavorite('issue', issue.id, token);
                            }}
                            style={{
                              color: favoriteIds.has(`issue:${issue.id}`)
                                ? 'var(--xp-accent-strong)'
                                : undefined,
                            }}
                          >
                            {favoriteIds.has(`issue:${issue.id}`) ? '★' : '☆'}
                          </button>
                          <button
                            type="button"
                            className="xp-row-action-btn"
                            title="Copy issue link"
                            aria-label="Copy issue link"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const url = `${window.location.origin}/issues/${encodeURIComponent(issue.key)}`;
                              navigator.clipboard?.writeText(url).catch(() => {});
                            }}
                          >
                            ⎘
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {peekKey && (
        <IssuePeek
          issueKey={peekKey}
          states={states}
          onDeleted={(key) => setIssues((cur) => cur.filter((i) => i.key !== key))}
        />
      )}

      {popover &&
        (() => {
          const target = issues.find((i) => i.id === popover.issueId);
          if (!target) return null;
          const close = () => setPopover(null);
          if (popover.kind === 'state') {
            return (
              <StatePicker
                anchor={popover.anchor}
                states={states}
                currentStateId={target.stateId}
                onSelect={(stateId) => applyPatch(target.id, { stateId })}
                onClose={close}
              />
            );
          }
          if (popover.kind === 'priority') {
            return (
              <PriorityPicker
                anchor={popover.anchor}
                currentPriority={target.priority}
                onSelect={(priority) => applyPatch(target.id, { priority })}
                onClose={close}
              />
            );
          }
          if (popover.kind === 'labels') {
            const attachedIds = new Set((target.labels ?? []).map((l) => l.id));
            return (
              <LabelPicker
                anchor={popover.anchor}
                labels={allLabels}
                attachedIds={attachedIds}
                onToggle={(labelId, attach) => applyLabelToggle(target.id, labelId, attach)}
                onCreate={handleCreateLabel}
                onClose={close}
              />
            );
          }
          if (popover.kind === 'tags') {
            const attachedIds = new Set((target.tags ?? []).map((t) => t.id));
            return (
              <TagPicker
                anchor={popover.anchor}
                tags={allTags}
                attachedIds={attachedIds}
                onToggle={(tagId, attach) => applyTagToggle(target.id, tagId, attach)}
                onCreate={handleCreateTag}
                onClose={close}
              />
            );
          }
          return (
            <AssigneePicker
              anchor={popover.anchor}
              users={users}
              currentAssigneeId={target.assigneeId}
              onSelect={(assigneeId) => applyPatch(target.id, { assigneeId })}
              onClose={close}
            />
          );
        })()}

      {contextMenu.menu && (
        <IssueContextMenuPortal
          menu={contextMenu.menu}
          onClose={contextMenu.close}
          states={states}
          users={users}
          favoriteIds={favoriteIds}
          onOpen={(issue) =>
            navigate({
              pathname: `/issues/${encodeURIComponent(issue.key)}`,
              search: searchParams.toString(),
            })
          }
          onOpenNewTab={(issue) =>
            window.open(`/issues/${encodeURIComponent(issue.key)}`, '_blank')
          }
          onCopyLink={(issue) => {
            const url = `${window.location.origin}/issues/${encodeURIComponent(issue.key)}`;
            navigator.clipboard?.writeText(url).catch(() => {});
          }}
          onCopyKey={(issue) => {
            navigator.clipboard?.writeText(issue.key).catch(() => {});
          }}
          onSetState={(stateId) => {
            if (contextMenu.menu?.isBulk) {
              applyBulkPatch({ stateId });
            } else {
              applyPatch(contextMenu.menu!.issue.id, { stateId });
            }
          }}
          onSetPriority={(priority) => {
            if (contextMenu.menu?.isBulk) {
              applyBulkPatch({ priority });
            } else {
              applyPatch(contextMenu.menu!.issue.id, { priority });
            }
          }}
          onSetAssignee={(assigneeId) => {
            if (contextMenu.menu?.isBulk) {
              applyBulkPatch({ assigneeId });
            } else {
              applyPatch(contextMenu.menu!.issue.id, { assigneeId });
            }
          }}
          labels={allLabels}
          onToggleLabel={(labelId, attach) => {
            if (contextMenu.menu) {
              applyLabelToggle(contextMenu.menu.issue.id, labelId, attach);
            }
          }}
          onToggleBlocked={(issue) => {
            const next = !issue.blocked;
            if (contextMenu.menu?.isBulk) {
              applyBulkPatch({ blocked: next });
            } else {
              applyPatch(issue.id, { blocked: next });
            }
          }}
          onToggleFavorite={(issue) => toggleFavorite('issue', issue.id, token)}
          onDelete={(issue) => {
            // Bulk delete acts on the whole selection, not just the clicked card (XP-62).
            const bulk = contextMenu.menu?.isBulk && selectedIssues.length > 1;
            const targets = bulk ? selectedIssues : [issue];
            setDeleteDialog({
              open: true,
              keys: targets.map((i) => i.key),
              ids: targets.map((i) => i.id),
              message: bulk
                ? `Delete ${targets.length} selected issues? This cannot be undone.`
                : `Delete ${issue.key}? This cannot be undone.`,
            });
          }}
        />
      )}

      {bulkPopover &&
        (() => {
          const close = () => setBulkPopover(null);
          const commonStateId = commonValue(selectedIssues, (issue) => issue.stateId) ?? '';
          const commonPriority = commonValue(selectedIssues, (issue) => issue.priority) ?? -1;
          const commonAssigneeId = commonValue(selectedIssues, (issue) => issue.assigneeId) ?? null;
          if (bulkPopover.kind === 'state') {
            return (
              <StatePicker
                anchor={bulkPopover.anchor}
                states={states}
                currentStateId={commonStateId}
                onSelect={(stateId) => applyBulkPatch({ stateId })}
                onClose={close}
              />
            );
          }
          if (bulkPopover.kind === 'priority') {
            return (
              <PriorityPicker
                anchor={bulkPopover.anchor}
                currentPriority={commonPriority}
                onSelect={(priority) => applyBulkPatch({ priority })}
                onClose={close}
              />
            );
          }
          return (
            <AssigneePicker
              anchor={bulkPopover.anchor}
              users={users}
              currentAssigneeId={commonAssigneeId}
              onSelect={(assigneeId) => applyBulkPatch({ assigneeId })}
              onClose={close}
            />
          );
        })()}

      {/* The New-issue modal is mounted app-wide in AppLayout (GlobalQuickCreate),
          driven by the shared quick-create store — see XP-59. */}

      {/* Themed delete confirmation — replaces window.confirm */}
      <AlertDialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog((d) => ({ ...d, open }))}
        title="Delete issue"
        description={deleteDialog.message}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          const { keys, ids } = deleteDialog;
          if (keys.length === 0) return;
          const idSet = new Set(ids);
          Promise.all(keys.map((k) => api.deleteIssue(k, token)))
            .then(() => {
              setIssues((cur) => cur.filter((i) => !idSet.has(i.id)));
              setSelectedIds(new Set());
              pushToast('info', keys.length === 1 ? `Deleted ${keys[0]}` : `Deleted ${keys.length} issues`);
            })
            .catch(() => pushToast('danger', 'Some issues could not be deleted'));
        }}
      />
    </AppLayout>
  );
}

function BulkToolbar({
  count,
  allVisibleSelected,
  mixedVisibleSelection,
  bulkSaving,
  onToggleAll,
  onOpen,
  onClear,
}: {
  count: number;
  allVisibleSelected: boolean;
  mixedVisibleSelection: boolean;
  bulkSaving: boolean;
  onToggleAll: () => void;
  onOpen: (kind: 'state' | 'priority' | 'assignee', anchor: HTMLElement) => void;
  onClear: () => void;
}) {
  return (
    <div
      style={{
        position: 'sticky',
        top: 10,
        zIndex: 5,
        marginBottom: 12,
        border: '1px solid var(--xp-border)',
        borderRadius: 'var(--xp-r-sm)',
        background: 'var(--xp-layer)',
        boxShadow: 'var(--xp-shadow-1)',
        padding: '8px 10px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontFamily: 'var(--xp-font-mono)',
      }}
    >
      <Checkbox
        checked={allVisibleSelected}
        indeterminate={mixedVisibleSelection}
        onChange={onToggleAll}
        label={`${count} selected`}
      />
      <span style={{ flex: 1 }} />
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={bulkSaving}
        onClick={(e) => onOpen('state', e.currentTarget)}
      >
        State
      </Button>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={bulkSaving}
        onClick={(e) => onOpen('priority', e.currentTarget)}
      >
        Priority
      </Button>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={bulkSaving}
        onClick={(e) => onOpen('assignee', e.currentTarget)}
      >
        Assignee
      </Button>
      <button
        type="button"
        onClick={onClear}
        disabled={bulkSaving}
        className="xp-mono"
        style={{
          height: 28,
          padding: '0 8px',
          border: '1px solid transparent',
          background: 'transparent',
          color: 'var(--xp-muted)',
          cursor: bulkSaving ? 'default' : 'pointer',
          fontSize: 11,
          letterSpacing: 'var(--xp-track-caps)',
          textTransform: 'uppercase',
        }}
      >
        Clear
      </button>
    </div>
  );
}

function RowSelectionToggle({
  checked,
  onToggle,
}: {
  checked: boolean;
  onToggle: () => void;
}) {
  function toggleFromEvent(e: MouseEvent | KeyboardEvent) {
    e.preventDefault();
    e.stopPropagation();
    onToggle();
  }

  return (
    <span
      role="checkbox"
      aria-checked={checked}
      tabIndex={-1}
      onClick={toggleFromEvent}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') toggleFromEvent(e);
      }}
      style={{
        width: 16,
        height: 16,
        borderRadius: 'var(--xp-r-sm)',
        border: `1px solid ${checked ? 'var(--xp-accent-strong)' : 'var(--xp-input)'}`,
        background: checked ? 'var(--xp-accent)' : 'var(--xp-surface)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 'none',
        cursor: 'pointer',
      }}
    >
      {checked && (
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path
            d="M2 5 L4 7 L8 3"
            fill="none"
            stroke="var(--xp-accent-fg)"
            strokeLinecap="square"
            strokeWidth="1.6"
          />
        </svg>
      )}
    </span>
  );
}

function commonValue<T>(issues: Issue[], pick: (issue: Issue) => T): T | undefined {
  if (issues.length === 0) return undefined;
  const first = pick(issues[0]!);
  return issues.every((issue) => pick(issue) === first) ? first : undefined;
}

/** Filter chip — clickable pill matching the DS `Pill` look but with a button root. */
function FilterChip({
  children,
  active,
  onClick,
  leading,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
  leading?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 10px',
        height: 22,
        border: `1px solid ${active ? 'var(--xp-accent-strong)' : 'var(--xp-border)'}`,
        borderRadius: 'var(--xp-r-pill)',
        background: active ? 'var(--xp-accent-tint)' : 'var(--xp-surface)',
        color: active ? 'var(--xp-accent-strong)' : 'var(--xp-ink)',
        fontFamily: 'var(--xp-font-mono)',
        fontSize: 11,
        letterSpacing: 'var(--xp-track-snug)',
        cursor: 'pointer',
      }}
    >
      {leading}
      {children}
    </button>
  );
}

function SaveViewButton({
  filter,
  token,
}: {
  filter: ParsedFilter;
  token?: string | null;
}) {
  const createView = useViews((s) => s.create);
  const [saving, setSaving] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);

  const hasFilters =
    filter.stateIds.length > 0 ||
    filter.stateTypes.length > 0 ||
    filter.priorities.length > 0 ||
    filter.assigneeIds.length > 0 ||
    filter.q !== '';

  if (!hasFilters) return null;

  const doSave = async (name: string) => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const filters: Record<string, string> = {};
      if (filter.q) filters.q = filter.q;
      if (filter.stateIds.length > 0) filters.state = filter.stateIds.join(',');
      if (filter.stateTypes.length > 0) filters.stateType = filter.stateTypes.join(',');
      if (filter.priorities.length > 0) filters.priority = filter.priorities.join(',');
      if (filter.assigneeIds.length > 0) filters.assignee = filter.assigneeIds.join(',');
      if (filter.sort !== 'manual') filters.sort = filter.sort;
      if (filter.group !== 'none') filters.group = filter.group;
      if (filter.view !== 'board') filters.view = filter.view;
      await createView({ name: name.trim(), filters }, token);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        disabled={saving}
        onClick={() => setPromptOpen(true)}
        className="inline-flex items-center gap-[4px] px-[10px] h-[var(--xp-input-h)] border border-xp-border rounded-xp-sm bg-transparent text-xp-muted font-mono text-[11px] cursor-pointer whitespace-nowrap hover:text-xp-ink hover:border-xp-input disabled:opacity-50"
      >
        {saving ? '...' : 'Save view'}
      </button>
      <PromptDialog
        open={promptOpen}
        onOpenChange={setPromptOpen}
        title="Save current view"
        label="View name"
        placeholder="My view"
        onConfirm={doSave}
        confirmLabel="Save"
      />
    </>
  );
}
