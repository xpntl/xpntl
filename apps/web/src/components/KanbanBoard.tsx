import {
  Avatar,
  Input,
  IssueKey,
  Priority,
  StateDot,
  type WorkflowState as StateKind,
} from '@xpntl/ui';
import { type DragEvent, memo, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Issue, ProjectList, WorkflowState, WorkspaceUser } from '../lib/api';
import { confirm } from '../lib/confirm-store';
import type { GroupKey } from '../lib/filter-url';
import { priorityKind } from '../lib/format';
import type { IssueGroup } from '../lib/group-issues';
import { IssueRefText } from './IssueRefText';
import { LabelChip } from './LabelChip';
import { AgentAvatar } from './AgentBadge';
import { AssigneePicker, AssigneeStack } from './AssigneePicker';
import { CopyIssueId } from './CopyIssueId';
import { IssueTypeIcon } from './IssueTypeIcon';
import { useAutoGrowTextarea } from '../lib/use-auto-grow-textarea';

/* ── Kanban card surface (injected once) ──
   "Raised" look with no drop shadow: a top-lit bevel — lighter top border +
   faint highlight gradient at the top edge, grounded by a darker bottom border.
   The card reads as catching light from above. Theme-aware. */
const BOARD_STYLES = document.createElement('style');
BOARD_STYLES.textContent = `
  .xp-kanban-card {
    border: 1px solid var(--xp-border);
    border-bottom-color: rgba(0, 0, 0, 0.16);
    border-radius: 6px;
    background-color: var(--xp-canvas);
    background-image: linear-gradient(180deg, rgba(255, 255, 255, 0.55) 0%, rgba(255, 255, 255, 0) 46%);
    transition: transform 120ms ease, border-color 120ms ease;
  }
  .xp-kanban-card:hover {
    transform: translateY(-1px);
  }
  [data-theme="dark"] .xp-kanban-card {
    border-top-color: rgba(255, 255, 255, 0.14);
    border-bottom-color: rgba(0, 0, 0, 0.5);
    background-image: linear-gradient(180deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0) 52%);
  }
`;
if (typeof document !== 'undefined' && !document.getElementById('xp-board-styles')) {
  BOARD_STYLES.id = 'xp-board-styles';
  document.head.appendChild(BOARD_STYLES);
}

interface KanbanBoardProps {
  groups: IssueGroup[];
  groupBy: GroupKey;
  states: WorkflowState[];
  stateById: Map<string, WorkflowState>;
  usersById: Record<string, WorkspaceUser>;
  onPatch: (issueId: string, patch: Partial<Issue>) => void;
  onCreate?: (title: string, columnKey: string) => Promise<void>;
  onContextMenu?: (e: React.MouseEvent, issue: Issue) => void;
  onArchive?: (issueKey: string) => void;
  onSetAssignees?: (issueKey: string, userIds: string[]) => void;
  /** Lists for the active project (XP-74), keyed by id — used for list-column accent + labels. */
  listsById?: Record<string, ProjectList>;
  /** When grouping by list, these enable inline list management on the board. */
  onAddList?: (name: string) => void;
  onRenameList?: (listId: string, name: string) => void;
  onDeleteList?: (listId: string) => void;
  collapseEmpty?: boolean;
}

