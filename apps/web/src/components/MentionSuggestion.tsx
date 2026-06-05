// apps/web/src/components/MentionSuggestion.tsx
//
// TipTap mention suggestion popup. Renders a dark-themed dropdown of workspace
// users filtered by the query typed after `@`. Keyboard-navigable (arrow keys +
// enter). Wired into the TipTap Mention extension via `suggestion` config.

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  type CSSProperties,
} from 'react';
import type { SuggestionOptions, SuggestionProps } from '@tiptap/suggestion';
import { ReactRenderer } from '@tiptap/react';
import tippy, { type Instance as TippyInstance } from 'tippy.js';
import { useUsers } from '../lib/user-store';
import type { WorkspaceUser } from '../lib/api';
import { AgentAvatar, HARNESS_LABELS } from './AgentBadge';

/* ─── Suggestion list component ──────────────────────────── */

export interface MentionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

interface MentionListProps {
  items: WorkspaceUser[];
  command: (item: { id: string; label: string }) => void;
}

export const MentionList = forwardRef<MentionListRef, MentionListProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => setSelectedIndex(0), [items]);

    const selectItem = (index: number) => {
      const item = items[index];
      if (item) {
        command({
          id: item.id,
          label: item.displayName ?? item.email,
        });
      }
    };

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
        if (event.key === 'ArrowUp') {
          setSelectedIndex((i) => (i + items.length - 1) % Math.max(1, items.length));
          return true;
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex((i) => (i + 1) % Math.max(1, items.length));
          return true;
        }
        if (event.key === 'Enter') {
          selectItem(selectedIndex);
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) {
      return <div style={emptyStyle}>No users found</div>;
    }

    return (
      <div style={popupStyle}>
        {items.map((user, index) => (
          <button
            type="button"
            key={user.id}
            onClick={() => selectItem(index)}
            style={{
              ...itemStyle,
              background: index === selectedIndex ? 'var(--xp-layer, #3f3f46)' : 'transparent',
            }}
          >
            <span style={avatarStyle}>
              <AgentAvatar
                name={user.displayName ?? user.email}
                size={20}
                src={user.avatarUrl ?? undefined}
                isAgent={user.isAgent}
                harness={user.agentHarness}
              />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={nameStyle}>{user.displayName ?? user.email}</span>
              {user.isAgent && user.agentHarness ? (
                <span style={emailStyle}>{HARNESS_LABELS[user.agentHarness] ?? user.agentHarness}</span>
              ) : user.displayName ? (
                <span style={emailStyle}>{user.email}</span>
              ) : null}
            </span>
          </button>
        ))}
      </div>
    );
  },
);

MentionList.displayName = 'MentionList';

/* ─── suggestion config factory ──────────────────────────── */

export function makeMentionSuggestion(): Omit<SuggestionOptions, 'editor'> {
  return {
    items: ({ query }: { query: string }) => {
      const { byId } = useUsers.getState();
      const users = Object.values(byId);
      const q = query.toLowerCase();
      return users
        .filter(
          (u) =>
            (u.displayName?.toLowerCase().includes(q) ?? false) ||
            u.email.toLowerCase().includes(q),
        )
        .slice(0, 8);
    },

    render: () => {
      let component: ReactRenderer<MentionListRef> | null = null;
      let popup: TippyInstance[] | null = null;

      return {
        onStart: (props: SuggestionProps) => {
          component = new ReactRenderer(MentionList, {
            props,
            editor: props.editor,
          });

          if (!props.clientRect) return;

          // XP-12 fix: when the editor lives inside a modal Radix dialog (the
          // issue peek), Radix sets pointer-events:none on everything outside
          // the dialog — a popup on document.body becomes unclickable. Mount it
          // inside the dialog when present so the mention list stays clickable.
          const editorEl = props.editor.options.element as HTMLElement;
          const dialog = (editorEl.closest('[role="dialog"]') as HTMLElement) ?? document.body;
          popup = tippy('body', {
            getReferenceClientRect: props.clientRect as () => DOMRect,
            appendTo: () => dialog,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: 'manual',
            placement: 'bottom-start',
            zIndex: 9999,
          });
        },

        onUpdate(props: SuggestionProps) {
          component?.updateProps(props);
          if (props.clientRect && popup?.[0]) {
            popup[0].setProps({
              getReferenceClientRect: props.clientRect as () => DOMRect,
            });
          }
        },

        onKeyDown(props: { event: KeyboardEvent }) {
          if (props.event.key === 'Escape') {
            popup?.[0]?.hide();
            return true;
          }
          return component?.ref?.onKeyDown(props) ?? false;
        },

        onExit() {
          popup?.[0]?.destroy();
          component?.destroy();
        },
      };
    },
  };
}

/* ─── Mention extraction utility ─────────────────────────── */

/**
 * Extract user IDs from TipTap HTML that contains mention nodes. TipTap renders
 * them as `<span data-type="mention" class="xp-mention" data-id="USER_ID">…`.
 * We key off the `xp-mention` class + `data-id` so extraction is robust to
 * attribute order and to TipTap dropping `data-type` in a future version.
 */
export function extractMentionIds(html: string): string[] {
  const ids = new Set<string>();
  let match: RegExpExecArray | null;

  // Primary: each mention span carries our `xp-mention` class — pull its data-id.
  const spanRe = /<span\b[^>]*\bclass="[^"]*\bxp-mention\b[^"]*"[^>]*>/g;
  while ((match = spanRe.exec(html)) !== null) {
    const idMatch = /\bdata-id="([^"]+)"/.exec(match[0]);
    if (idMatch?.[1]) ids.add(idMatch[1]);
  }

  // Fallback: legacy data-type="mention" markup, either attribute order.
  for (const re of [
    /data-type="mention"[^>]*data-id="([^"]+)"/g,
    /data-id="([^"]+)"[^>]*data-type="mention"/g,
  ]) {
    while ((match = re.exec(html)) !== null) {
      if (match[1]) ids.add(match[1]);
    }
  }

  return [...ids];
}

/* ─── Styles ─────────────────────────────────────────────── */

const popupStyle: CSSProperties = {
  background: 'var(--xp-surface, #27272a)',
  border: '1px solid var(--xp-border, #3f3f46)',
  borderRadius: 'var(--xp-r-md, 8px)',
  boxShadow: 'var(--xp-shadow-2, 0 4px 12px rgba(0,0,0,.4))',
  padding: 4,
  width: 260,
  maxHeight: 260,
  overflowY: 'auto',
};

const emptyStyle: CSSProperties = {
  ...popupStyle,
  padding: '12px 14px',
  fontSize: 12,
  color: 'var(--xp-muted, #a1a1aa)',
};

const itemStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  textAlign: 'left',
  padding: '6px 8px',
  border: 0,
  borderRadius: 'var(--xp-r-sm, 4px)',
  cursor: 'pointer',
  color: 'var(--xp-ink, #f4f4f5)',
  fontSize: 12,
  lineHeight: 1.35,
};

const avatarStyle: CSSProperties = {
  flexShrink: 0,
  width: 20,
  height: 20,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const nameStyle: CSSProperties = {
  display: 'block',
  fontWeight: 600,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const emailStyle: CSSProperties = {
  display: 'block',
  fontSize: 11,
  color: 'var(--xp-muted, #a1a1aa)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};
