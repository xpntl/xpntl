// apps/web/src/lib/recent-issues.ts
//
// Tiny recents queue stored in localStorage. The palette reads it; IssuePeek
// pushes to it on successful load. MRU-ordered, deduped, capped.

const KEY = 'xp-recent-issues';
const MAX = 8;

export interface RecentIssue {
  key: string;
  title: string;
}

export function listRecentIssues(): RecentIssue[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((r) => r && typeof r.key === 'string' && typeof r.title === 'string');
  } catch {
    return [];
  }
}

export function syncRecentIssues(entries: RecentIssue[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX)));
  } catch {
    // best-effort
  }
}

export function pushRecentIssue(entry: RecentIssue) {
  if (typeof window === 'undefined') return;
  const current = listRecentIssues();
  const next = [entry, ...current.filter((r) => r.key !== entry.key)].slice(0, MAX);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // localStorage may be unavailable in private mode — recents are best-effort.
  }
}