export function KanbanBoard({
  groups,
  groupBy,
  states,
  stateById,
  usersById,
  onPatch,
  onCreate,
  onContextMenu,
  onArchive,
  onSetAssignees,
  listsById,
  onAddList,
  onRenameList,
  onDeleteList,
  collapseEmpty = false,
}: KanbanBoardProps) {
  const navigate = useNavigate();
  const { projectKey } = useParams<{ projectKey?: string }>();
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const dragCountRef = useRef(new Map<string, number>());
  const [collapseOverrides, setCollapseOverrides] = useState<Map<string, boolean>>(new Map());

  // Horizontal edge fade when there are more columns than fit (mirrors the
  // per-column vertical fade, XP-70).
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hFade, setHFade] = useState({ left: false, right: false });
  const recomputeHFade = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setHFade((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  }, []);

  const allUsers = Object.values(usersById);

  // Board-only view rules (the list view is unaffected): hide the Triage and
  // Canceled columns entirely (Triage is reviewed on its own page, Canceled is
  // a terminal state), and sort the Done column most-recently-updated first.
  const boardGroups = groups
    .filter((g) => {
      if (groupBy !== 'state') return true;
      const t = stateById.get(g.key)?.type;
      return t !== 'canceled' && t !== 'triage';
    })
    .map((g) => {
      if (groupBy === 'state' && stateById.get(g.key)?.type === 'completed') {
        return {
          ...g,
          issues: g.issues
            .slice()
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
        };
      }
      return g;
    });

  const toggleCollapse = useCallback((key: string, forceState?: boolean) => {
    setCollapseOverrides((prev) => {
      const next = new Map(prev);
      const current = next.get(key);
      next.set(key, forceState ?? (current === undefined ? true : !current));
      return next;
    });
  }, []);

  // Recompute the horizontal fade when the column set changes (and on mount).
  useEffect(() => {
    recomputeHFade();
  }, [recomputeHFade, boardGroups.length]);

  const hFadeMask = hFade.left
    ? hFade.right
      ? 'linear-gradient(to right, transparent 0, #000 24px, #000 calc(100% - 24px), transparent 100%)'
      : 'linear-gradient(to right, transparent 0, #000 24px)'
    : hFade.right
      ? 'linear-gradient(to right, #000 calc(100% - 24px), transparent 100%)'
      : undefined;

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDragEnter = useCallback((e: DragEvent, columnKey: string) => {
    e.preventDefault();
    const counts = dragCountRef.current;
    counts.set(columnKey, (counts.get(columnKey) ?? 0) + 1);
    setDragOverKey(columnKey);
  }, []);

  const handleDragLeave = useCallback((_e: DragEvent, columnKey: string) => {
    const counts = dragCountRef.current;
    const next = (counts.get(columnKey) ?? 1) - 1;
    counts.set(columnKey, next);
    if (next <= 0) {
      counts.delete(columnKey);
      setDragOverKey((prev) => (prev === columnKey ? null : prev));
    }
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent, columnKey: string, dropIndex?: number) => {
      e.preventDefault();
      dragCountRef.current.clear();
      setDragOverKey(null);

      const issueId = e.dataTransfer.getData('text/plain');
      if (!issueId) return;

      const targetGroup = groups.find((g) => g.key === columnKey);
      const columnIssues = targetGroup?.issues ?? [];
      const isInSameColumn = columnIssues.some((i) => i.id === issueId);

      const patch: Partial<Issue> = {};

      if (groupBy === 'state' && !isInSameColumn) {
        patch.stateId = columnKey;
      } else if (groupBy === 'priority' && !isInSameColumn) {
        patch.priority = Number(columnKey);
      } else if (groupBy === 'assignee' && !isInSameColumn) {
        (patch as Record<string, unknown>).assigneeId =
          columnKey === '__unassigned' ? undefined : columnKey;
      } else if (groupBy === 'list' && !isInSameColumn) {
        patch.listId = columnKey === '__nolist' ? null : columnKey;
      }

      if (dropIndex !== undefined && dropIndex >= 0) {
        const filtered = columnIssues.filter((i) => i.id !== issueId);
        const above = filtered[dropIndex - 1];
        const below = filtered[dropIndex];
        let newSort: number;
        if (above && below) {
          newSort = (above.sortOrder + below.sortOrder) / 2;
        } else if (above) {
          newSort = above.sortOrder + 1;
        } else if (below) {
          newSort = below.sortOrder - 1;
        } else {
          newSort = 0;
        }
        patch.sortOrder = newSort;
      }

      if (Object.keys(patch).length > 0) {
        onPatch(issueId, patch);
      }
    },
    [groupBy, onPatch, groups],
  );

  const handleDragEnd = useCallback(() => {
    dragCountRef.current.clear();
    setDragOverKey(null);
  }, []);

  return (
    <div
      ref={scrollRef}
      className="xp-kanban-scroll"
      onDragEnd={handleDragEnd}
      onScroll={recomputeHFade}
      style={{
        display: 'flex',
        gap: 8,
        overflowX: 'auto',
        padding: '0 0 12px',
        flex: 1,
        minHeight: 0,
        alignItems: 'stretch',
        maskImage: hFadeMask,
        WebkitMaskImage: hFadeMask,
      }}
    >
      {boardGroups.map((group) => {
        const override = collapseOverrides.get(group.key);
        const isCollapsed = override !== undefined
          ? override
          : (collapseEmpty && group.issues.length === 0);
        const isDoneColumn = groupBy === 'state' && stateById.get(group.key)?.type === 'completed';
        return isCollapsed ? (
          <CollapsedColumn
            key={group.key}
            group={group}
            groupBy={groupBy}
            stateById={stateById}
            usersById={usersById}
            isDragOver={dragOverKey === group.key}
            onExpand={() => toggleCollapse(group.key, false)}
            onDragOver={handleDragOver}
            onDragEnter={(e) => handleDragEnter(e, group.key)}
            onDragLeave={(e) => handleDragLeave(e, group.key)}
            onDrop={(e) => handleDrop(e, group.key)}
          />
        ) : (
          <KanbanColumn
            key={group.key}
            group={group}
            groupBy={groupBy}
            stateById={stateById}
            usersById={usersById}
            users={allUsers}
            listColor={groupBy === 'list' ? listsById?.[group.key]?.color : undefined}
            onRenameList={groupBy === 'list' && group.key !== '__nolist' ? onRenameList : undefined}
            onDeleteList={groupBy === 'list' && group.key !== '__nolist' ? onDeleteList : undefined}
            isDragOver={dragOverKey === group.key}
            onCreate={onCreate}
            onPatch={onPatch}
            onArchive={isDoneColumn ? onArchive : undefined}
            onSetAssignees={onSetAssignees}
            onCollapse={() => toggleCollapse(group.key, true)}
            onDragOver={handleDragOver}
            onDragEnter={(e) => handleDragEnter(e, group.key)}
            onDragLeave={(e) => handleDragLeave(e, group.key)}
            onDrop={(e, dropIndex) => handleDrop(e, group.key, dropIndex)}
            onCardClick={(issue) => navigate({
              pathname: projectKey
                ? `/p/${encodeURIComponent(projectKey)}/board/${encodeURIComponent(issue.key)}`
                : `/issues/${encodeURIComponent(issue.key)}`,
              search: window.location.search,
            })}
            onCardContextMenu={onContextMenu}
          />
        );
      })}
      {groupBy === 'list' && onAddList && <AddListColumn onAddList={onAddList} />}
    </div>
  );
}

