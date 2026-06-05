// apps/web/src/components/IssuePeek.tsx
//
// PER-106 — Slide-over peek. When the URL is /issues/:key, this opens over
// the list and fetches the issue. ESC / outside-click closes → returns to
// /issues while preserving any filter query params. The ↗ button promotes
// to the full-page route at /issues/:key/full.

import { Avatar, DropdownMenu, IssueKey, Kbd, Priority, Select, SlideOver, Spinner, StateDot } from '@xpntl/ui';
import { AgentAvatar, HarnessPill } from './AgentBadge';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DatePicker } from './DatePicker';
import {
  type ActivityEntry,
  type Comment,
  FetchError,
  type Issue,
  type IssueRelation,
  type Milestone,
  type ReactionSummary,
  type WorkflowState,
  type WorkspaceUser,
  api,
} from '../lib/api';
import { useAuth } from '../lib/auth-store';
import { confirm } from '../lib/confirm-store';
import { formatRelative, priorityLabel } from '../lib/format';
import { EditableValue, overviewRowStyle } from './overview-field';
import { AssigneePicker, AssigneeStack } from './AssigneePicker';
import { CopyIssueId } from './CopyIssueId';
import { IssueTypeIcon, issueTypeLabel } from './IssueTypeIcon';
import { PRIORITY_SELECT_OPTIONS, TYPE_SELECT_OPTIONS, stateSelectOptions } from '../lib/select-options';
import { pushRecentIssue } from '../lib/recent-issues';
import { useToasts } from '../lib/toast-store';
import { nameForUser, useUsers } from '../lib/user-store';
import { CoverImage } from './CoverImage';
import { IssueRefText } from './IssueRefText';
import { LabelChip } from './LabelChip';
import { TagChip } from './TagChip';
import { RecurrenceEditor } from './RecurrenceEditor';
import { RelationCreator } from './RelationCreator';
import { extractMentionIds } from './MentionSuggestion';
import { RichTextEditor } from './RichTextEditor';
import { RichTextRenderer } from './RichTextRenderer';
import { PresenceDots } from './PresenceDots';

interface IssuePeekProps {
  issueKey: string;
  states: WorkflowState[];
  /** Remove the issue from the parent list after it's deleted from the peek. */
  onDeleted?: (key: string) => void;
}

