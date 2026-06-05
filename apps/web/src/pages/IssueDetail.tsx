import { Avatar, CloseEsc, DropdownMenu, Priority, Select, Skeleton, StateDot } from '@xpntl/ui';
import { AgentAvatar, HarnessPill } from '../components/AgentBadge';
import { type FormEvent, type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { AttachmentSection } from '../components/AttachmentSection';
import { CoverImage } from '../components/CoverImage';
import { DatePickerInline } from '../components/DatePicker';
import { IssueRefText } from '../components/IssueRefText';
import { EditableValue, overviewRowStyle } from '../components/overview-field';
import { AssigneePicker, AssigneeStack } from '../components/AssigneePicker';
import { CopyIssueId } from '../components/CopyIssueId';
import { IssueTypeIcon, issueTypeLabel } from '../components/IssueTypeIcon';
import { PRIORITY_SELECT_OPTIONS, TYPE_SELECT_OPTIONS, stateSelectOptions } from '../lib/select-options';
import { LabelChip } from '../components/LabelChip';
import { TagChip } from '../components/TagChip';
import { ReactionBar } from '../components/ReactionBar';
import { RecurrenceEditor } from '../components/RecurrenceEditor';
import { RelationCreator } from '../components/RelationCreator';
import { extractMentionIds } from '../components/MentionSuggestion';
import { RichTextEditor } from '../components/RichTextEditor';
import { RichTextRenderer } from '../components/RichTextRenderer';
import {
  type ActivityEntry,
  type Checklist,
  type ChecklistItem,
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
import { formatRelative, priorityKind, priorityLabel } from '../lib/format';
import { useToasts } from '../lib/toast-store';
import { nameForUser, useUsers } from '../lib/user-store';
import { useProjects } from '../lib/project-store';
import { PresenceDots } from '../components/PresenceDots';

export function IssueDetailPage() {
  const { key = '' } = useParams<{ key: string }>();
  const navigate = useNavigate();
  const { user, token, clear } = useAuth();
  const usersById = useUsers((s) => s.byId);
  const workspaceUsers = Object.values(usersById);
  const pushToast = useToasts((s) => s.push);
  const projectsById = useProjects((s) => s.all);

  const [issue, setIssue] = useState<Issue | null>(null);
  const [issueReactions, setIssueReactions] = useState<ReactionSummary[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [states, setStates] = useState<WorkflowState[]>([]);
  const [subIssues, setSubIssues] = useState<Issue[]>([]);
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [relations, setRelations] = useState<IssueRelation[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [activityCursor, setActivityCursor] = useState<string | null>(null);
  const [loadingMoreActivity, setLoadingMoreActivity] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newComment, setNewComment] = useState('');
  const [posting, setPosting] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [expandedResolved, setExpandedResolved] = useState<Set<string>>(new Set());
  const [draftTitle, setDraftTitle] = useState('');
  const revertTitleRef = useRef(false);
  const [draftStateId, setDraftStateId] = useState('');
  const [draftPriority, setDraftPriority] = useState(0);

  // Click-to-edit description
  const [editingDescription, setEditingDescription] = useState(false);
  const [editedDescription, setEditedDescription] = useState('');
  const [savingDescription, setSavingDescription] = useState(false);

  // Checklist interactive state
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [showNewChecklistForm, setShowNewChecklistForm] = useState(false);
  const [newItemText, setNewItemText] = useState<Record<string, string>>({});
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemText, setEditingItemText] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  // Sub-issue creation state
  const [showSubIssueForm, setShowSubIssueForm] = useState(false);
  const [subIssueTitle, setSubIssueTitle] = useState('');
  const [subIssueStateId, setSubIssueStateId] = useState('');
  const [subIssueAssigneeId, setSubIssueAssigneeId] = useState('');
  const [creatingSubIssue, setCreatingSubIssue] = useState(false);

  // Sidebar click-to-edit state
  const [editingField, setEditingField] = useState<'state' | 'priority' | 'type' | 'assignee' | null>(null);

  // Comment assignment state
  const [assignPopoverCommentId, setAssignPopoverCommentId] = useState<string | null>(null);
  const [assignSelectedUserId, setAssignSelectedUserId] = useState('');
  const [assignDueAt, setAssignDueAt] = useState('');

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

  // XP-93: Escape closes the full issue page (matching the ✕ esc affordance),
  // unless the user is editing a field or a dialog/popover owns the key.
  useEffect(() => {
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) return;
      // Let Radix dialogs / poppers (confirm, selects, date pickers) handle Esc.
      if (document.querySelector('[role="dialog"],[data-radix-popper-content-wrapper]')) return;
      navigate('/issues');
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [navigate]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [
          { issue, reactions, relations },
          { comments },
          { states },
          { issues: subIssues },
          { checklists },
          activityResult,
        ] = await Promise.all([
          api.getIssue(key, token),
          api.listComments(key, token),
          api.listWorkflowStates(token),
          api.listSubIssues(key, token),
          api.listChecklists(key, token),
          api.listActivity(key, { limit: 20 }, token),
        ]);
        if (cancelled) return;
        setIssue(issue);
        setIssueReactions(reactions);
        setRelations(relations);
        setComments(comments);
        setStates(states);
        setSubIssues(subIssues);
        setChecklists(checklists);
        setActivity(activityResult.activity);
        setActivityCursor(activityResult.nextCursor);
        setDraftTitle(issue.title);
        setDraftStateId(issue.stateId);
        setDraftPriority(issue.priority);
        if (issue.projectId) {
          api.listMilestones(issue.projectId, token).then((r) => {
            if (!cancelled) setMilestones(r.milestones);
          }).catch(() => {});
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof FetchError && err.status === 401) {
          clear();
          navigate('/signin');
          return;
        }
        if (err instanceof FetchError && err.status === 404) {
          setError('Issue not found');
        } else {
          setError(err instanceof FetchError ? err.message : 'Failed to load issue');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [key, token, clear, navigate]);

  // Sync editedDescription when issue data changes
  useEffect(() => {
    if (issue) {
      setEditedDescription(issue.description ?? '');
      setEditingDescription(false);
    }
  }, [issue?.id, issue?.description]);

  const selectedState = useMemo(
    () => states.find((state) => state.id === (draftStateId || issue?.stateId)),
    [draftStateId, issue?.stateId, states],
  );

  // Multi-assignee list: prefer assignees[], fall back to the legacy single id.
  const detailAssignees: WorkspaceUser[] = issue
    ? issue.assignees && issue.assignees.length > 0
      ? issue.assignees
      : issue.assigneeId && usersById[issue.assigneeId]
        ? [usersById[issue.assigneeId]!]
        : []
    : [];
  async function reloadIssueSupport() {
    if (!issue) return;
    const [
      { issue: fresh, reactions, relations },
      { comments },
      { issues: subIssues },
      { checklists },
      activityResult,
    ] = await Promise.all([
      api.getIssue(issue.key, token),
      api.listComments(issue.key, token),
      api.listSubIssues(issue.key, token),
      api.listChecklists(issue.key, token),
      api.listActivity(issue.key, { limit: 20 }, token),
    ]);
    setIssue(fresh);
    setIssueReactions(reactions);
    setRelations(relations);
    setComments(comments);
    setSubIssues(subIssues);
    setChecklists(checklists);
    setActivity(activityResult.activity);
    setActivityCursor(activityResult.nextCursor);
    setDraftTitle(fresh.title);
    setDraftStateId(fresh.stateId);
    setDraftPriority(fresh.priority);
  }

  // XP-84: title auto-saves on blur/Enter — no Save button. State, priority and
  // assignee already persist individually via handleInlineUpdate.
  async function handleSaveTitle() {
    if (!issue) return;
    // Escape reverts: blur fires synchronously before the draftTitle state
    // update applies, so use a ref flag to skip the save (XP-84 review fix).
    if (revertTitleRef.current) {
      revertTitleRef.current = false;
      setDraftTitle(issue.title);
      return;
    }
    const next = draftTitle.trim();
    if (!next || next === issue.title) {
      setDraftTitle(issue.title);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await api.updateIssue(issue.key, { title: next }, token);
      setIssue(result.issue);
      setDraftTitle(result.issue.title);
      const actResult = await api.listActivity(issue.key, { limit: 20 }, token);
      setActivity(actResult.activity);
      setActivityCursor(actResult.nextCursor);
    } catch (err) {
      setError(err instanceof FetchError ? err.message : 'Failed to save title');
      setDraftTitle(issue.title);
    } finally {
      setSaving(false);
    }
  }

  /** Multi-assignee: set the full assignee list (XP-72 parity in detail). */
  async function handleDeleteIssue() {
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
      pushToast('info', `Deleted ${issue.key}`);
      navigate('/issues');
    } catch (err) {
      pushToast('danger', err instanceof FetchError ? err.message : 'Failed to delete issue');
    }
  }

  async function handleCopyLink() {
    if (!issue) return;
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/issues/${encodeURIComponent(issue.key)}`,
      );
      pushToast('info', 'Link copied');
    } catch {
      pushToast('warn', 'Could not copy link');
    }
  }

  async function handleSetAssignees(ids: string[]) {
    if (!issue) return;
    const previous = issue;
    const nextAssignees = ids.map((id) => usersById[id]).filter(Boolean) as WorkspaceUser[];
    setIssue({ ...issue, assignees: nextAssignees, assigneeId: ids[0] ?? null });
    try {
      await api.setAssignees(issue.key, ids, token);
      const actResult = await api.listActivity(issue.key, { limit: 20 }, token);
      setActivity(actResult.activity);
      setActivityCursor(actResult.nextCursor);
    } catch {
      setIssue(previous);
      pushToast('danger', 'Failed to update assignees');
    }
  }

  /** Optimistically save a single field from the sidebar. */
  async function handleInlineUpdate(patch: Parameters<typeof api.updateIssue>[1]) {
    if (!issue) return;
    const previous = issue;
    // Optimistic update
    setIssue({ ...issue, ...patch });
    setEditingField(null);
    try {
      const result = await api.updateIssue(issue.key, patch, token);
      setIssue(result.issue);
      setDraftStateId(result.issue.stateId);
      setDraftPriority(result.issue.priority);
      // Refresh activity
      const actResult = await api.listActivity(issue.key, { limit: 20 }, token);
      setActivity(actResult.activity);
      setActivityCursor(actResult.nextCursor);
    } catch {
      setIssue(previous);
      setDraftStateId(previous.stateId);
      setDraftPriority(previous.priority);
      pushToast('danger', 'Failed to update issue');
    }
  }

  async function handleSaveDescription(html?: string) {
    if (!issue) return;
    const next = (html ?? editedDescription).trim() || null;
    if (next === (issue.description ?? null)) {
      setEditingDescription(false);
      return;
    }
    setSavingDescription(true);
    try {
      const result = await api.updateIssue(
        issue.key,
        { description: next },
        token,
      );
      setIssue(result.issue);
      setEditingDescription(false);
      const actResult = await api.listActivity(issue.key, { limit: 20 }, token);
      setActivity(actResult.activity);
      setActivityCursor(actResult.nextCursor);
      pushToast('success', 'Description updated');
    } catch (err) {
      setError(err instanceof FetchError ? err.message : 'Failed to save description');
    } finally {
      setSavingDescription(false);
    }
  }

  async function handleToggleIssueReaction(emoji: string) {
    if (!issue) return;
    const wasMine = issueReactions.find((r) => r.emoji === emoji)?.mine;
    setIssueReactions((current) => applyReactionToggle(current, emoji, user?.id ?? '', !wasMine));
    try {
      await api.toggleIssueReaction(issue.key, emoji, token);
    } catch {
      const fresh = await api.getIssue(issue.key, token);
      setIssueReactions(fresh.reactions);
    }
  }

  async function handleToggleCommentReaction(commentId: string, emoji: string) {
    const target = comments.find((c) => c.id === commentId);
    if (!target) return;
    const wasMine = target.reactions.find((r) => r.emoji === emoji)?.mine ?? false;
    setComments((current) =>
      current.map((comment) =>
        comment.id === commentId
          ? {
              ...comment,
              reactions: applyReactionToggle(comment.reactions, emoji, user?.id ?? '', !wasMine),
            }
          : comment,
      ),
    );
    try {
      await api.toggleCommentReaction(commentId, emoji, token);
    } catch {
      const fresh = await api.listComments(key, token);
      setComments(fresh.comments);
    }
  }

  async function handlePostComment(e: FormEvent) {
    e.preventDefault();
    if (!newComment.trim()) return;
    setPosting(true);
    try {
      const mentionIds = extractMentionIds(newComment);
      const result = await api.createComment(key, newComment.trim(), token, mentionIds);
      setComments((current) => [...current, result.comment]);
      setNewComment('');
      const actRefresh = await api.listActivity(key, { limit: 20 }, token);
      setActivity(actRefresh.activity);
      setActivityCursor(actRefresh.nextCursor);
      pushToast('success', 'Comment posted');
    } catch (err) {
      setError(err instanceof FetchError ? err.message : 'Failed to post comment');
    } finally {
      setPosting(false);
    }
  }

  async function handleDeleteComment(id: string) {
    const ok = await confirm({
      title: 'Delete comment',
      message: 'Delete this comment? This cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await api.deleteComment(id, token);
      setComments((current) => current.filter((c) => c.id !== id));
      const actRefresh = await api.listActivity(key, { limit: 20 }, token);
      setActivity(actRefresh.activity);
      setActivityCursor(actRefresh.nextCursor);
      pushToast('info', 'Comment deleted');
    } catch (err) {
      setError(err instanceof FetchError ? err.message : 'Failed to delete');
    }
  }

  async function handlePinComment(commentId: string) {
    try {
      const { comment: updated } = await api.pinComment(commentId, token);
      setComments((current) => current.map((cc) => cc.id === commentId ? { ...cc, pinnedAt: updated.pinnedAt, pinnedBy: updated.pinnedBy, pinnedByUser: user ? { id: user.id, email: user.email, displayName: user.displayName, role: user.role } : null } : cc));
    } catch (err) { setError(err instanceof FetchError ? err.message : 'Failed to pin comment'); }
  }

  async function handleUnpinComment(commentId: string) {
    try {
      await api.unpinComment(commentId, token);
      setComments((current) => current.map((cc) => cc.id === commentId ? { ...cc, pinnedAt: null, pinnedBy: null, pinnedByUser: null } : cc));
    } catch (err) { setError(err instanceof FetchError ? err.message : 'Failed to unpin comment'); }
  }

  // ---- Checklist handlers (optimistic) ----------------------------------------

  const handleToggleChecklistItem = useCallback(
    async (checklistId: string, item: ChecklistItem) => {
      const newChecked = !item.checked;
      setChecklists((prev) =>
        prev.map((cl) =>
          cl.id === checklistId
            ? {
                ...cl,
                items: cl.items.map((it) =>
                  it.id === item.id ? { ...it, checked: newChecked } : it,
                ),
              }
            : cl,
        ),
      );
      try {
        await api.updateChecklistItem(item.id, { checked: newChecked }, token);
      } catch {
        setChecklists((prev) =>
          prev.map((cl) =>
            cl.id === checklistId
              ? {
                  ...cl,
                  items: cl.items.map((it) =>
                    it.id === item.id ? { ...it, checked: item.checked } : it,
                  ),
                }
              : cl,
          ),
        );
      }
    },
    [token],
  );

  // ---- Assigned comment handlers ------------------------------------------------

  async function handleAssignComment(commentId: string) {
    if (!assignSelectedUserId) return;
    try {
      const result = await api.assignComment(
        commentId,
        assignSelectedUserId,
        assignDueAt || null,
        token,
      );
      setComments((current) =>
        current.map((c) =>
          c.id === commentId
            ? {
                ...c,
                assigneeId: result.comment.assigneeId,
                assignee: usersById[result.comment.assigneeId ?? '']
                  ? {
                      id: usersById[result.comment.assigneeId!]!.id,
                      email: usersById[result.comment.assigneeId!]!.email,
                      displayName: usersById[result.comment.assigneeId!]!.displayName,
                      avatarUrl: usersById[result.comment.assigneeId!]!.avatarUrl,
                      role: usersById[result.comment.assigneeId!]!.role,
                    }
                  : null,
                assignedDueAt: result.comment.assignedDueAt,
                assignedResolvedAt: null,
                assignedResolvedBy: null,
              }
            : c,
        ),
      );
      setAssignPopoverCommentId(null);
      setAssignSelectedUserId('');
      setAssignDueAt('');
    } catch (err) {
      setError(err instanceof FetchError ? err.message : 'Failed to assign comment');
    }
  }

  async function handleResolveAssignedComment(commentId: string) {
    try {
      const result = await api.resolveAssignedComment(commentId, token);
      setComments((current) =>
        current.map((c) =>
          c.id === commentId
            ? {
                ...c,
                assignedResolvedAt: result.comment.assignedResolvedAt,
                assignedResolvedBy: result.comment.assignedResolvedBy,
              }
            : c,
        ),
      );
    } catch (err) {
      setError(err instanceof FetchError ? err.message : 'Failed to resolve assigned comment');
    }
  }

  async function handleUnassignComment(commentId: string) {
    try {
      await api.unassignComment(commentId, token);
      setComments((current) =>
        current.map((c) =>
          c.id === commentId
            ? {
                ...c,
                assigneeId: null,
                assignee: null,
                assignedDueAt: null,
                assignedResolvedAt: null,
                assignedResolvedBy: null,
              }
            : c,
        ),
      );
    } catch (err) {
      setError(err instanceof FetchError ? err.message : 'Failed to unassign comment');
    }
  }

  // ---- Resolvable comment handlers ------------------------------------------------

  async function handleResolveComment(commentId: string) {
    try {
      const { comment: updated } = await api.resolveComment(key, commentId, token);
      setComments((current) =>
        current.map((c) =>
          c.id === commentId
            ? { ...c, resolvedAt: updated.resolvedAt, resolvedBy: updated.resolvedBy }
            : c,
        ),
      );
      const actRefresh = await api.listActivity(key, { limit: 20 }, token);
      setActivity(actRefresh.activity);
      setActivityCursor(actRefresh.nextCursor);
    } catch (err) {
      setError(err instanceof FetchError ? err.message : 'Failed to resolve comment');
    }
  }

  async function handleUnresolveComment(commentId: string) {
    try {
      await api.unresolveComment(key, commentId, token);
      setComments((current) =>
        current.map((c) =>
          c.id === commentId ? { ...c, resolvedAt: null, resolvedBy: null } : c,
        ),
      );
      setExpandedResolved((prev) => {
        const next = new Set(prev);
        next.delete(commentId);
        return next;
      });
      const actRefresh = await api.listActivity(key, { limit: 20 }, token);
      setActivity(actRefresh.activity);
      setActivityCursor(actRefresh.nextCursor);
    } catch (err) {
      setError(err instanceof FetchError ? err.message : 'Failed to re-open comment');
    }
  }

  const handleImageUpload = useCallback(async (file: File): Promise<string> => {
    const { attachment } = await api.uploadAttachment(key, file, token);
    return attachment.url;
  }, [key, token]);

  async function handleLoadMoreActivity() {
    if (!activityCursor || loadingMoreActivity) return;
    setLoadingMoreActivity(true);
    try {
      const result = await api.listActivity(key, { limit: 20, cursor: activityCursor }, token);
      setActivity((prev) => [...prev, ...result.activity]);
      setActivityCursor(result.nextCursor);
    } catch {
      // silently fail
    } finally {
      setLoadingMoreActivity(false);
    }
  }

  const handleCreateChecklist = useCallback(async () => {
    const title = newChecklistTitle.trim() || 'Checklist';
    try {
      const { checklist } = await api.createChecklist(key, title, token);
      setChecklists((prev) => [...prev, checklist]);
      setNewChecklistTitle('');
      setShowNewChecklistForm(false);
    } catch (err) {
      setError(err instanceof FetchError ? err.message : 'Failed to create checklist');
    }
  }, [key, token, newChecklistTitle]);

  const handleDeleteChecklist = useCallback(
    async (checklistId: string) => {
      if (!(await confirm({ message: 'Delete this checklist and all its items?' }))) return;
      const prev = checklists;
      setChecklists((cur) => cur.filter((cl) => cl.id !== checklistId));
      try {
        await api.deleteChecklist(checklistId, token);
      } catch {
        setChecklists(prev);
      }
    },
    [token, checklists],
  );

  const handleAddChecklistItem = useCallback(
    async (checklistId: string) => {
      const content = (newItemText[checklistId] ?? '').trim();
      if (!content) return;
      try {
        const { item } = await api.addChecklistItem(checklistId, { content }, token);
        setChecklists((prev) =>
          prev.map((cl) =>
            cl.id === checklistId ? { ...cl, items: [...cl.items, item] } : cl,
          ),
        );
        setNewItemText((prev) => ({ ...prev, [checklistId]: '' }));
      } catch (err) {
        setError(err instanceof FetchError ? err.message : 'Failed to add item');
      }
    },
    [token, newItemText],
  );

  const handleDeleteChecklistItem = useCallback(
    async (checklistId: string, itemId: string) => {
      const prev = checklists;
      setChecklists((cur) =>
        cur.map((cl) =>
          cl.id === checklistId
            ? { ...cl, items: cl.items.filter((it) => it.id !== itemId) }
            : cl,
        ),
      );
      try {
        await api.deleteChecklistItem(itemId, token);
      } catch {
        setChecklists(prev);
      }
    },
    [token, checklists],
  );

  const handleStartEditItem = useCallback((item: ChecklistItem) => {
    setEditingItemId(item.id);
    setEditingItemText(item.content);
    setTimeout(() => editInputRef.current?.focus(), 0);
  }, []);

  const handleSaveEditItem = useCallback(
    async (checklistId: string, itemId: string) => {
      const content = editingItemText.trim();
      if (!content) {
        setEditingItemId(null);
        return;
      }
      const prev = checklists;
      setChecklists((cur) =>
        cur.map((cl) =>
          cl.id === checklistId
            ? { ...cl, items: cl.items.map((it) => (it.id === itemId ? { ...it, content } : it)) }
            : cl,
        ),
      );
      setEditingItemId(null);
      try {
        await api.updateChecklistItem(itemId, { content }, token);
      } catch {
        setChecklists(prev);
      }
    },
    [token, checklists, editingItemText],
  );

  if (loading) {
    return (
      <AppLayout>
        <div style={{ padding: 24, maxWidth: 1320, width: '100%', margin: '0 auto' }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            <Skeleton w={60} h={14} />
            <span style={{ color: 'var(--xp-faint)' }}>/</span>
            <Skeleton w={80} h={14} />
            <span style={{ color: 'var(--xp-faint)' }}>/</span>
            <Skeleton w={70} h={14} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.7fr) minmax(300px, 0.9fr)', gap: 24 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Skeleton h={40} />
              <div style={{ display: 'flex', gap: 8 }}>
                <Skeleton w={80} h={28} radius="999px" />
                <Skeleton w={80} h={28} radius="999px" />
                <Skeleton w={80} h={28} radius="999px" />
              </div>
              <Skeleton h={200} />
              <Skeleton h={120} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Skeleton h={180} />
              <Skeleton h={100} />
              <Skeleton h={80} />
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error || !issue) {
    return (
      <AppLayout>
        <div style={{ padding: 24 }}>
          <Link to={`/issues/${encodeURIComponent(key)}`} style={headerLinkStyle}>
            &larr; Back to peek
          </Link>
          <p style={{ marginTop: 24, color: 'var(--xp-danger)' }}>{error}</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
        }}
      >
        <header
          style={{
            padding: '12px 20px',
            borderBottom: '1px solid var(--xp-hairline)',
            background: 'var(--xp-surface)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flex: 'none',
          }}
        >
          {/* Breadcrumbs */}
          <nav
            aria-label="Breadcrumb"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontFamily: 'var(--xp-font-mono)',
              fontSize: 11,
            }}
          >
            <Link to="/issues" style={breadcrumbLinkStyle}>
              Issues
            </Link>
            <span style={{ color: 'var(--xp-faint)' }}>/</span>
            {issue.projectId
              ? (() => {
                  // Breadcrumb back to the project's *board*, not the projects
                  // list / edit screen (XP-65).
                  const proj = projectsById.find((p) => p.id === issue.projectId);
                  return (
                    <>
                      <Link
                        to={proj ? `/p/${encodeURIComponent(proj.key)}/board` : '/projects'}
                        style={breadcrumbLinkStyle}
                      >
                        {proj?.name ?? 'Project'}
                      </Link>
                      <span style={{ color: 'var(--xp-faint)' }}>/</span>
                    </>
                  );
                })()
              : null}
            <span style={{ color: 'var(--xp-ink)', fontWeight: 600 }}>{issue.key}</span>
          </nav>
          <span style={{ flex: 1 }} />
          <PresenceDots issueId={issue.id} size={20} />
          <DropdownMenu
            trigger={
              <button
                type="button"
                title="More actions"
                aria-label="More actions"
                style={{
                  background: 'var(--xp-canvas)',
                  border: '1px solid var(--xp-border)',
                  borderRadius: 'var(--xp-r-sm)',
                  color: 'var(--xp-ink)',
                  cursor: 'pointer',
                  fontFamily: 'var(--xp-font-mono)',
                  fontSize: 14,
                  padding: '3px 9px',
                  lineHeight: 1,
                }}
              >
                ⋮
              </button>
            }
            items={[
              { label: 'Copy link', onSelect: handleCopyLink },
              { label: 'Delete issue', onSelect: handleDeleteIssue, danger: true },
            ]}
          />
          <CloseEsc aria-label="Close issue" onClick={() => navigate('/issues')} />
        </header>

        <main
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
            width: '100%',
            padding: '24px 24px 24px',
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.7fr) minmax(300px, 0.9fr)',
            gap: 24,
          }}
        >
          <div
            style={{
              minWidth: 0,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
              overflow: 'auto',
              paddingRight: 4,
            }}
          >
            <CoverImage
              issueKey={issue.key}
              coverUrl={issue.coverBlobRef}
              coverPosition={issue.coverPosition}
              token={token}
              onUpdate={(coverUrl, coverPosition) =>
                setIssue((prev) =>
                  prev ? { ...prev, coverBlobRef: coverUrl, coverPosition } : prev,
                )
              }
            />

            <section style={panelStyle}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 14,
                  flexWrap: 'wrap',
                }}
              >
                <CopyIssueId id={issue.id} issueKey={issue.key}>
                  <IssueMetaPill label={issue.key} title={`Copy issue ID (${issue.id})`} />
                </CopyIssueId>
                {selectedState && (
                  editingField === 'state' ? (
                    <div style={{ minWidth: 140 }}>
                      <Select
                        value={draftStateId}
                        onValueChange={(value) => {
                          setDraftStateId(value);
                          handleInlineUpdate({ stateId: value });
                        }}
                        options={stateSelectOptions(states)}
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      title={`State: ${selectedState.name} — click to change`}
                      onClick={() => setEditingField('state')}
                      className="xp-meta-pill-btn" style={metaPillButtonStyle}
                    >
                      <StateDot kind={selectedState.type} size={12} />
                      <span>{selectedState.name}</span>
                    </button>
                  )
                )}
                {editingField === 'priority' ? (
                  <div style={{ minWidth: 140 }}>
                    <Select
                      value={String(draftPriority)}
                      onValueChange={(value) => {
                        const p = Number.parseInt(value, 10) || 0;
                        setDraftPriority(p);
                        handleInlineUpdate({ priority: p });
                      }}
                      options={PRIORITY_SELECT_OPTIONS}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    title={`Priority: ${priorityLabel(draftPriority)} — click to change`}
                    onClick={() => setEditingField('priority')}
                    className="xp-meta-pill-btn" style={metaPillButtonStyle}
                  >
                    <Priority kind={priorityKind(draftPriority)} size={12} />
                    <span>{draftPriority > 0 ? `P${draftPriority}` : 'No priority'}</span>
                  </button>
                )}
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--xp-muted)' }}>
                  Updated {formatRelative(issue.updatedAt)}
                </span>
              </div>

              <div>
                <label className="xp-meta" htmlFor="issue-title-editor">
                  TITLE
                </label>
                <input
                  id="issue-title-editor"
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  onBlur={handleSaveTitle}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      (e.target as HTMLInputElement).blur();
                    } else if (e.key === 'Escape') {
                      revertTitleRef.current = true;
                      setDraftTitle(issue.title);
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  style={titleInputStyle}
                />
                <div style={{ marginTop: 6, fontSize: 11, color: 'var(--xp-faint)', fontFamily: 'var(--xp-font-mono)' }}>
                  {saving ? 'Saving…' : 'Changes save automatically'}
                </div>
              </div>
            </section>

            <section style={panelStyle}>
              <SectionHeader title="Description" />
              {editingDescription ? (
                <div>
                  <RichTextEditor
                    content={editedDescription}
                    onChange={setEditedDescription}
                    onBlur={(html) => handleSaveDescription(html)}
                    variant="full"
                    placeholder="Add context, decisions, links, and next steps. Type / for commands…"
                    onImageUpload={handleImageUpload}
                    minHeight={180}
                  />
                  <div style={{ marginTop: 8, fontSize: 11, color: 'var(--xp-faint)', fontFamily: 'var(--xp-font-mono)' }}>
                    {savingDescription ? 'Saving…' : 'Changes save automatically'}
                  </div>
                </div>
              ) : (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setEditingDescription(true)}
                  onKeyDown={(e) => { if (e.key === 'Enter') setEditingDescription(true); }}
                  style={{
                    cursor: 'pointer',
                    borderRadius: 'var(--xp-r-sm)',
                    border: '1px dashed transparent',
                    padding: 8,
                    margin: -8,
                    transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--xp-border)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'transparent'; }}
                >
                  {issue?.description && issue.description !== '<p></p>' ? (
                    <RichTextRenderer content={issue.description} />
                  ) : (
                    <div style={{ ...mutedBodyTextStyle, fontStyle: 'italic' }}>Click to add description...</div>
                  )}
                </div>
              )}
            </section>

            <section style={panelStyle}>
              <SectionHeader title={`Checklists (${checklists.length})`} />
              {checklists.length === 0 && !showNewChecklistForm && (
                <div style={mutedBodyTextStyle}>No checklists yet.</div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {checklists.map((checklist) => {
                  const total = checklist.items.length;
                  const checked = checklist.items.filter((it) => it.checked).length;
                  const percent = total > 0 ? Math.round((checked / total) * 100) : 0;
                  return (
                    <div key={checklist.id} style={checklistCardStyle}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 12,
                          marginBottom: 10,
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{checklist.title}</div>
                          <div className="xp-muted" style={{ fontSize: 11, marginTop: 3 }}>
                            {checked}/{total} complete
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className="xp-mono xp-muted" style={{ fontSize: 11 }}>
                            {percent}%
                          </span>
                          <button
                            type="button"
                            title="Delete checklist"
                            onClick={() => handleDeleteChecklist(checklist.id)}
                            style={checklistDeleteBtnStyle}
                          >
                            &times;
                          </button>
                        </div>
                      </div>
                      <div style={progressTrackStyle}>
                        <div style={{ ...progressFillStyle, width: `${percent}%` }} />
                      </div>
                      <ul style={checklistListStyle}>
                        {checklist.items.map((item) => (
                          <li key={item.id} style={{ ...checklistItemStyle, gridTemplateColumns: '18px minmax(0, 1fr) 22px' }}>
                            <button
                              type="button"
                              aria-label={item.checked ? 'Uncheck item' : 'Check item'}
                              onClick={() => handleToggleChecklistItem(checklist.id, item)}
                              style={{
                                ...checkmarkStyle,
                                cursor: 'pointer',
                                opacity: item.checked ? 1 : 0.45,
                                background: item.checked
                                  ? 'var(--xp-accent-strong)'
                                  : 'transparent',
                                color: item.checked ? 'white' : 'var(--xp-muted)',
                              }}
                            >
                              {item.checked ? '✓' : ''}
                            </button>
                            <div style={{ minWidth: 0 }}>
                              {editingItemId === item.id ? (
                                <input
                                  ref={editInputRef}
                                  type="text"
                                  value={editingItemText}
                                  onChange={(e) => setEditingItemText(e.target.value)}
                                  onBlur={() => handleSaveEditItem(checklist.id, item.id)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveEditItem(checklist.id, item.id);
                                    if (e.key === 'Escape') setEditingItemId(null);
                                  }}
                                  style={checklistInlineInputStyle}
                                />
                              ) : (
                                <div
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => handleStartEditItem(item)}
                                  onKeyDown={(e) => { if (e.key === 'Enter') handleStartEditItem(item); }}
                                  style={{
                                    ...bodyTextStyle,
                                    fontSize: 12.5,
                                    textDecoration: item.checked ? 'line-through' : 'none',
                                    color: item.checked
                                      ? 'var(--xp-muted)'
                                      : 'var(--xp-ink)',
                                    cursor: 'text',
                                    borderRadius: 'var(--xp-r-sm)',
                                    padding: '1px 2px',
                                  }}
                                >
                                  {item.content}
                                </div>
                              )}
                              {(item.assigneeId || item.dueDate) && (
                                <div className="xp-muted" style={{ fontSize: 11, marginTop: 4 }}>
                                  {item.assigneeId
                                    ? nameForUser(item.assigneeId, usersById)
                                    : 'Unassigned'}
                                  {item.dueDate ? ` · due ${formatRelative(item.dueDate)}` : ''}
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              title="Delete item"
                              onClick={() => handleDeleteChecklistItem(checklist.id, item.id)}
                              style={checklistDeleteBtnStyle}
                            >
                              &times;
                            </button>
                          </li>
                        ))}
                      </ul>
                      {/* Add item input */}
                      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                        <input
                          type="text"
                          placeholder="+ Add item"
                          value={newItemText[checklist.id] ?? ''}
                          onChange={(e) =>
                            setNewItemText((prev) => ({ ...prev, [checklist.id]: e.target.value }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleAddChecklistItem(checklist.id);
                          }}
                          style={checklistAddInputStyle}
                        />
                      </div>
                    </div>
                  );
                })}
                {/* New checklist form */}
                {showNewChecklistForm ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      type="text"
                      placeholder="Checklist title"
                      value={newChecklistTitle}
                      onChange={(e) => setNewChecklistTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreateChecklist();
                        if (e.key === 'Escape') {
                          setShowNewChecklistForm(false);
                          setNewChecklistTitle('');
                        }
                      }}
                      autoFocus
                      style={checklistAddInputStyle}
                    />
                    <button
                      type="button"
                      onClick={() => handleCreateChecklist()}
                      style={checklistSmallBtnStyle}
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowNewChecklistForm(false);
                        setNewChecklistTitle('');
                      }}
                      style={{ ...checklistSmallBtnStyle, color: 'var(--xp-muted)' }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowNewChecklistForm(true)}
                    style={checklistAddBtnStyle}
                  >
                    + New checklist
                  </button>
                )}
              </div>
            </section>

            <section style={panelStyle}>
              <SectionHeader title={`Attachments`} />
              <AttachmentSection issueKey={key} token={token} />
            </section>

            <section style={panelStyle}>
              {(() => {
                const pinnedComments = comments.filter((c) => !!c.pinnedAt);
                const unresolvedComments = comments.filter((c) => !c.resolvedAt && !c.pinnedAt);
                const resolvedComments = comments.filter((c) => !!c.resolvedAt && !c.pinnedAt);
                return (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div style={{ fontSize: 11, letterSpacing: 'var(--xp-track-wide)', textTransform: 'uppercase', color: 'var(--xp-muted)', fontFamily: 'var(--xp-font-mono)' }}>Comments ({comments.length})</div>
                      {resolvedComments.length > 0 && (<button type="button" onClick={() => setShowResolved((prev) => !prev)} style={resolveButtonStyle}>{showResolved ? 'Hide' : 'Show'} resolved ({resolvedComments.length})</button>)}
                    </div>

                    {pinnedComments.length > 0 && (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ color: 'var(--xp-accent-strong)', flexShrink: 0 }}><path d="M9.828 1.172a2 2 0 0 1 2.828 0l2.172 2.172a2 2 0 0 1 0 2.828L12 9l-1 5-4-4-5.5 5.5L0 14l5.5-5.5L1.5 4.5l5-1L9.828 1.172Z" fill="currentColor" /></svg>
                          <span className="xp-mono xp-muted" style={{ fontSize: 10.5, letterSpacing: 'var(--xp-track-wide)', textTransform: 'uppercase' }}>Pinned ({pinnedComments.length})</span>
                        </div>
                        <ul style={{ display: 'flex', flexDirection: 'column', gap: 10, listStyle: 'none', padding: 0, margin: 0 }}>
                          {pinnedComments.map((comment) => (
                            <li key={comment.id} style={{ ...commentCardStyle, borderColor: 'var(--xp-accent-strong)', borderWidth: 1, borderLeftWidth: 3 }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                  <AgentAvatar name={nameForUser(comment.authorId, usersById)} src={comment.authorId ? usersById[comment.authorId]?.avatarUrl ?? undefined : undefined} size={18} isAgent={comment.authorId ? usersById[comment.authorId]?.isAgent : undefined} harness={comment.authorId ? usersById[comment.authorId]?.agentHarness : undefined} />
                                  <span className="xp-mono" style={{ fontSize: 11 }}>{comment.authorId === user?.id ? 'You' : nameForUser(comment.authorId, usersById)}</span>
                                  {comment.authorId && usersById[comment.authorId]?.isAgent && usersById[comment.authorId]?.agentHarness && (<HarnessPill harness={usersById[comment.authorId]!.agentHarness!} />)}
                                  <span className="xp-muted" style={{ fontSize: 11 }}>{formatRelative(comment.createdAt)}</span>
                                  <span className="xp-muted" style={{ fontSize: 10, fontStyle: 'italic' }}>pinned by {comment.pinnedBy === user?.id ? 'you' : (comment.pinnedByUser?.displayName ?? comment.pinnedByUser?.email ?? 'someone')}{comment.pinnedAt ? ` ${formatRelative(comment.pinnedAt)}` : ''}</span>
                                </span>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                                  <button type="button" onClick={() => handleUnpinComment(comment.id)} title="Unpin comment" style={pinButtonStyle}>Unpin</button>
                                  {comment.authorId === user?.id && (<button type="button" onClick={() => handleDeleteComment(comment.id)} style={textButtonStyle}>Delete</button>)}
                                </span>
                              </div>
                              <div style={{ marginTop: 8 }}><RichTextRenderer content={comment.body} /></div>
                              <div style={{ marginTop: 10 }}><ReactionBar reactions={comment.reactions} onToggle={(emoji) => handleToggleCommentReaction(comment.id, emoji)} /></div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {showResolved && resolvedComments.length > 0 && (
                      <ul style={{ display: 'flex', flexDirection: 'column', gap: 10, listStyle: 'none', padding: 0, margin: '0 0 14px 0' }}>
                        {resolvedComments.map((comment) => {
                          const isExpanded = expandedResolved.has(comment.id);
                          return (
                            <li key={comment.id} style={{ ...commentCardStyle, opacity: isExpanded ? 0.7 : 0.5, borderStyle: 'dashed' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, cursor: 'pointer' }} role="button" tabIndex={0} onClick={() => setExpandedResolved((prev) => { const next = new Set(prev); if (next.has(comment.id)) next.delete(comment.id); else next.add(comment.id); return next; })} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedResolved((prev) => { const next = new Set(prev); if (next.has(comment.id)) next.delete(comment.id); else next.add(comment.id); return next; }); } }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                                  <span className="xp-mono">Comment by {comment.authorId === user?.id ? 'You' : nameForUser(comment.authorId, usersById)}</span>
                                  <span className="xp-muted">resolved</span>
                                </span>
                                <button type="button" onClick={(e) => { e.stopPropagation(); handleUnresolveComment(comment.id); }} style={resolveButtonStyle}>Re-open</button>
                              </div>
                              {isExpanded && (<><div style={{ ...bodyTextStyle, marginTop: 8 }}><RichTextRenderer content={comment.body} /></div><div style={{ marginTop: 10 }}><ReactionBar reactions={comment.reactions} onToggle={(emoji) => handleToggleCommentReaction(comment.id, emoji)} /></div></>)}
                            </li>);
                        })}
                      </ul>
                    )}

                    <ul style={{ display: 'flex', flexDirection: 'column', gap: 14, listStyle: 'none', padding: 0, margin: 0 }}>
                      {unresolvedComments.map((comment) => (
                        <li key={comment.id} style={commentCardStyle}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                              <AgentAvatar name={nameForUser(comment.authorId, usersById)} src={comment.authorId ? usersById[comment.authorId]?.avatarUrl ?? undefined : undefined} size={18} isAgent={comment.authorId ? usersById[comment.authorId]?.isAgent : undefined} harness={comment.authorId ? usersById[comment.authorId]?.agentHarness : undefined} />
                              <span className="xp-mono" style={{ fontSize: 11 }}>{comment.authorId === user?.id ? 'You' : nameForUser(comment.authorId, usersById)}</span>
                              {comment.authorId && usersById[comment.authorId]?.isAgent && usersById[comment.authorId]?.agentHarness && (<HarnessPill harness={usersById[comment.authorId]!.agentHarness!} />)}
                              <span className="xp-muted" style={{ fontSize: 11 }}>{formatRelative(comment.createdAt)}</span>
                            </span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                              <button type="button" onClick={() => handlePinComment(comment.id)} title="Pin comment" style={pinButtonStyle}>Pin</button>
                              <button type="button" onClick={() => handleResolveComment(comment.id)} style={resolveButtonStyle}>Resolve</button>
                              {comment.authorId === user?.id && (<button type="button" onClick={() => handleDeleteComment(comment.id)} style={textButtonStyle}>Delete</button>)}
                            </span>
                          </div>
                          <div style={{ marginTop: 8 }}><RichTextRenderer content={comment.body} /></div>
                          <div style={{ marginTop: 10 }}><ReactionBar reactions={comment.reactions} onToggle={(emoji) => handleToggleCommentReaction(comment.id, emoji)} /></div>
                        </li>
                      ))}
                    </ul>
                  </>
                );
              })()}

              <form onSubmit={handlePostComment} style={{ marginTop: 18 }}>
                <RichTextEditor
                  content={newComment}
                  onChange={setNewComment}
                  variant="comment"
                  placeholder="Add a comment. Mention with @email@example.com"
                  onImageUpload={handleImageUpload}
                  onSubmit={() => {
                    if (!posting && newComment.trim()) {
                      void handlePostComment(new Event('submit') as unknown as FormEvent);
                    }
                  }}
                  minHeight={80}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                  <button
                    type="submit"
                    disabled={posting || !newComment.trim() || newComment === '<p></p>'}
                    style={primaryButtonStyle}
                  >
                    {posting ? 'Posting…' : 'Post comment'}
                  </button>
                </div>
              </form>
            </section>
          </div>

          <aside
            style={{
              minWidth: 0,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
              overflow: 'auto',
              paddingRight: 4,
            }}
          >
            <section style={panelStyle}>
              <SectionHeader title="Overview" />

              {/* State — click to edit */}
              {editingField === 'state' ? (
                <div style={{ ...metaRowStyle, marginBottom: 8 }}>
                  <span className="xp-meta">State</span>
                  <Select
                    value={draftStateId}
                    onValueChange={(value) => {
                      setDraftStateId(value);
                      handleInlineUpdate({ stateId: value });
                    }}
                    options={stateSelectOptions(states)}
                  />
                </div>
              ) : (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setEditingField('state')}
                  onKeyDown={(e) => e.key === 'Enter' && setEditingField('state')}
                  className="xp-editable-row" style={{ ...metaRowStyle, ...editableRowStyle, marginBottom: 8 }}
                >
                  <span className="xp-meta">State</span>
                  <EditableValue>
                    {selectedState && <StateDot kind={selectedState.type} size={12} />}
                    <span>{selectedState?.name ?? 'None'}</span>
                  </EditableValue>
                </div>
              )}

              {/* Priority — click to edit */}
              {editingField === 'priority' ? (
                <div style={{ ...metaRowStyle, marginBottom: 8 }}>
                  <span className="xp-meta">Priority</span>
                  <Select
                    value={String(draftPriority)}
                    onValueChange={(value) => {
                      const p = Number.parseInt(value, 10) || 0;
                      setDraftPriority(p);
                      handleInlineUpdate({ priority: p });
                    }}
                    options={PRIORITY_SELECT_OPTIONS}
                  />
                </div>
              ) : (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setEditingField('priority')}
                  onKeyDown={(e) => e.key === 'Enter' && setEditingField('priority')}
                  className="xp-editable-row" style={{ ...metaRowStyle, ...editableRowStyle, marginBottom: 8 }}
                >
                  <span className="xp-meta">Priority</span>
                  <EditableValue>
                    <Priority kind={priorityKind(draftPriority)} size={12} />
                    <span>{priorityLabel(draftPriority)}</span>
                  </EditableValue>
                </div>
              )}

              {/* Type — click to edit (XP-88) */}
              {editingField === 'type' ? (
                <div style={{ ...metaRowStyle, marginBottom: 8 }}>
                  <span className="xp-meta">Type</span>
                  <Select
                    value={issue.type}
                    onValueChange={(v) => handleInlineUpdate({ type: v })}
                    options={TYPE_SELECT_OPTIONS}
                  />
                </div>
              ) : (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setEditingField('type')}
                  onKeyDown={(e) => e.key === 'Enter' && setEditingField('type')}
                  className="xp-editable-row" style={{ ...metaRowStyle, ...editableRowStyle, marginBottom: 8 }}
                >
                  <span className="xp-meta">Type</span>
                  <EditableValue>
                    <IssueTypeIcon type={issue.type} size={12} />
                    <span>{issueTypeLabel(issue.type)}</span>
                  </EditableValue>
                </div>
              )}

              {/* Blocked — toggle (XP-88) */}
              <div className="xp-editable-row" style={{ ...metaRowStyle, marginBottom: 8 }}>
                <span className="xp-meta">Blocked</span>
                <button
                  type="button"
                  onClick={() => handleInlineUpdate({ blocked: !issue.blocked })}
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

              {/* Assignee — multi-select (XP-72 parity in detail) */}
              <div className="xp-editable-row" style={{ ...metaRowStyle, marginBottom: 8 }}>
                <span className="xp-meta">Assignee</span>
                <AssigneePicker
                  users={workspaceUsers}
                  selectedIds={detailAssignees.map((u) => u.id)}
                  onChange={handleSetAssignees}
                  title="Set assignees"
                  style={{ width: '100%' }}
                >
                  <EditableValue muted={detailAssignees.length === 0}>
                    {detailAssignees.length > 0 ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        <AssigneeStack assignees={detailAssignees} size={18} />
                        <span className="xp-mono" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {detailAssignees.length === 1
                            ? (detailAssignees[0]!.displayName ?? detailAssignees[0]!.email)
                            : `${detailAssignees.length} assignees`}
                        </span>
                      </span>
                    ) : (
                      'Unassigned'
                    )}
                  </EditableValue>
                </AssigneePicker>
              </div>

              {/* Creator — read-only */}
              <div style={{ ...metaRowStyle, marginBottom: 8 }}>
                <span className="xp-meta">Creator</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <AgentAvatar name={nameForUser(issue.creatorId, usersById)} src={usersById[issue.creatorId]?.avatarUrl ?? undefined} size={18} isAgent={usersById[issue.creatorId]?.isAgent} harness={usersById[issue.creatorId]?.agentHarness} />
                  <span className="xp-mono" style={{ fontSize: 11 }}>{nameForUser(issue.creatorId, usersById)}</span>
                  {usersById[issue.creatorId]?.isAgent && usersById[issue.creatorId]?.agentHarness && (<HarnessPill harness={usersById[issue.creatorId]!.agentHarness!} />)}
                </span>
              </div>

              <MetaRow label="Created" value={formatRelative(issue.createdAt)} />
              <MetaRow label="Updated" value={formatRelative(issue.updatedAt)} />
              <div
                className="xp-editable-row"
                style={{ ...metaRowStyle, ...editableRowStyle, alignItems: 'start', marginBottom: 8 }}
              >
                <span className="xp-meta">Start</span>
                <DatePickerInline
                  label="Start"
                  value={issue.startDate}
                  onChange={async (date) => {
                    const previous = issue;
                    setIssue({ ...issue, startDate: date });
                    try {
                      const result = await api.updateIssue(issue.key, { startDate: date }, token);
                      setIssue(result.issue);
                    } catch {
                      setIssue(previous);
                    }
                  }}
                />
              </div>
              <div
                className="xp-editable-row"
                style={{ ...metaRowStyle, ...editableRowStyle, alignItems: 'start', marginBottom: 8 }}
              >
                <span className="xp-meta">Due</span>
                <DatePickerInline
                  label="Due"
                  value={issue.dueDate}
                  onChange={async (date) => {
                    const previous = issue;
                    setIssue({ ...issue, dueDate: date });
                    try {
                      const result = await api.updateIssue(issue.key, { dueDate: date }, token);
                      setIssue(result.issue);
                    } catch {
                      setIssue(previous);
                    }
                  }}
                />
              </div>
              <div style={{ ...metaRowStyle, marginBottom: 8 }}>
                <span className="xp-meta">Milestone</span>
                <span>{issue.milestoneId ? milestones.find((m) => m.id === issue.milestoneId)?.name ?? 'Unknown' : 'None'}</span>
              </div>
              <div style={{ marginTop: 14 }}>
                <div className="xp-meta" style={{ marginBottom: 8 }}>
                  RECURRENCE
                </div>
                <RecurrenceEditor
                  rule={issue.recurrenceRule}
                  active={issue.recurrenceActive}
                  nextAt={issue.recurrenceNextAt}
                  onSet={async (rule, active) => {
                    const { issue: updated } = await api.setRecurrence(key, { rule, active }, token);
                    setIssue(updated);
                  }}
                  onClear={async () => {
                    const { issue: updated } = await api.clearRecurrence(key, token);
                    setIssue(updated);
                  }}
                />
              </div>
              {issue.labels && issue.labels.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div className="xp-meta" style={{ marginBottom: 8 }}>
                    LABELS
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {issue.labels.map((label) => (
                      <LabelChip key={label.id} label={label} />
                    ))}
                  </div>
                </div>
              )}
              {issue.tags && issue.tags.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div className="xp-meta" style={{ marginBottom: 8 }}>
                    TAGS
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {issue.tags.map((tag) => (
                      <TagChip key={tag.id} tag={tag} />
                    ))}
                  </div>
                </div>
              )}
            </section>

            <section style={panelStyle}>
              <SectionHeader title={`Relations (${relations.length})`} />
              {relations.length === 0 ? (
                <div style={mutedBodyTextStyle}>No linked issues yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {relations.map((relation) => (
                    <div
                      key={relation.id}
                      style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          navigate(`/issues/${encodeURIComponent(relation.relatedIssueKey)}/full`)
                        }
                        style={{ ...sideListButtonStyle, flex: 1 }}
                      >
                        <span className="xp-mono xp-muted" style={{ fontSize: 10.5 }}>
                          {relation.type.replaceAll('_', ' ')}
                        </span>
                        <span className="xp-mono" style={{ color: 'var(--xp-muted)' }}>
                          {relation.relatedIssueKey}
                        </span>
                        <span
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {relation.relatedIssueTitle}
                        </span>
                      </button>
                      <button
                        type="button"
                        title="Remove relation"
                        onClick={async () => {
                          try {
                            await api.deleteRelation(
                              issue.key,
                              {
                                toIssueKey: relation.relatedIssueKey,
                                type: relation.type,
                              },
                              token,
                            );
                            setRelations((cur) => cur.filter((r) => r.id !== relation.id));
                          } catch {}
                        }}
                        style={relationDeleteBtnStyle}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 8 }}>
                <RelationCreator
                  token={token}
                  currentIssueKey={issue.key}
                  onAdd={async (toIssueKey, type) => {
                    await api.createRelation(issue.key, { toIssueKey, type }, token);
                    const { relations } = await api.getIssue(issue.key, token);
                    setRelations(relations);
                  }}
                />
              </div>
            </section>

            <section style={panelStyle}>
              <SectionHeader title={`Sub-issues (${subIssues.length})`} />
              {subIssues.length === 0 && !showSubIssueForm ? (
                <div style={mutedBodyTextStyle}>No sub-issues yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {subIssues.map((subIssue) => {
                    const subState = states.find((state) => state.id === subIssue.stateId);
                    return (
                      <button
                        key={subIssue.id}
                        type="button"
                        onClick={() => navigate(`/issues/${encodeURIComponent(subIssue.key)}/full`)}
                        style={sideListButtonStyle}
                      >
                        <StateDot kind={subState?.type ?? 'unstarted'} size={12} />
                        <span className="xp-mono" style={{ color: 'var(--xp-muted)' }}>
                          {subIssue.key}
                        </span>
                        <span
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flex: 1,
                          }}
                        >
                          {subIssue.title}
                        </span>
                        <Priority kind={priorityKind(subIssue.priority)} size={12} />
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
                    gap: 8,
                    marginTop: subIssues.length > 0 ? 8 : 0,
                    padding: '10px',
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
                      padding: '6px 8px',
                      border: '1px solid var(--xp-hairline)',
                      borderRadius: 'var(--xp-r-sm)',
                      background: 'var(--xp-surface)',
                      color: 'var(--xp-ink)',
                      fontFamily: 'var(--xp-font-mono)',
                      fontSize: 12,
                      outline: 'none',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
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
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setShowSubIssueForm(false);
                        setSubIssueTitle('');
                        setSubIssueStateId('');
                        setSubIssueAssigneeId('');
                      }}
                      style={{
                        padding: '4px 10px',
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
                        padding: '4px 10px',
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
                    marginTop: subIssues.length > 0 ? 8 : 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 10px',
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
            </section>

            <section style={panelStyle}>
              <SectionHeader title={`Activity (${activity.length})`} />
              {activity.length === 0 ? (
                <div style={mutedBodyTextStyle}>No activity yet.</div>
              ) : (
                <div style={{ position: 'relative', paddingLeft: 20 }}>
                  {/* Vertical timeline line */}
                  <div
                    style={{
                      position: 'absolute',
                      left: 5,
                      top: 4,
                      bottom: 4,
                      width: 1,
                      background: 'var(--xp-hairline)',
                    }}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {activity.map((entry) => (
                      <div key={entry.id} style={{ position: 'relative' }}>
                        {/* Timeline dot */}
                        <div
                          style={{
                            position: 'absolute',
                            left: -20,
                            top: 3,
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            background: activityDotColor(entry.action),
                            border: '2px solid var(--xp-surface)',
                            boxSizing: 'border-box',
                          }}
                        />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          <AgentAvatar
                            name={entry.actorDisplayName ?? entry.actorEmail ?? 'System'}
                            src={entry.actorAvatarUrl ?? undefined}
                            size={16}
                            isAgent={entry.actorId ? usersById[entry.actorId]?.isAgent : undefined}
                            harness={entry.actorId ? usersById[entry.actorId]?.agentHarness : undefined}
                          />
                          <span className="xp-mono" style={{ fontSize: 11, fontWeight: 600 }}>
                            {entry.actorDisplayName ?? entry.actorEmail ?? 'System'}
                          </span>
                          <span className="xp-muted" style={{ fontSize: 10.5, marginLeft: 'auto', flexShrink: 0 }}>
                            {formatRelative(entry.createdAt)}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--xp-muted)', lineHeight: 1.5 }}>
                          {formatActivityDescription(entry, usersById, states)}
                        </div>
                      </div>
                    ))}
                  </div>
                  {activityCursor && (
                    <button
                      type="button"
                      onClick={() => handleLoadMoreActivity()}
                      disabled={loadingMoreActivity}
                      style={{
                        marginTop: 12,
                        marginLeft: -20,
                        width: 'calc(100% + 20px)',
                        border: '1px dashed var(--xp-hairline)',
                        borderRadius: 'var(--xp-r-sm)',
                        background: 'transparent',
                        color: 'var(--xp-muted)',
                        cursor: loadingMoreActivity ? 'wait' : 'pointer',
                        fontFamily: 'var(--xp-font-mono)',
                        fontSize: 11,
                        padding: '6px 0',
                        textAlign: 'center',
                      }}
                    >
                      {loadingMoreActivity ? 'Loading...' : 'Load older activity'}
                    </button>
                  )}
                </div>
              )}
            </section>
          </aside>
        </main>
      </div>
    </AppLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className="xp-meta">{label}</span>
      {children}
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div
      style={{
        marginBottom: 12,
        fontSize: 11,
        letterSpacing: 'var(--xp-track-wide)',
        textTransform: 'uppercase',
        color: 'var(--xp-muted)',
        fontFamily: 'var(--xp-font-mono)',
      }}
    >
      {title}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ ...overviewRowStyle, marginBottom: 8 }}>
      <span className="xp-meta">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function IssueMetaPill({ label, leading, title }: { label: string; leading?: React.ReactNode; title?: string }) {
  return (
    <span
      title={title ?? label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        border: '1px solid var(--xp-border)',
        borderRadius: 999,
        background: 'var(--xp-canvas)',
        padding: '4px 9px',
        fontSize: 11,
        fontFamily: 'var(--xp-font-mono)',
      }}
    >
      {leading}
      <span>{label}</span>
    </span>
  );
}

function activityDotColor(action: ActivityEntry['action']): string {
  switch (action) {
    case 'state_change':
      return '#4EA7FC'; // blue
    case 'assignment_change':
      return '#A78BFA'; // purple
    case 'priority_change':
      return '#F59E0B'; // amber
    case 'label_change':
      return '#34D399'; // green
    case 'comment_added':
    case 'comment_resolved':
      return '#6B7280'; // zinc-500
    case 'title_edit':
    case 'description_edit':
      return '#9CA3AF'; // zinc-400
    case 'relation_added':
    case 'relation_removed':
      return '#60A5FA'; // blue-400
    default:
      return '#6B7280';
  }
}

const PRIORITY_LABELS: Record<number, string> = {
  0: 'No priority',
  1: 'Urgent',
  2: 'High',
  3: 'Normal',
  4: 'Low',
};

function formatActivityDescription(
  entry: ActivityEntry,
  usersById: Record<string, { id: string; displayName: string | null; email: string }>,
  states: { id: string; name: string }[],
): string {
  const { action, oldValue, newValue } = entry;

  switch (action) {
    case 'state_change': {
      const oldState = states.find((s) => s.id === String(oldValue));
      const newState = states.find((s) => s.id === String(newValue));
      return `changed status from ${oldState?.name ?? 'unknown'} to ${newState?.name ?? 'unknown'}`;
    }
    case 'assignment_change': {
      if (!newValue) return 'removed the assignee';
      const assignee = usersById[String(newValue)];
      const name = assignee?.displayName ?? assignee?.email ?? 'someone';
      if (!oldValue) return `assigned to ${name}`;
      return `reassigned to ${name}`;
    }
    case 'priority_change': {
      const oldP = PRIORITY_LABELS[Number(oldValue)] ?? `P${oldValue}`;
      const newP = PRIORITY_LABELS[Number(newValue)] ?? `P${newValue}`;
      return `changed priority from ${oldP} to ${newP}`;
    }
    case 'label_change': {
      const val = (newValue ?? oldValue) as Record<string, unknown> | null;
      if (!val) return 'changed labels';
      const op = val.op === 'removed' ? 'removed' : 'added';
      const labelName = val.labelName ? String(val.labelName) : 'a label';
      return `${op} label ${labelName}`;
    }
    case 'title_edit':
      return 'updated the title';
    case 'description_edit':
      return 'updated the description';
    case 'comment_added':
      return 'added a comment';
    case 'comment_resolved':
      return 'resolved a comment thread';
    case 'relation_added':
      return 'added a relation';
    case 'relation_removed':
      return 'removed a relation';
    default:
      return (action as string).replaceAll('_', ' ');
  }
}

function applyReactionToggle(
  current: ReactionSummary[],
  emoji: string,
  userId: string,
  add: boolean,
): ReactionSummary[] {
  const existing = current.find((r) => r.emoji === emoji);
  if (!existing) {
    if (!add) return current;
    return [...current, { emoji, count: 1, mine: true, userIds: [userId] }].sort(
      (a, b) => b.count - a.count,
    );
  }
  if (add) {
    if (existing.mine) return current;
    return current.map((reaction) =>
      reaction.emoji === emoji
        ? {
            ...reaction,
            count: reaction.count + 1,
            mine: true,
            userIds: [...reaction.userIds, userId],
          }
        : reaction,
    );
  }
  const updatedCount = existing.count - 1;
  if (updatedCount <= 0) return current.filter((reaction) => reaction.emoji !== emoji);
  return current.map((reaction) =>
    reaction.emoji === emoji
      ? {
          ...reaction,
          count: updatedCount,
          mine: false,
          userIds: reaction.userIds.filter((id) => id !== userId),
        }
      : reaction,
  );
}

// Shared with IssuePeek so the two overview cards render identically.
const metaRowStyle = overviewRowStyle;

const editableRowStyle: React.CSSProperties = {
  cursor: 'pointer',
  transition: 'background 120ms ease',
};

const metaPillButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  border: '1px solid var(--xp-border)',
  borderRadius: 999,
  background: 'var(--xp-canvas)',
  padding: '4px 9px',
  fontSize: 11,
  fontFamily: 'var(--xp-font-mono)',
  cursor: 'pointer',
  color: 'var(--xp-ink)',
  transition: 'background 120ms ease',
};

const panelStyle: React.CSSProperties = {
  border: '1px solid var(--xp-hairline)',
  borderRadius: 'var(--xp-r-md)',
  background: 'var(--xp-surface)',
  padding: 18,
  boxShadow: 'var(--xp-shadow-1)',
};

const titleInputStyle: React.CSSProperties = {
  width: '100%',
  marginTop: 6,
  border: '1px solid var(--xp-border)',
  borderRadius: 'var(--xp-r-md)',
  background: 'var(--xp-canvas)',
  color: 'var(--xp-ink)',
  fontSize: 28,
  fontWeight: 650,
  lineHeight: 1.2,
  padding: '12px 14px',
};

const primaryButtonStyle: React.CSSProperties = {
  border: '1px solid transparent',
  borderRadius: 'var(--xp-r-sm)',
  background: 'var(--xp-accent)',
  color: 'var(--xp-accent-fg)',
  padding: '9px 14px',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
};

const bodyTextStyle: React.CSSProperties = {
  fontSize: 13,
  lineHeight: 1.6,
  whiteSpace: 'pre-wrap',
};

const mutedBodyTextStyle: React.CSSProperties = {
  ...bodyTextStyle,
  color: 'var(--xp-muted)',
};

const commentCardStyle: React.CSSProperties = {
  border: '1px solid var(--xp-hairline)',
  borderRadius: 'var(--xp-r-md)',
  background: 'var(--xp-canvas)',
  padding: 14,
};

const checklistCardStyle: React.CSSProperties = {
  border: '1px solid var(--xp-hairline)',
  borderRadius: 'var(--xp-r-md)',
  background: 'var(--xp-canvas)',
  padding: 14,
};

const progressTrackStyle: React.CSSProperties = {
  height: 8,
  borderRadius: 999,
  background: 'var(--xp-hairline)',
  overflow: 'hidden',
};

const progressFillStyle: React.CSSProperties = {
  height: '100%',
  borderRadius: 999,
  background: 'var(--xp-accent-strong)',
};

const checklistListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  listStyle: 'none',
  padding: 0,
  margin: '12px 0 0',
};

const checklistItemStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '18px minmax(0, 1fr)',
  gap: 10,
  alignItems: 'start',
};

const checkmarkStyle: React.CSSProperties = {
  width: 18,
  height: 18,
  borderRadius: 999,
  border: '1px solid var(--xp-border)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 11,
  marginTop: 1,
};

const sideListButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  textAlign: 'left',
  border: '1px solid var(--xp-hairline)',
  borderRadius: 'var(--xp-r-sm)',
  background: 'var(--xp-canvas)',
  color: 'var(--xp-ink)',
  padding: '8px 10px',
  cursor: 'pointer',
  fontFamily: 'var(--xp-font-mono)',
  fontSize: 11.5,
};

const breadcrumbLinkStyle: React.CSSProperties = {
  fontFamily: 'var(--xp-font-mono)',
  fontSize: 11,
  color: 'var(--xp-muted)',
  textDecoration: 'none',
  letterSpacing: 'var(--xp-track-wide)',
  textTransform: 'uppercase',
  transition: 'color 150ms ease',
};

const headerLinkStyle: React.CSSProperties = {
  fontFamily: 'var(--xp-font-mono)',
  fontSize: 11,
  letterSpacing: 'var(--xp-track-wide)',
  textTransform: 'uppercase',
  color: 'var(--xp-accent-strong)',
  textDecoration: 'none',
};

const pinButtonStyle: React.CSSProperties = {
  border: '1px solid var(--xp-border)',
  borderRadius: 'var(--xp-r-sm)',
  background: 'transparent',
  color: 'var(--xp-muted)',
  cursor: 'pointer',
  fontFamily: 'var(--xp-font-mono)',
  fontSize: 10.5,
  padding: '3px 8px',
  letterSpacing: 'var(--xp-track-wide)',
};

const textButtonStyle: React.CSSProperties = {
  border: 0,
  background: 'transparent',
  color: 'var(--xp-danger)',
  cursor: 'pointer',
  fontFamily: 'var(--xp-font-mono)',
  fontSize: 11,
  padding: 0,
};

const relationDeleteBtnStyle: React.CSSProperties = {
  width: 22,
  height: 22,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid var(--xp-hairline)',
  borderRadius: 'var(--xp-r-sm)',
  background: 'var(--xp-canvas)',
  color: 'var(--xp-muted)',
  cursor: 'pointer',
  fontFamily: 'var(--xp-font-mono)',
  fontSize: 10,
  flexShrink: 0,
};

const checklistDeleteBtnStyle: React.CSSProperties = {
  width: 22,
  height: 22,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid var(--xp-hairline)',
  borderRadius: 'var(--xp-r-sm)',
  background: 'transparent',
  color: 'var(--xp-muted)',
  cursor: 'pointer',
  fontFamily: 'var(--xp-font-mono)',
  fontSize: 12,
  flexShrink: 0,
  padding: 0,
};

const checklistAddInputStyle: React.CSSProperties = {
  flex: 1,
  border: '1px solid var(--xp-border)',
  borderRadius: 'var(--xp-r-sm)',
  background: 'var(--xp-canvas)',
  color: 'var(--xp-ink)',
  padding: '6px 10px',
  fontSize: 12,
  fontFamily: 'inherit',
};

const checklistInlineInputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid var(--xp-border)',
  borderRadius: 'var(--xp-r-sm)',
  background: 'var(--xp-canvas)',
  color: 'var(--xp-ink)',
  padding: '2px 6px',
  fontSize: 12.5,
  fontFamily: 'inherit',
  lineHeight: 1.6,
};

const checklistSmallBtnStyle: React.CSSProperties = {
  border: '1px solid var(--xp-border)',
  borderRadius: 'var(--xp-r-sm)',
  background: 'var(--xp-canvas)',
  color: 'var(--xp-ink)',
  padding: '6px 10px',
  fontSize: 11,
  fontFamily: 'var(--xp-font-mono)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const checklistAddBtnStyle: React.CSSProperties = {
  border: '1px dashed var(--xp-border)',
  borderRadius: 'var(--xp-r-sm)',
  background: 'transparent',
  color: 'var(--xp-muted)',
  padding: '8px 12px',
  fontSize: 12,
  fontFamily: 'var(--xp-font-mono)',
  cursor: 'pointer',
  textAlign: 'left',
};

const resolveButtonStyle: React.CSSProperties = {
  border: '1px solid var(--xp-border)',
  borderRadius: 'var(--xp-r-sm)',
  background: 'transparent',
  color: 'var(--xp-muted)',
  cursor: 'pointer',
  fontFamily: 'var(--xp-font-mono)',
  fontSize: 10.5,
  padding: '3px 8px',
  letterSpacing: 'var(--xp-track-wide)',
};
