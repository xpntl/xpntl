// packages/ui/src/primitives/Tree.tsx
//
// Recursive expandable tree. Each node renders one row; children indent 14px.

import { useState, type ReactNode } from 'react';

export interface TreeNode {
  label: ReactNode;
  leading?: ReactNode;
  meta?: ReactNode;
  children?: TreeNode[];
  defaultOpen?: boolean;
}

export interface TreeProps {
  node: TreeNode;
  depth?: number;
}

export function Tree({ node, depth = 0 }: TreeProps) {
  const [open, setOpen] = useState(node.defaultOpen !== false);
  const hasChildren = !!node.children && node.children.length > 0;
  return (
    <div>
      <div
        onClick={() => hasChildren && setOpen(!open)}
        className={`flex items-center gap-[6px] py-[4px] pr-[8px] h-[26px] text-[12px] text-xp-ink font-mono ${
          hasChildren ? 'cursor-pointer' : 'cursor-default'
        }`}
        style={{ paddingLeft: 8 + depth * 14 }}
      >
        <span className="w-[10px] text-xp-muted text-[9px]">
          {hasChildren ? (open ? '▾' : '▸') : ''}
        </span>
        {node.leading}
        <span className="flex-1">{node.label}</span>
        {node.meta && (
          <span className="text-xp-muted text-[10.5px] tabular-nums">
            {node.meta}
          </span>
        )}
      </div>
      {hasChildren && open && node.children!.map((c, i) => (
        <Tree key={i} node={c} depth={depth + 1} />
      ))}
    </div>
  );
}
