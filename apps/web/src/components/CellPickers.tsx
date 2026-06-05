// apps/web/src/components/CellPickers.tsx
//
// PER-108 — Three pickers used for inline edit-in-place: state, priority,
// assignee. Each exposes `<XPicker anchor onClose onSelect current ...>`.
// The popover/anchor wrapper is in CellPopover.

import { Avatar, Priority, StateDot, type WorkflowState as StateKind } from '@xpntl/ui';
import { AgentAvatar } from './AgentBadge';
import { useState } from 'react';
import type { Label, Milestone, Tag, WorkflowState, WorkspaceUser } from '../lib/api';
import { priorityKind } from '../lib/format';
import { CellPopover, CellPopoverOption } from './CellPopover';

// ---- State picker ----------------------------------------------------------

interface StatePickerProps {
  anchor: HTMLElement | null;
  states: WorkflowState[];
  currentStateId: string;
  onSelect: (stateId: string) => void;
  onClose: () => void;
}

export function StatePicker({
  anchor,
  states,
  currentStateId,
  onSelect,
  onClose,
}: StatePickerProps) {
  return (
    <CellPopover anchor={anchor} onClose={onClose} width={220}>
      <div className="xp-meta" style={{ padding: '4px 8px 6px', color: 'var(--xp-muted)' }}>
        STATE
      </div>
      {states.map((s) => (
        <CellPopoverOption
          key={s.id}
          selected={s.id === currentStateId}
          onSelect={() => {
            onSelect(s.id);
            onClose();
          }}
        >
          <StateDot kind={(s.type as StateKind) ?? 'unstarted'} size={12} />
          <span>{s.name}</span>
        </CellPopoverOption>
      ))}
    </CellPopover>
  );
}

// ---- Priority picker -------------------------------------------------------

const PRIORITY_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 1, label: 'Urgent' },
  { value: 2, label: 'High' },
  { value: 3, label: 'Normal' },
  { value: 4, label: 'Low' },
  { value: 0, label: 'No priority' },
];

interface PriorityPickerProps {
  anchor: HTMLElement | null;
  currentPriority: number;
  onSelect: (priority: number) => void;
  onClose: () => void;
}

export function PriorityPicker({
  anchor,
  currentPriority,
  onSelect,
  onClose,
}: PriorityPickerProps) {
  return (
    <CellPopover anchor={anchor} onClose={onClose} width={180}>
      <div className="xp-meta" style={{ padding: '4px 8px 6px', color: 'var(--xp-muted)' }}>
        PRIORITY
      </div>
      {PRIORITY_OPTIONS.map((o) => (
        <CellPopoverOption
          key={o.value}
          selected={o.value === currentPriority}
          onSelect={() => {
            onSelect(o.value);
            onClose();
          }}
        >
          <Priority kind={priorityKind(o.value)} size={12} />
          <span>{o.label}</span>
        </CellPopoverOption>
      ))}
    </CellPopover>
  );
}

// ---- Assignee picker -------------------------------------------------------

interface AssigneePickerProps {
  anchor: HTMLElement | null;
  users: WorkspaceUser[];
  currentAssigneeId: string | null;
  onSelect: (assigneeId: string | null) => void;
  onClose: () => void;
}

