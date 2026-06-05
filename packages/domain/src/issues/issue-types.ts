// XP-88 Issue types — the built-in catalog. Each issue carries a `type` key
// from this list; the web maps the key to an icon. (Per-workspace custom types
// are a planned follow-up; keep this list authoritative for validation.)

export const ISSUE_TYPES = [
  { key: 'issue', label: 'Issue' },
  { key: 'task', label: 'Task' },
  { key: 'bug', label: 'Bug' },
  { key: 'feature', label: 'Feature' },
  { key: 'epic', label: 'Epic' },
  { key: 'story', label: 'Story' },
  { key: 'research', label: 'Research' },
] as const;

export type IssueType = (typeof ISSUE_TYPES)[number]['key'];

export const DEFAULT_ISSUE_TYPE: IssueType = 'issue';

export const ISSUE_TYPE_KEYS: readonly string[] = ISSUE_TYPES.map((t) => t.key);

export function isValidIssueType(value: string): value is IssueType {
  return ISSUE_TYPE_KEYS.includes(value);
}
