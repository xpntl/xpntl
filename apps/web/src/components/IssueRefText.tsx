// apps/web/src/components/IssueRefText.tsx
//
// PER-105 — Render free-form text with `KEY-NNN` references as Links to
// the issue's slide-over peek. Whitespace is preserved (caller decides
// whether to wrap in `white-space: pre-wrap`).

import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth-store';
import { parseIssueRefs } from '../lib/issue-refs';

interface IssueRefTextProps {
  text: string;
  /** Extra prefixes to recognize alongside the current workspace's. Useful when migrating data tagged with a foreign workspace key. */
  extraPrefixes?: readonly string[];
  style?: CSSProperties;
  className?: string;
  as?: 'span' | 'div';
}

export function IssueRefText({
  text,
  extraPrefixes,
  style,
  className,
  as = 'span',
}: IssueRefTextProps) {
  const { workspace } = useAuth();
  const prefixes = new Set<string>();
  if (workspace?.key) prefixes.add(workspace.key);
  if (extraPrefixes) for (const p of extraPrefixes) prefixes.add(p);

  const tokens = parseIssueRefs(text, prefixes);
  const nodes: ReactNode[] = tokens.map((tok, i) => {
    if (tok.kind === 'text') return tok.text;
    return (
      <Link
        key={`ref-${i}`}
        to={`/issues/${encodeURIComponent(tok.key)}`}
        style={{
          fontFamily: 'var(--xp-font-mono)',
          color: 'var(--xp-accent-strong)',
          textDecoration: 'none',
          borderBottom: '1px dashed var(--xp-accent-strong)',
        }}
      >
        {tok.key}
      </Link>
    );
  });

  const Tag = as;
  return (
    <Tag style={style} className={className}>
      {nodes}
    </Tag>
  );
}