export function AssigneePicker({
  anchor,
  users,
  currentAssigneeId,
  onSelect,
  onClose,
}: AssigneePickerProps) {
  return (
    <CellPopover anchor={anchor} onClose={onClose} width={240}>
      <div className="xp-meta" style={{ padding: '4px 8px 6px', color: 'var(--xp-muted)' }}>
        ASSIGNEE
      </div>
      <CellPopoverOption
        selected={currentAssigneeId === null}
        onSelect={() => {
          onSelect(null);
          onClose();
        }}
      >
        <span
          aria-hidden
          style={{
            width: 18,
            height: 18,
            borderRadius: 'var(--xp-r-sm)',
            border: '1px dashed var(--xp-muted)',
            display: 'inline-block',
          }}
        />
        <span>Unassigned</span>
      </CellPopoverOption>
      {users.map((u) => (
        <CellPopoverOption
          key={u.id}
          selected={u.id === currentAssigneeId}
          onSelect={() => {
            onSelect(u.id);
            onClose();
          }}
        >
          <AgentAvatar name={u.displayName ?? u.email} src={u.avatarUrl ?? undefined} size={18} isAgent={u.isAgent} harness={u.agentHarness} />
          <span>{u.displayName ?? u.email}</span>
          {u.isAgent && u.agentHarness && <span style={{ fontSize: 9.5, color: 'var(--xp-muted)', marginLeft: 'auto', flexShrink: 0 }}>{u.agentHarness.replace(/_/g, ' ')}</span>}
        </CellPopoverOption>
      ))}
    </CellPopover>
  );
}

// ---- Label picker ----------------------------------------------------------

interface LabelPickerProps {
  anchor: HTMLElement | null;
  /** All workspace labels. */
  labels: Label[];
  /** Currently attached label ids. */
  attachedIds: Set<string>;
  onToggle: (labelId: string, attach: boolean) => void;
  onCreate?: (name: string) => Promise<Label | null>;
  onClose: () => void;
}

export function LabelPicker({
  anchor,
  labels,
  attachedIds,
  onToggle,
  onCreate,
  onClose,
}: LabelPickerProps) {
  const [query, setQuery] = useState('');
  const lower = query.trim().toLowerCase();
  const visible = lower ? labels.filter((l) => l.name.toLowerCase().includes(lower)) : labels;
  const exactMatch = visible.find((l) => l.name.toLowerCase() === lower);
  const canCreate = onCreate && lower.length > 0 && !exactMatch;

  return (
    <CellPopover anchor={anchor} onClose={onClose} width={260}>
      <div className="xp-meta" style={{ padding: '4px 8px 4px', color: 'var(--xp-muted)' }}>
        LABELS
      </div>
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter or create…"
        style={{
          width: '100%',
          padding: '4px 8px',
          border: 0,
          borderTop: '1px solid var(--xp-hairline)',
          borderBottom: '1px solid var(--xp-hairline)',
          outline: 0,
          background: 'transparent',
          fontFamily: 'var(--xp-font-mono)',
          fontSize: 12,
          color: 'var(--xp-ink)',
          marginBottom: 4,
        }}
      />
      {visible.length === 0 && !canCreate && (
        <div style={{ padding: '6px 10px', color: 'var(--xp-muted)', fontSize: 11.5 }}>
          No labels match.
        </div>
      )}
      {visible.map((l) => {
        const attached = attachedIds.has(l.id);
        return (
          <CellPopoverOption
            key={l.id}
            selected={attached}
            onSelect={() => onToggle(l.id, !attached)}
          >
            <span
              aria-hidden
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: l.color,
                flex: 'none',
              }}
            />
            <span>{l.name}</span>
          </CellPopoverOption>
        );
      })}
      {canCreate && (
        <CellPopoverOption
          onSelect={async () => {
            if (!onCreate) return;
            const created = await onCreate(query.trim());
            if (created) {
              onToggle(created.id, true);
              setQuery('');
            }
          }}
        >
          <span style={{ color: 'var(--xp-accent-strong)' }}>+</span>
          <span>
            Create <strong>{query.trim()}</strong>
          </span>
        </CellPopoverOption>
      )}
    </CellPopover>
  );
}

// ---- Milestone picker -------------------------------------------------------

interface MilestonePickerProps {
  anchor: HTMLElement | null;
  milestones: Milestone[];
  currentMilestoneId: string | null;
  onSelect: (milestoneId: string | null) => void;
  onClose: () => void;
}

