// XP-91 — click the issue key to copy its nanoid (handy for pasting into an
// agentic chat). Wraps the displayed key; stops propagation so it doesn't also
// open/navigate the issue.

import type { ReactNode } from 'react';
import { useToasts } from '../lib/toast-store';

export function CopyIssueId({
  id,
  issueKey,
  children,
}: {
  id: string;
  issueKey?: string;
  children: ReactNode;
}) {
  const push = useToasts((s) => s.push);

  const copy = () => {
    navigator.clipboard?.writeText(id).then(
      () => push('success', `Copied ${issueKey ?? 'issue'} ID`),
      () => push('danger', 'Copy failed'),
    );
  };

  return (
    <span
      role="button"
      tabIndex={0}
      title={`Copy issue ID (${id})`}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        copy();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          copy();
        }
      }}
      style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
    >
      {children}
    </span>
  );
}
