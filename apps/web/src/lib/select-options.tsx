// Shared Select option builders so every state/priority/type/health dropdown
// shows the same leading icon + tooltip as the value it sets (XP follow-up:
// "anywhere there's an icon, it should appear everywhere it can be set").

import { Priority, type SelectOption, StateDot, type WorkflowState as StateKind } from '@xpntl/ui';
import { IssueTypeIcon, ISSUE_TYPE_OPTIONS } from '../components/IssueTypeIcon';
import type { WorkflowState } from './api';
import { PRIORITY_LABELS, priorityKind } from './format';

/** State options with the workflow-state glyph. `extra` prepends e.g. a "Default" row. */
export function stateSelectOptions(
  states: WorkflowState[],
  extra: SelectOption[] = [],
): SelectOption[] {
  return [
    ...extra,
    ...states.map((s) => ({
      value: s.id,
      label: s.name,
      title: `State: ${s.name}`,
      icon: <StateDot kind={s.type as StateKind} size={12} />,
    })),
  ];
}

/** Priority options (0–4) with the priority bar glyph. */
export const PRIORITY_SELECT_OPTIONS: SelectOption[] = [0, 1, 2, 3, 4].map((p) => ({
  value: String(p),
  label: PRIORITY_LABELS[p] ?? 'Unknown',
  title: `Priority: ${PRIORITY_LABELS[p] ?? 'Unknown'}`,
  icon: <Priority kind={priorityKind(p)} size={12} />,
}));

/** Issue-type options with their type glyph (re-exported with icons attached). */
export const TYPE_SELECT_OPTIONS: SelectOption[] = ISSUE_TYPE_OPTIONS.map((o) => ({
  ...o,
  title: `Type: ${o.label}`,
  icon: <IssueTypeIcon type={o.value} size={12} />,
}));

/** A small colored dot — for project health / status option lists. */
export function DotIcon({ color }: { color: string }) {
  return (
    <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
  );
}
