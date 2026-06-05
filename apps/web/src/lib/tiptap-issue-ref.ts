// apps/web/src/lib/tiptap-issue-ref.ts
//
// TipTap extension that auto-links issue references like XP-123 or FRONTEND-42.
// Uses a ProseMirror plugin (appendTransaction) to detect and mark references
// on every document change (typing, paste, programmatic edits).
//
// Does NOT match inside code marks, code blocks, or existing links.
// The caller provides the set of valid prefixes so arbitrary uppercase words
// like "USA-1" don't false-positive.

import { Mark, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

/**
 * Build an IssueRef TipTap extension.
 *
 * @param getPrefixes - A live getter returning the current set of known prefixes.
 *   This is a getter (not a static value) so the extension can pick up
 *   workspace/project prefix changes without being re-instantiated.
 */
export function createIssueRefExtension(getPrefixes: () => ReadonlySet<string>) {
  return Mark.create({
    name: 'issueRef',

    // Exclusive with other link-like marks to avoid double-wrapping
    excludes: 'link',

    // Schema attributes
    addAttributes() {
      return {
        issueKey: {
          default: null,
          parseHTML: (el) => el.getAttribute('data-issue-key'),
          renderHTML: (attrs) => ({ 'data-issue-key': attrs.issueKey }),
        },
        href: {
          default: null,
          parseHTML: (el) => el.getAttribute('href'),
          renderHTML: (attrs) => ({ href: attrs.href }),
        },
      };
    },

    parseHTML() {
      return [
        {
          tag: 'a[data-issue-ref]',
        },
      ];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        'a',
        mergeAttributes(HTMLAttributes, {
          'data-issue-ref': '',
          class: 'xp-issue-ref',
          rel: 'noopener',
          target: '_self',
        }),
        0,
      ];
    },

    addProseMirrorPlugins() {
      const markType = this.type;

      return [
        new Plugin({
          key: new PluginKey('issueRefAutolink'),

          // On each transaction, scan text nodes for issue-ref patterns and
          // apply/remove the mark as needed. This handles typing, paste, and
          // programmatic content changes in one place.
          appendTransaction(transactions, _oldState, newState) {
            // Only run if the document actually changed
            const docChanged = transactions.some((tr) => tr.docChanged);
            if (!docChanged) return null;

            const prefixes = getPrefixes();
            if (prefixes.size === 0) return null;

            const { tr } = newState;
            let modified = false;

            newState.doc.descendants((node, pos) => {
              if (!node.isText || !node.text) return;

              // Skip nodes inside code blocks
              const $pos = newState.doc.resolve(pos);
              for (let d = $pos.depth; d >= 0; d--) {
                const parentType = $pos.node(d).type.name;
                if (parentType === 'codeBlock' || parentType === 'code_block') return;
              }

              // Skip if the node already has a code mark or link mark
              const hasCode = node.marks.some(
                (m) => m.type.name === 'code' || m.type.name === 'link',
              );
              if (hasCode) return;

              const text = node.text;
              const regex = /\b([A-Z]{2,10})-(\d+)\b/g;
              let match: RegExpExecArray | null;

              while ((match = regex.exec(text)) !== null) {
                const prefix = match[1];
                if (!prefix || !prefixes.has(prefix)) continue;

                const issueKey = match[0];
                const from = pos + match.index;
                const to = from + issueKey.length;

                // Check if the mark is already applied correctly
                const existingMark = newState.doc
                  .resolve(from + 1)
                  .marks()
                  .find((m) => m.type === markType && m.attrs.issueKey === issueKey);
                if (existingMark) continue;

                const mark = markType.create({
                  issueKey,
                  href: `/issues/${encodeURIComponent(issueKey)}`,
                });

                tr.addMark(from, to, mark);
                modified = true;
              }
            });

            return modified ? tr : null;
          },
        }),
      ];
    },
  });
}