/** Trailing "+ Add list" column shown when grouping by list (XP-74). */
function AddListColumn({ onAddList }: { onAddList: (name: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  function submit() {
    const trimmed = name.trim();
    if (trimmed) onAddList(trimmed);
    setName('');
    setAdding(false);
  }

  return (
    <div style={{ minWidth: 200, flex: '0 0 200px' }}>
      {adding ? (
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={submit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') {
              setName('');
              setAdding(false);
            }
          }}
          placeholder="List name…"
          style={{
            width: '100%',
            height: 36,
            padding: '0 12px',
            fontFamily: 'var(--xp-font-mono)',
            fontSize: 12,
            background: 'var(--xp-surface)',
            border: '1px dashed var(--xp-border)',
            borderRadius: 8,
            color: 'var(--xp-ink)',
            outline: 'none',
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          style={{
            width: '100%',
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            fontFamily: 'var(--xp-font-mono)',
            fontSize: 11.5,
            fontWeight: 600,
            background: 'transparent',
            border: '1px dashed var(--xp-hairline)',
            borderRadius: 8,
            color: 'var(--xp-faint)',
            cursor: 'pointer',
          }}
        >
          + Add list
        </button>
      )}
    </div>
  );
}

function KanbanColumn({
  group,
  groupBy,
  stateById,
  usersById,
  users,
  listColor,
  onRenameList,
  onDeleteList,
  isDragOver,
  onCreate,
  onPatch,
  onArchive,
  onSetAssignees,
  onCollapse,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  onCardClick,
  onCardContextMenu,
}: {
  group: IssueGroup;
  groupBy: GroupKey;
  stateById: Map<string, WorkflowState>;
  usersById: Record<string, WorkspaceUser>;
  users: WorkspaceUser[];
  listColor?: string;
  onRenameList?: (listId: string, name: string) => void;
  onDeleteList?: (listId: string) => void;
  isDragOver: boolean;
  onCreate?: (title: string, columnKey: string) => Promise<void>;
  onPatch: (issueId: string, patch: Partial<Issue>) => void;
  onArchive?: (issueKey: string) => void;
  onSetAssignees?: (issueKey: string, userIds: string[]) => void;
  onCollapse: () => void;
  onDragOver: (e: DragEvent) => void;
  onDragEnter: (e: DragEvent) => void;
  onDragLeave: (e: DragEvent) => void;
  onDrop: (e: DragEvent, dropIndex?: number) => void;
  onCardClick: (issue: Issue) => void;
  onCardContextMenu?: (e: React.MouseEvent, issue: Issue) => void;
}) {
  // Derive accent color for column top border
  let columnAccentColor = 'var(--xp-hairline)';
  if (groupBy === 'state') {
    const state = stateById.get(group.key);
    if (state) columnAccentColor = `var(--xp-st-${state.type})`;
  } else if (groupBy === 'priority') {
    const p = Number(group.key);
    if (p === 1) columnAccentColor = 'var(--xp-danger, oklch(55% 0.22 25))';
    else if (p === 2) columnAccentColor = 'oklch(65% 0.16 60)';
    else if (p === 3) columnAccentColor = 'var(--xp-accent-strong)';
    else if (p === 4) columnAccentColor = 'var(--xp-muted)';
  } else if (groupBy === 'list' && listColor) {
    columnAccentColor = listColor;
  }

  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(group.label);

  const [adding, setAdding] = useState(false);
  const [addTitle, setAddTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useAutoGrowTextarea(inputRef, addTitle, 160);
  const listRef = useRef<HTMLUListElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const dropIdxRef = useRef<number>(-1);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  // XP-70: fade the top/bottom edge of the card list only when it's actually
  // scrollable in that direction, so it's obvious there's more above/below.
  const [scrollFade, setScrollFade] = useState({ top: false, bottom: false });
  const recomputeFade = useCallback(() => {
    const ul = listRef.current;
    if (!ul) return;
    const top = ul.scrollTop > 1;
    const bottom = ul.scrollTop + ul.clientHeight < ul.scrollHeight - 1;
    setScrollFade((prev) => (prev.top === top && prev.bottom === bottom ? prev : { top, bottom }));
  }, []);
  // Recompute when the card count changes (and on mount).
  useEffect(() => {
    recomputeFade();
  }, [recomputeFade, group.issues.length]);

  const fadeMask = scrollFade.top
    ? scrollFade.bottom
      ? 'linear-gradient(to bottom, transparent 0, #000 16px, #000 calc(100% - 16px), transparent 100%)'
      : 'linear-gradient(to bottom, transparent 0, #000 16px)'
    : scrollFade.bottom
      ? 'linear-gradient(to bottom, #000 calc(100% - 16px), transparent 100%)'
      : undefined;

  const positionIndicator = useCallback((idx: number) => {
    const el = indicatorRef.current;
    const ul = listRef.current;
    if (!el || !ul) return;
    if (idx < 0) {
      el.style.display = 'none';
      return;
    }
    const cards = Array.from(ul.querySelectorAll<HTMLElement>('[data-card-idx]'));
    let top: number;
    if (idx < cards.length) {
      top = cards[idx]!.offsetTop - 3;
    } else if (cards.length > 0) {
      const last = cards[cards.length - 1]!;
      top = last.offsetTop + last.offsetHeight + 3;
    } else {
      top = 0;
    }
    el.style.display = 'block';
    el.style.top = `${top}px`;
  }, []);

  const handleListDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const clientY = e.clientY;
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const ul = listRef.current;
      if (!ul) return;
      const cards = Array.from(ul.querySelectorAll<HTMLElement>('[data-card-idx]'));
      let idx = cards.length;
      for (let i = 0; i < cards.length; i++) {
        const rect = cards[i]!.getBoundingClientRect();
        if (clientY < rect.top + rect.height / 2) {
          idx = i;
          break;
        }
      }
      if (idx !== dropIdxRef.current) {
        dropIdxRef.current = idx;
        positionIndicator(idx);
      }
    });
  }, [positionIndicator]);

  const handleListDragLeave = useCallback((e: DragEvent) => {
    const ul = listRef.current;
    if (ul && !ul.contains(e.relatedTarget as Node)) {
      dropIdxRef.current = -1;
      positionIndicator(-1);
    }
  }, [positionIndicator]);

  const handleListDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const idx = dropIdxRef.current;
    dropIdxRef.current = -1;
    positionIndicator(-1);
    onDrop(e, idx >= 0 ? idx : undefined);
  }, [onDrop, positionIndicator]);

  async function handleSubmit(e?: { preventDefault: () => void }) {
    e?.preventDefault();
    if (!addTitle.trim() || !onCreate) return;
    setSaving(true);
    try {
      await onCreate(addTitle.trim(), group.key);
      setAddTitle('');
      setAdding(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      aria-label={group.label}
      data-drag-over={isDragOver || undefined}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        minWidth: 200,
        flex: '1 1 0',
        borderRadius: '8px',
        background: isDragOver ? 'var(--xp-layer)' : 'var(--xp-surface)',
        border: '1px solid var(--xp-hairline)',
        overflow: 'hidden',
        transition: 'background 120ms ease-out',
      }}
    >
      {/* XP-66: state color reads as an engineered baseline rule under the
          header, not a candy-bar cap on top of the column. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 14px 8px',
          borderBottom: `2px solid ${columnAccentColor}`,
        }}
      >
        <ColumnIcon
          groupBy={groupBy}
          columnKey={group.key}
          stateById={stateById}
          usersById={usersById}
          listColor={listColor}
        />
        {renaming && onRenameList ? (
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={() => {
              const next = renameValue.trim();
              if (next && next !== group.label) onRenameList(group.key, next);
              setRenaming(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') {
                setRenameValue(group.label);
                setRenaming(false);
              }
            }}
            style={{
              flex: 1,
              minWidth: 0,
              height: 20,
              padding: '0 4px',
              fontFamily: 'var(--xp-font-mono)',
              fontSize: 11.5,
              fontWeight: 600,
              background: 'var(--xp-canvas)',
              border: '1px solid var(--xp-border)',
              borderRadius: 'var(--xp-r-sm)',
              color: 'var(--xp-ink)',
              outline: 'none',
            }}
          />
        ) : (
          <span
            onDoubleClick={
              onRenameList
                ? () => {
                    setRenameValue(group.label);
                    setRenaming(true);
                  }
                : undefined
            }
            title={onRenameList ? 'Double-click to rename' : undefined}
            style={{
              fontFamily: 'var(--xp-font-mono)',
              fontSize: 11.5,
              fontWeight: 600,
              color: 'var(--xp-ink)',
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              cursor: onRenameList ? 'text' : undefined,
            }}
          >
            {group.label.toUpperCase()}
          </span>
        )}
        <span
          style={{
            fontFamily: 'var(--xp-font-mono)',
            fontSize: 10.5,
            color: 'var(--xp-faint)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {group.issues.length}
        </span>
        {onDeleteList && (
          <button
            type="button"
            onClick={async (e) => {
              e.stopPropagation();
              if (group.issues.length === 0) {
                onDeleteList(group.key);
                return;
              }
              const ok = await confirm({
                title: 'Delete list',
                message: `Delete list "${group.label}"? Its ${group.issues.length} issue(s) will be unfiled, not deleted.`,
                confirmLabel: 'Delete',
                variant: 'danger',
              });
              if (ok) onDeleteList(group.key);
            }}
            title="Delete list"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 20,
              height: 20,
              padding: 0,
              border: 0,
              borderRadius: 'var(--xp-r-sm)',
              background: 'transparent',
              color: 'var(--xp-faint)',
              cursor: 'pointer',
              opacity: 0,
              transition: 'opacity 120ms',
            }}
            className="xp-col-collapse"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M3 3l6 6M9 3l-6 6" />
            </svg>
          </button>
        )}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onCollapse(); }}
          title="Collapse column"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 20,
            height: 20,
            padding: 0,
            border: 0,
            borderRadius: 'var(--xp-r-sm)',
            background: 'transparent',
            color: 'var(--xp-faint)',
            cursor: 'pointer',
            opacity: 0,
            transition: 'opacity 120ms',
          }}
          className="xp-col-collapse"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 2L4 6l4 4" />
          </svg>
        </button>
      </div>
      <ul
        ref={listRef}
        onScroll={recomputeFade}
        onDragOver={handleListDragOver}
        onDragLeave={handleListDragLeave}
        onDrop={handleListDrop}
        onDragStart={(e) => {
          const card = (e.target as HTMLElement).closest<HTMLElement>('[data-issue-id]');
          if (!card) return;
          e.dataTransfer.setData('text/plain', card.dataset.issueId!);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onClick={(e) => {
          const card = (e.target as HTMLElement).closest<HTMLElement>('[data-issue-id]');
          if (!card) return;
          // Don't navigate if the click came from inside the assignee picker
          if ((e.target as HTMLElement).closest('[data-assignee-picker]')) return;
          const issue = group.issues.find((i) => i.id === card.dataset.issueId);
          if (issue) onCardClick(issue);
        }}
        onContextMenu={onCardContextMenu ? (e) => {
          const card = (e.target as HTMLElement).closest<HTMLElement>('[data-issue-id]');
          if (!card) return;
          const issue = group.issues.find((i) => i.id === card.dataset.issueId);
          if (issue) onCardContextMenu(e, issue);
        } : undefined}
        style={{
          listStyle: 'none',
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          padding: 8,
          overflowY: 'auto',
          flex: 1,
          minHeight: 80,
          position: 'relative',
          maskImage: fadeMask,
          WebkitMaskImage: fadeMask,
        }}
      >
        <div
          ref={indicatorRef}
          style={{
            display: 'none',
            position: 'absolute',
            left: 4,
            right: 4,
            height: 2,
            background: 'var(--xp-accent)',
            borderRadius: 1,
            pointerEvents: 'none',
            zIndex: 2,
          }}
        />
        {group.issues.map((issue, i) => (
          <li key={issue.id} data-card-idx={i} style={{ listStyle: 'none' }}>
            <KanbanCard
              issue={issue}
              stateById={stateById}
              usersById={usersById}
              users={users}
              onPatch={onPatch}
              onArchive={onArchive}
              onSetAssignees={onSetAssignees}
            />
          </li>
        ))}
        {group.issues.length === 0 && !adding && (
          <li
            style={{
              margin: '2px',
              padding: '18px 8px',
              textAlign: 'center',
              fontFamily: 'var(--xp-font-mono)',
              fontSize: 10.5,
              letterSpacing: 'var(--xp-track-meta)',
              color: 'var(--xp-faint)',
              border: '1px dashed var(--xp-hairline)',
              borderRadius: 6,
            }}
          >
            Drop issues here
          </li>
        )}
      </ul>
      {onCreate && (
        <div style={{ padding: '0 8px 8px' }}>
          {adding ? (
            <form onSubmit={handleSubmit}>
              <textarea
                ref={inputRef}
                rows={1}
                value={addTitle}
                onChange={(e) => setAddTitle(e.target.value)}
                onBlur={() => {
                  if (!addTitle.trim()) setAdding(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    // Enter submits; Shift+Enter inserts a newline (XP-85).
                    e.preventDefault();
                    void handleSubmit();
                  } else if (e.key === 'Escape') {
                    setAdding(false);
                    setAddTitle('');
                  }
                }}
                disabled={saving}
                placeholder="Issue title"
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  border: '1px solid var(--xp-border)',
                  borderRadius: 'var(--xp-r-sm)',
                  background: 'var(--xp-canvas)',
                  fontFamily: 'var(--xp-font-mono)',
                  fontSize: 12,
                  lineHeight: 1.4,
                  color: 'var(--xp-ink)',
                  outline: 'none',
                  resize: 'none',
                  display: 'block',
                  boxSizing: 'border-box',
                }}
              />
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              style={{
                width: '100%',
                padding: '4px 0',
                border: 0,
                borderRadius: 'var(--xp-r-sm)',
                background: 'transparent',
                fontFamily: 'var(--xp-font-mono)',
                fontSize: 14,
                color: 'var(--xp-faint)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              +
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function CollapsedColumn({
  group,
  groupBy,
  stateById,
  usersById,
  isDragOver,
  onExpand,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
}: {
  group: IssueGroup;
  groupBy: GroupKey;
  stateById: Map<string, WorkflowState>;
  usersById: Record<string, WorkspaceUser>;
  isDragOver: boolean;
  onExpand: () => void;
  onDragOver: (e: DragEvent) => void;
  onDragEnter: (e: DragEvent) => void;
  onDragLeave: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
}) {
  return (
    <section
      aria-label={group.label}
      data-drag-over={isDragOver || undefined}
      onClick={onExpand}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{
        width: 36,
        minWidth: 36,
        flex: 'none',
        borderRadius: 'var(--xp-r-sm)',
        background: isDragOver ? 'var(--xp-layer)' : 'var(--xp-surface)',
        border: '1px solid var(--xp-hairline)',
        transition: 'background 120ms ease-out',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: 10,
        gap: 8,
        cursor: 'pointer',
      }}
    >
      <ColumnIcon
        groupBy={groupBy}
        columnKey={group.key}
        stateById={stateById}
        usersById={usersById}
      />
      {group.issues.length > 0 && (
        <span
          style={{
            fontFamily: 'var(--xp-font-mono)',
            fontSize: 10,
            color: 'var(--xp-faint)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {group.issues.length}
        </span>
      )}
      <span
        style={{
          writingMode: 'vertical-lr',
          textOrientation: 'mixed',
          fontFamily: 'var(--xp-font-mono)',
          fontSize: 10.5,
          fontWeight: 600,
          color: 'var(--xp-faint)',
          letterSpacing: '0.04em',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxHeight: 'calc(100% - 30px)',
        }}
      >
        {group.label.toUpperCase()}
      </span>
    </section>
  );
}

function ChecklistBar({ total, checked }: { total: number; checked: number }) {
  const pct = Math.round((checked / total) * 100);
  const done = pct === 100;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div
        style={{
          flex: 1,
          height: 4,
          borderRadius: 2,
          background: 'var(--xp-hairline)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            borderRadius: 2,
            background: done ? 'var(--xp-success, #22c55e)' : 'var(--xp-accent-strong)',
            transition: 'width 0.2s ease',
          }}
        />
      </div>
      <span style={{ fontSize: 10, color: 'var(--xp-faint)', whiteSpace: 'nowrap' }}>
        {checked}/{total}
      </span>
    </div>
  );
}

const KanbanCard = memo(function KanbanCard({
  issue,
  stateById,
  usersById,
  users,
  onPatch,
  onArchive,
  onSetAssignees,
}: {
  issue: Issue;
  stateById: Map<string, WorkflowState>;
  usersById: Record<string, WorkspaceUser>;
  users: WorkspaceUser[];
  onPatch: (issueId: string, patch: Partial<Issue>) => void;
  onArchive?: (issueKey: string) => void;
  onSetAssignees?: (issueKey: string, userIds: string[]) => void;
}) {
  const state = stateById.get(issue.stateId);
  // Multi-assignee (XP-72): prefer the assignees[] list, fall back to the
  // legacy single assigneeId so older payloads still render an avatar.
  const legacyAssignee = issue.assigneeId ? usersById[issue.assigneeId] : undefined;
  const assigneeList: WorkspaceUser[] =
    issue.assignees && issue.assignees.length > 0
      ? issue.assignees
      : legacyAssignee
        ? [legacyAssignee]
        : [];
  const primaryAssignee = assigneeList[0];
  const assigneeName = primaryAssignee
    ? (primaryAssignee.displayName ?? primaryAssignee.email)
    : null;

  /* ── due date helpers ── */
  const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  let dueDateLabel: string | null = null;
  let dueDateColor = 'var(--xp-faint)';
  let dueDateBold = false;
  if (issue.dueDate) {
    const d = new Date(issue.dueDate);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const due = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);
    dueDateLabel = `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}`;
    // XP-101: completed/canceled tasks shouldn't render as overdue — the work is done.
    const isClosed = state?.type === 'completed' || state?.type === 'canceled';
    if (diffDays < 0 && !isClosed) {
      dueDateLabel = 'Overdue';
      dueDateColor = 'var(--xp-danger, oklch(55% 0.22 25))';
      dueDateBold = true;
    } else if (diffDays <= 3 && !isClosed) {
      dueDateColor = 'oklch(65% 0.16 60)';
    }
  }

  return (
      <div
        data-issue-id={issue.id}
        draggable
        className="xp-kanban-card"
        style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 5,
          padding: '10px 12px',
          cursor: 'grab',
          fontFamily: 'var(--xp-font-mono)',
          textAlign: 'left',
          // XP-88: blocked issues get a deep-red border.
          border: issue.blocked ? '1.5px solid var(--xp-danger)' : '1.5px solid transparent',
          borderRadius: 'var(--xp-r-sm)',
        }}
      >
        {/* Row 1: type + key + state dot + priority + recurrence + archive (Done only) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <IssueTypeIcon type={issue.type} size={12} />
          <CopyIssueId id={issue.id} issueKey={issue.key}>
            <IssueKey size="sm">{issue.key}</IssueKey>
          </CopyIssueId>
          {state && <StateDot kind={state.type as StateKind} size={11} />}
          {issue.blocked && (
            <span
              title="Blocked"
              style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--xp-danger)', textTransform: 'uppercase' }}
            >
              Blocked
            </span>
          )}
          <span style={{ flex: 1 }} />
          {onArchive && (
            <button
              type="button"
              title="Archive"
              aria-label="Archive issue"
              onClick={(e) => { e.stopPropagation(); onArchive(issue.key); }}
              className="xp-card-archive"
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 18, height: 18, padding: 0, border: 0, background: 'transparent',
                color: 'var(--xp-faint)', cursor: 'pointer', borderRadius: 4,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="square" aria-hidden>
                <rect x="2" y="3" width="10" height="2.5" />
                <path d="M3 5.5V11a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V5.5" />
                <path d="M5.5 8h3" />
              </svg>
            </button>
          )}
          <Priority kind={priorityKind(issue.priority)} size={12} />
          {issue.recurrenceRule && (
            <span
              title={`Repeats: ${issue.recurrenceRule}`}
              style={{ fontSize: 12, color: issue.recurrenceActive ? 'var(--xp-accent-strong)' : 'var(--xp-faint)' }}
            >
              ↻
            </span>
          )}
        </div>

        {/* Row 2: title */}
        <div
          style={{
            fontSize: 12.5,
            lineHeight: 1.45,
            fontWeight: 500,
            fontFamily: 'var(--xp-font-mono)',
            color: 'var(--xp-ink)',
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          <IssueRefText text={issue.title} />
        </div>

        {/* Row 3: due date (bottom-left) + assignee (bottom-right).
            minWidth:0 + a truncating date keep the avatar stack inside the
            card's right edge even when space is tight (XP-87). */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
          {dueDateLabel && (
            <span
              style={{
                fontSize: 10,
                fontFamily: 'var(--xp-font-mono)',
                color: dueDateColor,
                fontWeight: dueDateBold ? 700 : 400,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                minWidth: 0,
              }}
            >
              {dueDateLabel}
            </span>
          )}
          <span style={{ flex: 1, minWidth: 8 }} />
          <div style={{ flexShrink: 0 }}>
            <AssigneePicker
              users={users}
              selectedIds={assigneeList.map((u) => u.id)}
              onChange={(ids) => {
                if (onSetAssignees) onSetAssignees(issue.key, ids);
                else onPatch(issue.id, { assigneeId: ids[0] ?? null } as Partial<Issue>);
              }}
              title={assigneeList.length > 1 ? `${assigneeList.length} assignees` : (assigneeName ?? 'Assign')}
            >
              <AssigneeStack assignees={assigneeList} size={20} />
            </AssigneePicker>
          </div>
        </div>

        {/* Row 4: labels (only if any) */}
        {(issue.labels?.length ?? 0) > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            {(issue.labels ?? []).slice(0, 3).map((l) => (
              <LabelChip key={l.id} label={l} />
            ))}
            {(issue.labels?.length ?? 0) > 3 && (
              <span style={{ fontSize: 10, color: 'var(--xp-faint)' }}>
                +{(issue.labels?.length ?? 0) - 3}
              </span>
            )}
          </div>
        )}

        {/* Row 5: checklist bar (only if applicable) */}
        {issue.checklistProgress && issue.checklistProgress.total > 0 && (
          <ChecklistBar total={issue.checklistProgress.total} checked={issue.checklistProgress.checked} />
        )}
      </div>
  );
});

