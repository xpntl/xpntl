const RANK: Record<string, number> = { Owner: 4, Admin: 3, Member: 2, Guest: 1 };

export function isAtLeast(role: string, floor: string): boolean {
  return (RANK[role] ?? 0) >= (RANK[floor] ?? 0);
}