export function IssuePeek({ issueKey, states, onDeleted }: IssuePeekProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = useAuth();
  const usersById = useUsers((s) => s.byId);

  const [issue, setIssue] = useState<Issue | null>(null);
  const [reactions, setReactions] = useState<ReactionSummary[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [subIssues, setSubIssues] = useState<Issue[]>([]);
  const [relations, setRelations] = useState<IssueRelation[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pushToast = useToasts((s) => s.push);
  const [newComment, setNewComment] = useState('');
  const [posting, setPosting] = useState(false);

  // Click-to-edit overview fields (state / priority / assignee), matching IssueDetail.
  const [editingField, setEditingField] = useState<'state' | 'priority' | 'type' | 'assignee' | null>(null);

  // XP-94: inline-editable title in the peek (auto-saves on blur/Enter).
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const revertTitleRef = useRef(false);

  // Optimistically persist a single overview field.
  async function patchIssue(patch: Parameters<typeof api.updateIssue>[1]) {
    if (!issue) return;
    const previous = issue;
    setIssue({ ...issue, ...patch });
    setEditingField(null);
    try {
      const result = await api.updateIssue(issue.key, patch, token);
      setIssue(result.issue);
    } catch {
      setIssue(previous);
      pushToast('danger', 'Failed to update issue');
    }
  }

  // Multi-assignee: set the full assignee list (XP-72 parity for the peek).
  async function setAssigneesOptimistic(ids: string[]) {
    if (!issue) return;
    const previous = issue;
    const nextAssignees = ids.map((id) => usersById[id]).filter(Boolean) as WorkspaceUser[];
    setIssue({ ...issue, assignees: nextAssignees, assigneeId: ids[0] ?? null });
    try {
      await api.setAssignees(issue.key, ids, token);
    } catch {
      setIssue(previous);
      pushToast('danger', 'Failed to update assignees');
    }
  }

  // Inline description editing (XP-68)
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const [savingDesc, setSavingDesc] = useState(false);

  // XP-84: auto-save on blur — no Save button. `html` comes from the editor's
  // blur event so we persist the very latest content even if state lags.
  async function handleSaveDescription(html?: string) {
    if (!issue || savingDesc) return;
    const next = html ?? descDraft;
    if (next === (issue.description ?? '')) {
      setEditingDesc(false);
      return;
    }
    setSavingDesc(true);
    try {
      const { issue: updated } = await api.updateIssue(issue.key, { description: next }, token);
      setIssue((cur) => (cur ? { ...cur, description: updated.description } : updated));
      setEditingDesc(false);
    } catch {
      pushToast('danger', 'Failed to save description');
    } finally {
      setSavingDesc(false);
    }
  }

  // Sub-issue creation state
  const [showSubIssueForm, setShowSubIssueForm] = useState(false);
  const [subIssueTitle, setSubIssueTitle] = useState('');
  const [subIssueStateId, setSubIssueStateId] = useState('');
  const [subIssueAssigneeId, setSubIssueAssigneeId] = useState('');
  const [creatingSubIssue, setCreatingSubIssue] = useState(false);
  const workspaceUsers = Object.values(usersById);

  async function handleCreateSubIssue(e: FormEvent) {
    e.preventDefault();
    if (!subIssueTitle.trim() || !issue) return;
    setCreatingSubIssue(true);
    try {
      const input: Parameters<typeof api.createIssue>[0] = {
        title: subIssueTitle.trim(),
        projectId: issue.projectId ?? '',
        parentId: issue.id,
      };
      if (subIssueStateId) input.stateId = subIssueStateId;
      if (subIssueAssigneeId) input.assigneeId = subIssueAssigneeId;
      const result = await api.createIssue(input, token);
      setSubIssues((cur) => [...cur, result.issue]);
      setSubIssueTitle('');
      setSubIssueStateId('');
      setSubIssueAssigneeId('');
      setShowSubIssueForm(false);
    } catch (err) {
      setError(err instanceof FetchError ? err.message : 'Failed to create sub-issue');
    } finally {
      setCreatingSubIssue(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      api.getIssue(issueKey, token),
      api.listComments(issueKey, token),
      api.listSubIssues(issueKey, token),
      api.listActivity(issueKey, { limit: 6 }, token),
    ])
      .then(([d, c, s, a]) => {
        if (cancelled) return;
        setIssue(d.issue);
        setReactions(d.reactions);
        setComments(c.comments);
        setSubIssues(s.issues);
        setRelations(d.relations);
        setActivity(a.activity);
        pushRecentIssue({ key: d.issue.key, title: d.issue.title });
        api.pushRecentIssue(d.issue.key, d.issue.title, token).catch(() => {});
        if (d.issue.projectId) {
          api.listMilestones(d.issue.projectId, token).then((r) => {
            if (!cancelled) setMilestones(r.milestones);
          }).catch(() => {});
        }
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof FetchError && err.status === 404) {
          setError('Issue not found');
        } else {
          setError(err instanceof FetchError ? err.message : 'Failed to load issue');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [issueKey, token]);

  const handleClose = () => {
    // Strip just the path segment after /issues, keep ?filters.
    navigate({ pathname: '/issues', search: location.search }, { replace: false });
  };

  const handleOpenFull = () => {
    navigate({ pathname: `/issues/${encodeURIComponent(issueKey)}/full`, search: location.search });
  };

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/issues/${encodeURIComponent(issueKey)}`,
      );
      pushToast('info', 'Link copied');
    } catch {
      pushToast('warn', 'Could not copy link');
    }
  }

  async function handleDelete() {
    if (!issue) return;
    const ok = await confirm({
      title: 'Delete issue',
      message: `Delete ${issue.key}? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await api.deleteIssue(issue.key, token);
      onDeleted?.(issue.key);
      pushToast('info', `Deleted ${issue.key}`);
      handleClose();
    } catch (err) {
      pushToast('danger', err instanceof FetchError ? err.message : 'Failed to delete issue');
    }
  }

  async function handlePostComment(e: FormEvent) {
    e.preventDefault();
    if (!newComment.trim()) return;
    setPosting(true);
    setError(null);
    try {
      const mentionIds = extractMentionIds(newComment);
      const result = await api.createComment(issueKey, newComment.trim(), token, mentionIds);
      setComments((current) => [...current, result.comment]);
      setNewComment('');
      const { activity } = await api.listActivity(issueKey, { limit: 6 }, token);
      setActivity(activity);
      pushToast('success', 'Comment posted');
    } catch (err) {
      setError(err instanceof FetchError ? err.message : 'Failed to post comment');
    } finally {
      setPosting(false);
    }
  }

  const state = issue ? states.find((s) => s.id === issue.stateId) : null;
  const stateKind: 'triage' | 'backlog' | 'unstarted' | 'started' | 'completed' | 'canceled' =
    (state?.type as never) ?? 'unstarted';

  // Multi-assignee list: prefer assignees[], fall back to the legacy single id.
  const peekAssignees: WorkspaceUser[] = issue
    ? issue.assignees && issue.assignees.length > 0
      ? issue.assignees
      : issue.assigneeId && usersById[issue.assigneeId]
        ? [usersById[issue.assigneeId]!]
        : []
    : [];

  return (
    <SlideOver
      open
      onClose={handleClose}
      breadcrumb={`workspace / ${issueKey.toLowerCase()}`}
      width={480}
    >
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--xp-muted)' }}>
          <Spinner /> <span>Loading {issueKey}</span>
        </div>
      )}

      {error && <div style={{ color: 'var(--xp-danger)' }}>{error}</div>}

      {issue && !loading && !error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {issue.coverBlobRef && (
            <CoverImage
              issueKey={issueKey}
              coverUrl={issue.coverBlobRef}
              coverPosition={issue.coverPosition}
              token={token}
              onUpdate={(coverUrl, coverPosition) =>
                setIssue((prev) =>
                  prev ? { ...prev, coverBlobRef: coverUrl, coverPosition } : prev,
                )
              }
              compact
            />
          )}

          {/* Strip: current state glyph + key + presence + open-full.
              State/priority/assignee are editable below in the Overview. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <StateDot kind={stateKind} size={14} />
            <CopyIssueId id={issue.id} issueKey={issue.key}>
              <IssueKey>{issue.key}</IssueKey>
            </CopyIssueId>
            <span style={{ flex: 1 }} />
            <PresenceDots issueId={issue.id} size={18} />
            <DropdownMenu
              trigger={
                <button
                  type="button"
                  title="More actions"
                  aria-label="More actions"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    background: 'var(--xp-canvas)',
                    border: '1px solid var(--xp-border)',
                    borderRadius: 'var(--xp-r-sm)',
                    color: 'var(--xp-ink)',
                    cursor: 'pointer',
                    fontFamily: 'var(--xp-font-mono)',
                    fontSize: 14,
                    padding: '1px 8px',
                    lineHeight: 1,
                  }}
                >
                  ⋮
                </button>
              }
              items={[
                { label: 'Open full view', onSelect: handleOpenFull, shortcut: '↗' },
                { label: 'Copy link', onSelect: handleCopyLink },
                { label: 'Delete issue', onSelect: handleDelete, danger: true },
              ]}
            />
          </div>

          {/* Title — click to edit inline (XP-94); issue refs render as links */}
          {editingTitle ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => {
                if (revertTitleRef.current) {
                  revertTitleRef.current = false;
                  setEditingTitle(false);
                  return;
                }
                const next = titleDraft.trim();
                setEditingTitle(false);
                if (next && next !== issue.title) void patchIssue({ title: next });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.currentTarget.blur();
                } else if (e.key === 'Escape') {
                  revertTitleRef.current = true;
                  e.currentTarget.blur();
                }
              }}
              style={{
                fontSize: 17,
                fontWeight: 600,
                letterSpacing: 'var(--xp-track-tight)',
                lineHeight: 1.2,
                width: '100%',
                boxSizing: 'border-box',
                border: '1px solid var(--xp-border)',
                borderRadius: 'var(--xp-r-sm)',
                background: 'var(--xp-canvas)',
                color: 'var(--xp-ink)',
                padding: '4px 8px',
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />
          ) : (
            <div
              role="button"
              tabIndex={0}
              title="Click to edit title"
              onClick={() => {
                setTitleDraft(issue.title);
                setEditingTitle(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setTitleDraft(issue.title);
                  setEditingTitle(true);
                }
              }}
              style={{
                fontSize: 17,
                fontWeight: 600,
                letterSpacing: 'var(--xp-track-tight)',
                lineHeight: 1.2,
                cursor: 'text',
                borderRadius: 'var(--xp-r-sm)',
              }}
            >
              <IssueRefText text={issue.title} />
            </div>
          )}

          {/* Overview — shared visual system with IssueDetail (overview-field) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* State — click to edit */}
            {editingField === 'state' ? (
              <div style={overviewRowStyle}>
                <span className="xp-meta">STATE</span>
                <Select
                  value={issue.stateId}
                  onValueChange={(v) => patchIssue({ stateId: v })}
                  options={stateSelectOptions(states)}
                />
              </div>
            ) : (
              <div
                role="button"
                tabIndex={0}
                onClick={() => setEditingField('state')}
                onKeyDown={(e) => e.key === 'Enter' && setEditingField('state')}
                className="xp-editable-row"
                style={{ ...overviewRowStyle, cursor: 'pointer' }}
              >
                <span className="xp-meta">STATE</span>
                <EditableValue>
                  <StateDot kind={stateKind} size={12} />
                  <span>{states.find((s) => s.id === issue.stateId)?.name ?? 'None'}</span>
                </EditableValue>
              </div>
            )}

            {/* Priority — click to edit (XP-84: now settable from the peek) */}
            {editingField === 'priority' ? (
              <div style={overviewRowStyle}>
                <span className="xp-meta">PRIORITY</span>
                <Select
                  value={String(issue.priority)}
                  onValueChange={(v) => patchIssue({ priority: Number.parseInt(v, 10) || 0 })}
                  options={PRIORITY_SELECT_OPTIONS}
                />
              </div>
            ) : (
              <div
                role="button"
                tabIndex={0}
                onClick={() => setEditingField('priority')}
                onKeyDown={(e) => e.key === 'Enter' && setEditingField('priority')}
                className="xp-editable-row"
                style={{ ...overviewRowStyle, cursor: 'pointer' }}
              >
                <span className="xp-meta">PRIORITY</span>
                <EditableValue muted={issue.priority === 0}>
                  <Priority kind={priorityKind(issue.priority)} size={12} />
                  <span>{priorityLabel(issue.priority)}</span>
                </EditableValue>
              </div>
            )}

            {/* Type — click to edit (XP-88) */}
            {editingField === 'type' ? (
              <div style={overviewRowStyle}>
                <span className="xp-meta">TYPE</span>
                <Select
                  value={issue.type}
                  onValueChange={(v) => patchIssue({ type: v })}
                  options={TYPE_SELECT_OPTIONS}
                />
              </div>
            ) : (
              <div
                role="button"
                tabIndex={0}
                onClick={() => setEditingField('type')}
                onKeyDown={(e) => e.key === 'Enter' && setEditingField('type')}
                className="xp-editable-row"
                style={{ ...overviewRowStyle, cursor: 'pointer' }}
              >
                <span className="xp-meta">TYPE</span>
                <EditableValue>
                  <IssueTypeIcon type={issue.type} size={12} />
                  <span>{issueTypeLabel(issue.type)}</span>
                </EditableValue>
              </div>
            )}

            {/* Blocked — toggle (XP-88) */}
            <div className="xp-editable-row" style={overviewRowStyle}>
              <span className="xp-meta">BLOCKED</span>
              <button
                type="button"
                onClick={() => patchIssue({ blocked: !issue.blocked })}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  height: 24,
                  padding: '0 10px',
                  borderRadius: 'var(--xp-r-sm)',
                  border: `1px solid ${issue.blocked ? 'var(--xp-danger)' : 'var(--xp-border)'}`,
                  background: issue.blocked ? 'var(--xp-danger)' : 'var(--xp-canvas)',
                  color: issue.blocked ? 'var(--xp-accent-fg)' : 'var(--xp-muted)',
                  fontFamily: 'var(--xp-font-mono)',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {issue.blocked ? '● Blocked' : 'Not blocked'}
              </button>
            </div>

            {/* Assignee — multi-select (XP-72 parity in the peek) */}
            <div className="xp-editable-row" style={overviewRowStyle}>
              <span className="xp-meta">ASSIGNEE</span>
              <AssigneePicker
                users={workspaceUsers}
                selectedIds={peekAssignees.map((u) => u.id)}
                onChange={setAssigneesOptimistic}
                title="Set assignees"
                style={{ width: '100%' }}
              >
                <EditableValue muted={peekAssignees.length === 0}>
                  {peekAssignees.length > 0 ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <AssigneeStack assignees={peekAssignees} size={18} />
                      <span className="xp-mono" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {peekAssignees.length === 1
                          ? (peekAssignees[0]!.displayName ?? peekAssignees[0]!.email)
                          : `${peekAssignees.length} assignees`}
                      </span>
                    </span>
                  ) : (
                    'Unassigned'
                  )}
                </EditableValue>
              </AssigneePicker>
            </div>

            {/* Creator — read-only */}
            <div style={overviewRowStyle}>
              <span className="xp-meta">CREATOR</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <AgentAvatar name={nameForUser(issue.creatorId, usersById)} src={issue.creatorId ? usersById[issue.creatorId]?.avatarUrl ?? undefined : undefined} size={18} isAgent={issue.creatorId ? usersById[issue.creatorId]?.isAgent : undefined} harness={issue.creatorId ? usersById[issue.creatorId]?.agentHarness : undefined} />
                <span className="xp-mono" style={{ fontSize: 11 }}>{nameForUser(issue.creatorId, usersById)}</span>
                {issue.creatorId && usersById[issue.creatorId]?.isAgent && usersById[issue.creatorId]?.agentHarness && (<HarnessPill harness={usersById[issue.creatorId]!.agentHarness!} />)}
              </span>
            </div>

            <div style={overviewRowStyle}>
              <span className="xp-meta">CREATED</span>
              <span className="xp-mono" style={{ color: 'var(--xp-ink)' }}>{formatRelative(issue.createdAt)}</span>
            </div>
            <div style={overviewRowStyle}>
              <span className="xp-meta">UPDATED</span>
              <span className="xp-mono" style={{ color: 'var(--xp-ink)' }}>{formatRelative(issue.updatedAt)}</span>
            </div>

            <div style={overviewRowStyle}>
              <span className="xp-meta">START</span>
              <DatePicker label="Start" value={issue.startDate} compact onChange={(date) => patchIssue({ startDate: date })} />
            </div>
            <div style={overviewRowStyle}>
              <span className="xp-meta">DUE</span>
              <DatePicker label="Due" value={issue.dueDate} compact onChange={(date) => patchIssue({ dueDate: date })} />
            </div>

            <div style={overviewRowStyle}>
              <span className="xp-meta">MILESTONE</span>
              <span className="xp-mono" style={{ color: issue.milestoneId ? 'var(--xp-ink)' : 'var(--xp-muted)', fontSize: 11 }}>
                {issue.milestoneId ? milestones.find((m) => m.id === issue.milestoneId)?.name ?? 'Unknown' : 'None'}
              </span>
            </div>

            {issue.labels && issue.labels.length > 0 && (
              <div style={overviewRowStyle}>
                <span className="xp-meta">LABELS</span>
                <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>
                  {issue.labels.map((l) => (
                    <LabelChip key={l.id} label={l} />
                  ))}
                </span>
              </div>
            )}
            {issue.tags && issue.tags.length > 0 && (
              <div style={overviewRowStyle}>
                <span className="xp-meta">TAGS</span>
                <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>
                  {issue.tags.map((t) => (
                    <TagChip key={t.id} tag={t} />
                  ))}
                </span>
              </div>
            )}
            {(issue.recurrenceRule || issue.recurrenceActive) && (
              <div style={overviewRowStyle}>
                <span className="xp-meta">RECURRENCE</span>
                <span className="xp-mono" style={{ color: 'var(--xp-accent-strong)', fontSize: 11 }}>
                  ↻ {issue.recurrenceRule}
                  {!issue.recurrenceActive && ' (paused)'}
                </span>
              </div>
            )}
          </div>

          {issue.parentId && (
            <div
              style={{
                fontSize: 11,
                color: 'var(--xp-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span>Sub-issue of</span>
              <button
                type="button"
                onClick={() =>
                  navigate({
                    pathname: `/issues/${encodeURIComponent(issueKey)}/..`,
                    search: location.search,
                  })
                }
                style={{
                  background: 'none',
                  border: 0,
                  color: 'var(--xp-accent-strong)',
                  cursor: 'pointer',
                  fontFamily: 'var(--xp-font-mono)',
                  fontSize: 11,
                  padding: 0,
                }}
              >
                parent
              </button>
            </div>
          )}

          <hr className="xp-rule" />

          {/* Description (XP-68: editable inline) */}
          <div>
            {editingDesc ? (
              <div>
                <RichTextEditor
                  content={descDraft}
                  onChange={setDescDraft}
                  onBlur={(html) => handleSaveDescription(html)}
                  variant="comment"
                  placeholder="Add a description…"
                  minHeight={80}
                />
                <div style={{ marginTop: 6, fontSize: 10.5, fontFamily: 'var(--xp-font-mono)', color: 'var(--xp-faint)' }}>
                  {savingDesc ? 'Saving…' : 'Saves automatically'}
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => { setDescDraft(issue.description ?? ''); setEditingDesc(true); }}
                title="Click to edit"
                style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 0, padding: 0, cursor: 'text' }}
              >
                {issue.description ? (
                  <RichTextRenderer content={issue.description} />
                ) : (
                  <span style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--xp-muted)', fontStyle: 'italic' }}>
                    Add a description…
                  </span>
                )}
              </button>
            )}
          </div>

          {reactions.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {reactions.map((r) => (
                <span
                  key={r.emoji}
                  className="xp-mono"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '2px 6px',
                    border: '1px solid var(--xp-border)',
                    borderRadius: 'var(--xp-r-sm)',
                    fontSize: 11,
                    background: r.mine ? 'var(--xp-accent-tint)' : 'var(--xp-surface)',
                  }}
                >
                  <span>{r.emoji}</span>
                  <span>{r.count}</span>
                </span>
              ))}
            </div>
          )}

          <hr className="xp-rule-dashed" />
          <div>
            <div className="xp-meta" style={{ marginBottom: 8 }}>
              RELATIONS · {relations.length}
            </div>
            {relations.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                {relations.slice(0, 5).map((relation) => (
                  <div
                    key={relation.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        navigate({
                          pathname: `/issues/${encodeURIComponent(relation.relatedIssueKey)}`,
                          search: location.search,
                        })
                      }
                      style={{ ...peekListButtonStyle, flex: 1 }}
                    >
                      <span className="xp-mono xp-muted" style={{ fontSize: 10.5 }}>
                        {relation.type.replaceAll('_', ' ')}
                      </span>
                      <span className="xp-mono" style={{ color: 'var(--xp-muted)', flexShrink: 0 }}>
                        {relation.relatedIssueKey}
                      </span>
                      <span style={peekEllipsisStyle}>{relation.relatedIssueTitle}</span>
                    </button>
                    <button
                      type="button"
                      title="Remove relation"
                      onClick={async () => {
                        try {
                          await api.deleteRelation(
                            issueKey,
                            {
                              toIssueKey: relation.relatedIssueKey,
                              type: relation.type,
                            },
                            token,
                          );
                          setRelations((cur) => cur.filter((r) => r.id !== relation.id));
                        } catch {}
                      }}
                      style={{
                        width: 20,
                        height: 20,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '1px solid var(--xp-hairline)',
                        borderRadius: 'var(--xp-r-sm)',
                        background: 'var(--xp-canvas)',
                        color: 'var(--xp-muted)',
                        cursor: 'pointer',
                        fontFamily: 'var(--xp-font-mono)',
                        fontSize: 9,
                        flexShrink: 0,
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            <RelationCreator
              token={token}
              currentIssueKey={issueKey}
              onAdd={async (toIssueKey, type) => {
                await api.createRelation(issueKey, { toIssueKey, type }, token);
                const fresh = await api.getIssue(issueKey, token);
                setRelations(fresh.relations);
              }}
            />
          </div>

          <hr className="xp-rule-dashed" />
          <div>
            <div
              className="xp-meta"
              style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <span>SUB-ISSUES · {subIssues.length}</span>
              {subIssues.length > 0 && <SubIssueProgressBar issues={subIssues} states={states} />}
            </div>
            {subIssues.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {subIssues.map((si) => {
                  const siState = states.find((s) => s.id === si.stateId);
                  const siKind:
                    | 'triage'
                    | 'backlog'
                    | 'unstarted'
                    | 'started'
                    | 'completed'
                    | 'canceled' = (siState?.type as never) ?? 'unstarted';
                  return (
                    <button
                      key={si.id}
                      type="button"
                      onClick={() =>
                        navigate({
                          pathname: `/issues/${encodeURIComponent(si.key)}`,
                          search: location.search,
                        })
                      }
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '4px 6px',
                        background: 'transparent',
                        border: '1px solid var(--xp-hairline)',
                        borderRadius: 'var(--xp-r-sm)',
                        cursor: 'pointer',
                        fontFamily: 'var(--xp-font-mono)',
                        fontSize: 12,
                        textAlign: 'left',
                        color: 'var(--xp-ink)',
                        width: '100%',
                      }}
                    >
                      <StateDot kind={siKind} size={12} />
                      <span style={{ color: 'var(--xp-muted)', flexShrink: 0 }}>{si.key}</span>
                      <span
                        style={{
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {si.title}
                      </span>
                      <Priority kind={priorityKind(si.priority)} size={12} />
                    </button>
                  );
                })}
              </div>
            )}
            {showSubIssueForm ? (
              <form
                onSubmit={handleCreateSubIssue}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  marginTop: subIssues.length > 0 ? 6 : 0,
                  padding: '8px',
                  border: '1px solid var(--xp-hairline)',
                  borderRadius: 'var(--xp-r-sm)',
                  background: 'var(--xp-canvas)',
                }}
              >
                <input
                  autoFocus
                  value={subIssueTitle}
                  onChange={(e) => setSubIssueTitle(e.target.value)}
                  placeholder="Sub-issue title"
                  style={{
                    width: '100%',
                    padding: '5px 7px',
                    border: '1px solid var(--xp-hairline)',
                    borderRadius: 'var(--xp-r-sm)',
                    background: 'var(--xp-surface)',
                    color: 'var(--xp-ink)',
                    fontFamily: 'var(--xp-font-mono)',
                    fontSize: 12,
                    outline: 'none',
                  }}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <div style={{ flex: 1 }}>
                    <Select
                      value={subIssueStateId}
                      onValueChange={setSubIssueStateId}
                      options={stateSelectOptions(states, [{ value: '', label: 'Default state' }])}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <Select
                      value={subIssueAssigneeId}
                      onValueChange={setSubIssueAssigneeId}
                      options={[
                        { value: '', label: 'Unassigned' },
                        ...workspaceUsers.map((wu) => ({
                          value: wu.id,
                          label: wu.displayName ?? wu.email,
                        })),
                      ]}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowSubIssueForm(false);
                      setSubIssueTitle('');
                      setSubIssueStateId('');
                      setSubIssueAssigneeId('');
                    }}
                    style={{
                      padding: '3px 8px',
                      border: '1px solid var(--xp-hairline)',
                      borderRadius: 'var(--xp-r-sm)',
                      background: 'var(--xp-surface)',
                      color: 'var(--xp-muted)',
                      cursor: 'pointer',
                      fontFamily: 'var(--xp-font-mono)',
                      fontSize: 11,
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creatingSubIssue || !subIssueTitle.trim()}
                    style={{
                      padding: '3px 8px',
                      border: '1px solid var(--xp-accent)',
                      borderRadius: 'var(--xp-r-sm)',
                      background: 'var(--xp-accent)',
                      color: 'var(--xp-accent-fg)',
                      cursor: creatingSubIssue || !subIssueTitle.trim() ? 'not-allowed' : 'pointer',
                      fontFamily: 'var(--xp-font-mono)',
                      fontSize: 11,
                      opacity: creatingSubIssue || !subIssueTitle.trim() ? 0.5 : 1,
                    }}
                  >
                    {creatingSubIssue ? 'Adding…' : 'Add'}
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setShowSubIssueForm(true)}
                style={{
                  marginTop: subIssues.length > 0 ? 6 : 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 8px',
                  border: '1px dashed var(--xp-hairline)',
                  borderRadius: 'var(--xp-r-sm)',
                  background: 'transparent',
                  color: 'var(--xp-muted)',
                  cursor: 'pointer',
                  fontFamily: 'var(--xp-font-mono)',
                  fontSize: 11,
                  width: '100%',
                  justifyContent: 'center',
                }}
              >
                + Add sub-issue
              </button>
            )}
          </div>

          <hr className="xp-rule-dashed" />

          {/* Comments */}
          <div>
            <div className="xp-meta" style={{ marginBottom: 8 }}>
              COMMENTS · {comments.length}
            </div>
            <form onSubmit={handlePostComment} style={{ marginBottom: 12 }}>
              <RichTextEditor
                content={newComment}
                onChange={setNewComment}
                variant="comment"
                placeholder="Add a comment"
                onSubmit={() => {
                  if (!posting && newComment.trim()) {
                    void handlePostComment(new Event('submit') as unknown as FormEvent);
                  }
                }}
                minHeight={60}
              />
              <div
                style={{
                  marginTop: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: 10,
                }}
              >
                <button
                  type="submit"
                  disabled={posting || !newComment.trim() || newComment === '<p></p>'}
                  style={{
                    border: '1px solid transparent',
                    borderRadius: 'var(--xp-r-sm)',
                    background: 'var(--xp-accent)',
                    color: 'var(--xp-accent-fg)',
                    padding: '7px 12px',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: posting || !newComment.trim() ? 'default' : 'pointer',
                    opacity: posting || !newComment.trim() ? 0.6 : 1,
                  }}
                >
                  {posting ? 'Posting…' : 'Post comment'}
                </button>
              </div>
            </form>
            {comments.length === 0 && (
              <div className="xp-muted" style={{ fontSize: 12 }}>
                No comments yet.
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {comments.slice(0, 5).map((c) => {
                const author = nameForUser(c.authorId, usersById);
                return (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <AgentAvatar name={author} src={c.authorId ? usersById[c.authorId]?.avatarUrl ?? undefined : undefined} size={18} isAgent={c.authorId ? usersById[c.authorId]?.isAgent : undefined} harness={c.authorId ? usersById[c.authorId]?.agentHarness : undefined} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="xp-mono" style={{ fontSize: 11, fontWeight: 600 }}>
                          {author}
                        </span>
                        <span className="xp-mono xp-muted" style={{ fontSize: 10.5 }}>
                          · {formatRelative(c.createdAt)}
                        </span>
                      </div>
                      <div style={{ marginTop: 2 }}>
                        <RichTextRenderer content={c.body} />
                      </div>
                    </div>
                  </div>
                );
              })}
              {comments.length > 5 && (
                <button
                  type="button"
                  onClick={handleOpenFull}
                  style={{
                    background: 'transparent',
                    border: 0,
                    color: 'var(--xp-accent-strong)',
                    cursor: 'pointer',
                    fontFamily: 'var(--xp-font-mono)',
                    fontSize: 11,
                    letterSpacing: 'var(--xp-track-wide)',
                    textTransform: 'uppercase',
                    textAlign: 'left',
                    padding: 0,
                  }}
                >
                  Open full view to see {comments.length - 5} more · <Kbd size="sm">↗</Kbd>
                </button>
              )}
            </div>
          </div>

          {activity.length > 0 && (
            <>
              <hr className="xp-rule-dashed" />
              <div>
                <div className="xp-meta" style={{ marginBottom: 8 }}>
                  RECENT ACTIVITY
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {activity.map((entry) => (
                    <div
                      key={entry.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '68px 1fr',
                        gap: 8,
                        fontSize: 11,
                        alignItems: 'start',
                      }}
                    >
                      <span className="xp-mono xp-muted">{formatRelative(entry.createdAt)}</span>
                      <span>
                        <span className="xp-mono" style={{ fontWeight: 600 }}>
                          {entry.actorDisplayName ?? entry.actorEmail ?? 'System'}
                        </span>
                        <span className="xp-muted">
                          {' '}
                          · {entry.action.replaceAll('_', ' ')}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </SlideOver>
  );
}

function SubIssueProgressBar({ issues, states }: { issues: Issue[]; states: WorkflowState[] }) {
  const stateById = useMemo(() => new Map(states.map((s) => [s.id, s])), [states]);
  const total = issues.length;
  const completed = issues.filter((i) => {
    const s = stateById.get(i.stateId);
    return s?.type === 'completed' || s?.type === 'canceled';
  }).length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flex: 1 }}>
      <span
        style={{
          flex: 1,
          height: 4,
          borderRadius: 2,
          background: 'var(--xp-border)',
          overflow: 'hidden',
        }}
      >
        <span
          style={{
            display: 'block',
            height: '100%',
            width: `${pct}%`,
            borderRadius: 2,
            background: pct === 100 ? 'var(--xp-success)' : 'var(--xp-accent-strong)',
            transition: 'width 200ms ease',
          }}
        />
      </span>
      <span className="xp-mono" style={{ fontSize: 10, color: 'var(--xp-muted)', flexShrink: 0 }}>
        {completed}/{total}
      </span>
    </span>
  );
}

function priorityKind(p: number): 'urgent' | 'high' | 'normal' | 'low' | 'none' {
  switch (p) {
    case 1:
      return 'urgent';
    case 2:
      return 'high';
    case 3:
      return 'normal';
    case 4:
      return 'low';
    default:
      return 'none';
  }
}

const peekListButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '5px 6px',
  background: 'transparent',
  border: '1px solid var(--xp-hairline)',
  borderRadius: 'var(--xp-r-sm)',
  cursor: 'pointer',
  fontFamily: 'var(--xp-font-mono)',
  fontSize: 11.5,
  textAlign: 'left',
  color: 'var(--xp-ink)',
  width: '100%',
};

const peekEllipsisStyle: React.CSSProperties = {
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};