function ColumnIcon({
  groupBy,
  columnKey,
  stateById,
  usersById,
  listColor,
}: {
  groupBy: GroupKey;
  columnKey: string;
  stateById: Map<string, WorkflowState>;
  usersById: Record<string, WorkspaceUser>;
  listColor?: string;
}) {
  if (groupBy === 'list') {
    return (
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: columnKey === '__nolist' ? 'transparent' : (listColor ?? 'var(--xp-muted)'),
          border: columnKey === '__nolist' ? '1px dashed var(--xp-muted)' : 'none',
          display: 'inline-block',
          flexShrink: 0,
        }}
      />
    );
  }
  if (groupBy === 'state') {
    const state = stateById.get(columnKey);
    if (state) return <StateDot kind={state.type as StateKind} size={14} />;
  }
  if (groupBy === 'priority') {
    const p = Number(columnKey);
    if (!Number.isNaN(p)) return <Priority kind={priorityKind(p)} size={14} />;
  }
  if (groupBy === 'assignee') {
    if (columnKey === '__unassigned') {
      return (
        <span
          style={{
            width: 14,
            height: 14,
            borderRadius: 'var(--xp-r-sm)',
            border: '1px dashed var(--xp-muted)',
            display: 'inline-block',
          }}
        />
      );
    }
    const user = usersById[columnKey];
    if (user) return <AgentAvatar name={user.displayName ?? user.email} src={user.avatarUrl ?? undefined} size={14} isAgent={user.isAgent} harness={user.agentHarness} />;
  }
  return null;
}