export function MilestonePicker({
  anchor,
  milestones,
  currentMilestoneId,
  onSelect,
  onClose,
}: MilestonePickerProps) {
  return (
    <CellPopover anchor={anchor} onClose={onClose} width={240}>
      <div className="xp-meta" style={{ padding: '4px 8px 6px', color: 'var(--xp-muted)' }}>
        MILESTONE
      </div>
      <CellPopoverOption
        selected={currentMilestoneId === null}
        onSelect={() => {
          onSelect(null);
          onClose();
        }}
      >
        <span style={{ color: 'var(--xp-muted)' }}>None</span>
      </CellPopoverOption>
      {milestones.map((m) => (
        <CellPopoverOption
          key={m.id}
          selected={m.id === currentMilestoneId}
          onSelect={() => {
            onSelect(m.id);
            onClose();
          }}
        >
          <span
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              background: 'var(--xp-accent-strong)',
              flexShrink: 0,
            }}
          />
          <span>{m.name}</span>
          {m.targetDate && (
            <span className="xp-muted" style={{ fontSize: 10, marginLeft: 'auto' }}>
              {new Date(m.targetDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </span>
          )}
        </CellPopoverOption>
      ))}
      {milestones.length === 0 && (
        <div style={{ padding: '6px 10px', color: 'var(--xp-muted)', fontSize: 11.5 }}>
          No milestones in this project.
        </div>
      )}
    </CellPopover>
  );
}

// ---- Tag picker ------------------------------------------------------------

interface TagPickerProps {
  anchor: HTMLElement | null;
  /** All workspace tags. */
  tags: Tag[];
  /** Currently attached tag ids. */
  attachedIds: Set<string>;
  onToggle: (tagId: string, attach: boolean) => void;
  onCreate?: (name: string) => Promise<Tag | null>;
  onClose: () => void;
}

export function TagPicker({
  anchor,
  tags,
  attachedIds,
  onToggle,
  onCreate,
  onClose,
}: TagPickerProps) {
  const [query, setQuery] = useState('');
  const lower = query.trim().toLowerCase();
  const visible = lower ? tags.filter((t) => t.name.toLowerCase().includes(lower)) : tags;
  const exactMatch = visible.find((t) => t.name.toLowerCase() === lower);
  const canCreate = onCreate && lower.length > 0 && !exactMatch;

  return (
    <CellPopover anchor={anchor} onClose={onClose} width={260}>
      <div className="xp-meta" style={{ padding: '4px 8px 4px', color: 'var(--xp-muted)' }}>
        TAGS
      </div>
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter or create..."
        style={{
          width: '100%',
          padding: '4px 8px',
          border: 0,
          borderTop: '1px solid var(--xp-hairline)',
          borderBottom: '1px solid var(--xp-hairline)',
          outline: 0,
          background: 'transparent',
          fontFamily: 'var(--xp-font-mono)',
          fontSize: 12,
          color: 'var(--xp-ink)',
          marginBottom: 4,
        }}
      />
      {visible.length === 0 && !canCreate && (
        <div style={{ padding: '6px 10px', color: 'var(--xp-muted)', fontSize: 11.5 }}>
          No tags match.
        </div>
      )}
      {visible.map((t) => {
        const attached = attachedIds.has(t.id);
        return (
          <CellPopoverOption
            key={t.id}
            selected={attached}
            onSelect={() => onToggle(t.id, !attached)}
          >
            <span
              aria-hidden
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: t.color,
                flex: 'none',
              }}
            />
            <span>{t.name}</span>
          </CellPopoverOption>
        );
      })}
      {canCreate && (
        <CellPopoverOption
          onSelect={async () => {
            if (!onCreate) return;
            const created = await onCreate(query.trim());
            if (created) {
              onToggle(created.id, true);
              setQuery('');
            }
          }}
        >
          <span style={{ color: 'var(--xp-accent-strong)' }}>+</span>
          <span>
            Create <strong>{query.trim()}</strong>
          </span>
        </CellPopoverOption>
      )}
    </CellPopover>
  );
}
