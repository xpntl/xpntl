// apps/web/src/lib/issue-refs.ts
//
// PER-105 — Parse free-form text for issue references of shape `KEY-NNN`.
// `KEY` must be one of the known workspace prefixes; arbitrary all-caps
// 2-letter sequences in regular prose would otherwise false-positive.

const PATTERN = /\b([A-Z]{2,10})-(\d+)\b/g;

export type IssueRefToken = { kind: 'text'; text: string } | { kind: 'ref'; key: string };

/**
 * Tokenize a string into a stream of plain text + recognised issue refs.
 * Only refs whose prefix is in `prefixes` are emitted as `ref` tokens; others
 * pass through as `text` (preserving them visually).
 */
export function parseIssueRefs(text: string, prefixes: ReadonlySet<string>): IssueRefToken[] {
  if (!text) return [];
  const tokens: IssueRefToken[] = [];
  let cursor = 0;

  for (const match of text.matchAll(PATTERN)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const prefix = match[1];
    if (!prefix || !prefixes.has(prefix)) continue;

    if (start > cursor) {
      tokens.push({ kind: 'text', text: text.slice(cursor, start) });
    }
    tokens.push({ kind: 'ref', key: match[0] });
    cursor = end;
  }

  if (cursor < text.length) {
    tokens.push({ kind: 'text', text: text.slice(cursor) });
  }

  return tokens;
}
