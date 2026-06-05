// apps/web/src/components/RichTextRenderer.tsx
//
// Read-only rendering of rich-text content (HTML from TipTap) with
// graceful fallback for plain-text descriptions (backward compat).

import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Link from '@tiptap/extension-link';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import Image from '@tiptap/extension-image';
import Mention from '@tiptap/extension-mention';
import { common, createLowlight } from 'lowlight';
import { type CSSProperties, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../lib/auth-store';
import { createIssueRefExtension } from '../lib/tiptap-issue-ref';
import { IssueRefHoverLayer } from './IssueRefHoverLayer';

const lowlight = createLowlight(common);

interface RichTextRendererProps {
  /** HTML string (from TipTap) or plain text (legacy). */
  content: string;
  style?: CSSProperties;
  className?: string;
}

export function RichTextRenderer({ content, style, className }: RichTextRendererProps) {
  const html = isHtml(content) ? content : textToHtml(content);

  // Build a stable set of known prefixes for issue-ref autolinking
  const { workspace } = useAuth();
  const prefixesRef = useRef<Set<string>>(new Set());
  if (workspace?.key) {
    prefixesRef.current = new Set([workspace.key]);
  }
  const getPrefixes = useCallback(() => prefixesRef.current as ReadonlySet<string>, []);
  const IssueRefExt = useMemo(() => createIssueRefExtension(getPrefixes), [getPrefixes]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false, link: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({ openOnClick: true }),
      CodeBlockLowlight.configure({ lowlight }),
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
      Mention.configure({
        HTMLAttributes: {
          class: 'xp-mention',
        },
      }),
      Image.configure({ inline: false, allowBase64: false }),
      IssueRefExt,
    ],
    content: html,
    editable: false,
  });

  if (!editor) return null;

  return (
    <IssueRefHoverLayer>
      <div style={style} className={className}>
        <EditorContent
          editor={editor}
          style={{
            fontSize: 13,
            lineHeight: 1.6,
            color: 'var(--xp-ink)',
          }}
        />
      </div>
    </IssueRefHoverLayer>
  );
}

/** Detect whether a string is already HTML (has tags) or plain text. */
function isHtml(str: string): boolean {
  return /<[a-z][\s\S]*>/i.test(str);
}

/** Convert plain text to simple HTML paragraphs for backward compat. */
function textToHtml(text: string): string {
  if (!text.trim()) return '';
  return text
    .split('\n')
    .map((line) => `<p>${escapeHtml(line) || '<br>'}</p>`)
    .join('');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
