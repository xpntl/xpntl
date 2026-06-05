export const PRIORITY_LABELS: Record<number, string> = {
  0: 'No priority',
  1: 'Urgent',
  2: 'High',
  3: 'Normal',
  4: 'Low',
};


export function priorityLabel(p: number): string {
  return PRIORITY_LABELS[p] ?? 'Unknown';
}

export type PriorityKind = 'urgent' | 'high' | 'normal' | 'low' | 'none';

/** Map the integer priority (0..4) used in the domain to the DS Priority kind. */
export function priorityKind(p: number): PriorityKind {
  switch (p) {
    case 1: return 'urgent';
    case 2: return 'high';
    case 3: return 'normal';
    case 4: return 'low';
    default: return 'none';
  }
}

export function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const seconds = Math.round(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}
