// apps/web/src/components/RichTextEditor.tsx
//
// Reusable TipTap rich-text editor. Two variants:
//  - "full" (default): toolbar + slash commands, used for issue descriptions
//  - "comment": lighter version, no slash commands

import { EditorContent, Extension, useEditor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
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
import { createLowlight } from 'lowlight';
// XP-98: register only the languages we actually use instead of lowlight/common
// (~35 languages) — keeps the editor chunk lean.
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import json from 'highlight.js/lib/languages/json';
import python from 'highlight.js/lib/languages/python';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { makeMentionSuggestion } from './MentionSuggestion';
import {
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAuth } from '../lib/auth-store';
import { createIssueRefExtension } from '../lib/tiptap-issue-ref';
import { IssueRefHoverLayer } from './IssueRefHoverLayer';

const lowlight = createLowlight();
// `typescript` covers JS/TS; `xml` covers HTML; `bash` covers shell.
lowlight.register({ typescript, javascript: typescript, ts: typescript, js: typescript, json, python, bash, shell: bash, sh: bash, css, xml, html: xml });

/* ─── Slash-command menu items ─────────────────────────────── */

interface SlashItem {
  title: string;
  description: string;
  action: (editor: ReturnType<typeof useEditor>) => void;
}

const SLASH_ITEMS: SlashItem[] = [
  {
    title: 'Heading 1',
    description: 'Large section heading',
    action: (e) => { e?.chain().focus().toggleHeading({ level: 1 }).run(); },
  },
  {
    title: 'Heading 2',
    description: 'Medium section heading',
    action: (e) => { e?.chain().focus().toggleHeading({ level: 2 }).run(); },
  },
  {
    title: 'Heading 3',
    description: 'Small section heading',
    action: (e) => { e?.chain().focus().toggleHeading({ level: 3 }).run(); },
  },
  {
    title: 'Bullet list',
    description: 'Unordered list',
    action: (e) => { e?.chain().focus().toggleBulletList().run(); },
  },
  {
    title: 'Numbered list',
    description: 'Ordered list',
    action: (e) => { e?.chain().focus().toggleOrderedList().run(); },
  },
  {
    title: 'Task list',
    description: 'Checklist with checkboxes',
    action: (e) => { e?.chain().focus().toggleTaskList().run(); },
  },
  {
    title: 'Code block',
    description: 'Syntax-highlighted code',
    action: (e) => { e?.chain().focus().toggleCodeBlock().run(); },
  },
  {
    title: 'Blockquote',
    description: 'Quote text',
    action: (e) => { e?.chain().focus().toggleBlockquote().run(); },
  },
  {
    title: 'Horizontal rule',
    description: 'Divider line',
    action: (e) => { e?.chain().focus().setHorizontalRule().run(); },
  },
  {
    title: 'Table',
    description: 'Insert a 3x3 table',
    action: (e) => { e?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); },
  },
];

/* ─── Props ───────────────────────────────────────────────── */

interface RichTextEditorProps {
  /** Initial content — HTML string or plain text. */
  content: string;
  /** Called on every content change with the HTML string. */
  onChange: (html: string) => void;
  /** "full" = descriptions (slash commands), "comment" = lighter variant */
  variant?: 'full' | 'comment';
  placeholder?: string;
  /** Keyboard shortcut: Cmd/Ctrl+Enter fires this callback. */
  onSubmit?: () => void;
  /** Fires when the editor loses focus — used for auto-save (XP-84). */
  onBlur?: (html: string) => void;
  /** Upload a pasted/dropped image, returns the URL to embed. */
  onImageUpload?: (file: File) => Promise<string>;
  style?: CSSProperties;
  minHeight?: number;
}

export function RichTextEditor({
  content,
  onChange,
  variant = 'full',
  placeholder = 'Type / for commands…',
  onSubmit,
  onBlur,
  onImageUpload,
  style,
  minHeight = 160,
}: RichTextEditorProps) {
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const slashMenuRef = useRef<HTMLDivElement>(null);

  // Refs to bridge React state into the ProseMirror plugin
  const slashStateRef = useRef({ open: false, filter: '', index: 0 });
  slashStateRef.current = { open: slashOpen, filter: slashFilter, index: slashIndex };

  const setSlash = useCallback((open: boolean, filter: string, index: number) => {
    setSlashOpen(open);
    setSlashFilter(filter);
    setSlashIndex(index);
  }, []);

  // Stable ref for the setSlash function so the plugin can always use latest
  const setSlashRef = useRef(setSlash);
  setSlashRef.current = setSlash;

  // Create a ProseMirror extension that intercepts keystrokes for slash commands
  const slashPluginKey = useRef(new PluginKey('slashCommand'));

  const SlashCommandExt = useRef(
    Extension.create({
      name: 'slashCommand',
      addProseMirrorPlugins() {
        const key = slashPluginKey.current;
        return [
          new Plugin({
            key,
            props: {
              handleKeyDown(_view, event) {
                const s = slashStateRef.current;
                const set = setSlashRef.current;

                if (s.open) {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    const filtered = getFilteredSlash(s.filter);
                    set(true, s.filter, (s.index + 1) % Math.max(1, filtered.length));
                    return true;
                  }
                  if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    const filtered = getFilteredSlash(s.filter);
                    const len = Math.max(1, filtered.length);
                    set(true, s.filter, (s.index - 1 + len) % len);
                    return true;
                  }
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    // Selection handled by React via effect
                    slashSelectRef.current?.();
                    return true;
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    set(false, '', 0);
                    return true;
                  }
                  if (event.key === 'Backspace') {
                    if (s.filter.length === 0) {
                      set(false, '', 0);
                    } else {
                      set(true, s.filter.slice(0, -1), 0);
                    }
                    return true;
                  }
                  if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
                    set(true, s.filter + event.key, 0);
                    return true;
                  }
                }

                // Detect `/` at start of line or after whitespace
                if (event.key === '/' && !event.metaKey && !event.ctrlKey) {
                  const { state } = _view;
                  const { from } = state.selection;
                  const textBefore = from > 1 ? state.doc.textBetween(from - 1, from) : '';
                  if (from === 1 || textBefore === '' || /\s/.test(textBefore)) {
                    setTimeout(() => set(true, '', 0), 10);
                  }
                }

                return false;
              },
            },
          }),
        ];
      },
    }),
  );

  // Build a stable set of known prefixes for issue-ref autolinking
  const { workspace } = useAuth();
  const prefixesRef = useRef<Set<string>>(new Set());
  if (workspace?.key) {
    prefixesRef.current = new Set([workspace.key]);
  }
  const getPrefixes = useCallback(() => prefixesRef.current as ReadonlySet<string>, []);

  // Create the IssueRef extension once (stable across re-renders)
  const IssueRefExt = useMemo(() => createIssueRefExtension(getPrefixes), [getPrefixes]);

  const onImageUploadRef = useRef(onImageUpload);
  onImageUploadRef.current = onImageUpload;

  const ImagePasteExt = useMemo(
    () =>
      Extension.create({
        name: 'imagePaste',
        addProseMirrorPlugins() {
          return [
            new Plugin({
              key: new PluginKey('imagePaste'),
              props: {
                handlePaste(view, event) {
                  const handler = onImageUploadRef.current;
                  if (!handler) return false;
                  const items = event.clipboardData?.items;
                  if (!items) return false;
                  for (const item of items) {
                    if (item.type.startsWith('image/')) {
                      const file = item.getAsFile();
                      if (!file) continue;
                      event.preventDefault();
                      handler(file).then((url) => {
                        const node = view.state.schema.nodes.image?.create({ src: url });
                        if (node) {
                          const tr = view.state.tr.replaceSelectionWith(node);
                          view.dispatch(tr);
                        }
                      });
                      return true;
                    }
                  }
                  return false;
                },
                handleDrop(view, event) {
                  const handler = onImageUploadRef.current;
                  if (!handler) return false;
                  const files = event.dataTransfer?.files;
                  if (!files?.length) return false;
                  for (const file of files) {
                    if (file.type.startsWith('image/')) {
                      event.preventDefault();
                      const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
                      handler(file).then((url) => {
                        const node = view.state.schema.nodes.image?.create({ src: url });
                        if (node) {
                          const tr = view.state.tr.insert(pos?.pos ?? view.state.selection.from, node);
                          view.dispatch(tr);
                        }
                      });
                      return true;
                    }
                  }
                  return false;
                },
              },
            }),
          ];
        },
      }),
    [],
  );

  const extensions = [
    StarterKit.configure({
      codeBlock: false,
      link: false,
    }),
    Placeholder.configure({ placeholder }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Link.configure({ openOnClick: false, autolink: true }),
    CodeBlockLowlight.configure({ lowlight }),
    Table.configure({ resizable: false }),
    TableRow,
    TableCell,
    TableHeader,
    Mention.configure({
      HTMLAttributes: {
        class: 'xp-mention',
      },
      suggestion: makeMentionSuggestion(),
    }),
    Image.configure({ inline: false, allowBase64: false }),
    IssueRefExt,
    ImagePasteExt,
    ...(variant === 'full' ? [SlashCommandExt.current] : []),
  ];

  const editor = useEditor({
    extensions,
    content: isHtml(content) ? content : textToHtml(content),
    onUpdate: ({ editor: e }) => {
      onChange(e.getHTML());
    },
    onBlur: ({ editor: e }) => {
      onBlur?.(e.getHTML());
    },
  });

  // Keep editor in sync when content prop changes externally (e.g. reset)
  const lastExternalContent = useRef(content);
  useEffect(() => {
    if (!editor) return;
    if (content !== lastExternalContent.current) {
      lastExternalContent.current = content;
      const currentHtml = editor.getHTML();
      const incoming = isHtml(content) ? content : textToHtml(content);
      if (currentHtml !== incoming) {
        editor.commands.setContent(incoming);
      }
    }
  }, [content, editor]);

  /* ─── Slash-command handling ──────────────────────────────── */

  const filteredSlash = getFilteredSlash(slashFilter);

  const handleSlashSelect = useCallback(
    (item: SlashItem) => {
      if (!editor) return;
      // Delete the `/` trigger + any filter text
      const { state } = editor;
      const { from } = state.selection;
      const textBefore = state.doc.textBetween(
        Math.max(0, from - slashFilter.length - 1),
        from,
        '\0',
      );
      const slashPos = textBefore.lastIndexOf('/');
      if (slashPos >= 0) {
        const deleteFrom = from - (textBefore.length - slashPos);
        editor.chain().focus().deleteRange({ from: deleteFrom, to: from }).run();
      }
      item.action(editor);
      setSlashOpen(false);
      setSlashFilter('');
      setSlashIndex(0);
    },
    [editor, slashFilter],
  );

  // Ref so the ProseMirror plugin can trigger Enter selection
  const slashSelectRef = useRef<(() => void) | null>(null);
  slashSelectRef.current = () => {
    const items = getFilteredSlash(slashStateRef.current.filter);
    const idx = slashStateRef.current.index;
    if (items[idx]) handleSlashSelect(items[idx]);
  };

  // Close slash menu on click outside
  useEffect(() => {
    if (!slashOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (slashMenuRef.current && !slashMenuRef.current.contains(e.target as Node)) {
        setSlashOpen(false);
        setSlashFilter('');
        setSlashIndex(0);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [slashOpen]);

  // Cmd/Ctrl+Enter -> submit
  const handleKeyDown = (e: ReactKeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && onSubmit) {
      e.preventDefault();
      onSubmit();
    }
  };

  if (!editor) return null;

  const fileInputRef = useRef<HTMLInputElement>(null);

  const insertImageFile = useCallback(
    async (file: File) => {
      if (!onImageUpload || !editor) return;
      try {
        const url = await onImageUpload(file);
        editor.chain().focus().setImage({ src: url }).run();
      } catch {
        /* ignore upload failure */
      }
    },
    [editor, onImageUpload],
  );

  const handleDrop = useCallback(
    (e: ReactDragEvent) => {
      const files = Array.from(e.dataTransfer?.files ?? []).filter((f) => f.type.startsWith('image/'));
      if (!onImageUpload || files.length === 0) return;
      e.preventDefault();
      for (const f of files) void insertImageFile(f);
    },
    [onImageUpload, insertImageFile],
  );

  const handleDragOver = useCallback(
    (e: ReactDragEvent) => {
      if (onImageUpload && Array.from(e.dataTransfer?.items ?? []).some((i) => i.kind === 'file')) {
        e.preventDefault();
      }
    },
    [onImageUpload],
  );

  return (
    <IssueRefHoverLayer>
      <div
        style={{
          position: 'relative',
          border: '1px solid var(--xp-border)',
          borderRadius: 'var(--xp-r-md)',
          background: 'var(--xp-canvas)',
          marginTop: 6,
          ...style,
        }}
        onKeyDown={handleKeyDown}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        {/* Persistent toolbar (full variant) */}
        {variant === 'full' && editor && (
          <EditorToolbar
            editor={editor}
            showImage={!!onImageUpload}
            onImageClick={() => fileInputRef.current?.click()}
          />
        )}
        {onImageUpload && (
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void insertImageFile(file);
              e.target.value = '';
            }}
          />
        )}

        {/* Floating toolbar on text selection */}
        <BubbleMenu editor={editor}>
          <div style={bubbleMenuStyle}>
            <BubbleBtn
              active={editor.isActive('bold')}
              onClick={() => editor.chain().focus().toggleBold().run()}
              label="B"
              title="Bold"
              fontWeight={700}
            />
            <BubbleBtn
              active={editor.isActive('italic')}
              onClick={() => editor.chain().focus().toggleItalic().run()}
              label="I"
              title="Italic"
              fontStyle="italic"
            />
            <BubbleBtn
              active={editor.isActive('code')}
              onClick={() => editor.chain().focus().toggleCode().run()}
              label="<>"
              title="Inline code"
              mono
            />
            <BubbleBtn
              active={editor.isActive('link')}
              onClick={() => {
                if (editor.isActive('link')) {
                  editor.chain().focus().unsetLink().run();
                } else {
                  const url = window.prompt('URL');
                  if (url) editor.chain().focus().setLink({ href: url }).run();
                }
              }}
              label="Link"
              title="Link"
            />
            <span style={bubbleSepStyle} />
            <BubbleBtn
              active={editor.isActive('heading', { level: 2 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              label="H"
              title="Heading"
              fontWeight={700}
            />
          </div>
        </BubbleMenu>

        <EditorContent
          editor={editor}
          style={{
            minHeight,
            padding: '12px 14px',
            fontSize: 13,
            lineHeight: 1.55,
            color: 'var(--xp-ink)',
            outline: 'none',
          }}
        />

        {/* Slash command dropdown */}
        {slashOpen && variant === 'full' && filteredSlash.length > 0 && (
          <div ref={slashMenuRef} style={slashMenuStyle}>
            {filteredSlash.map((item, i) => (
              <button
                key={item.title}
                type="button"
                // Keep editor focus so onBlur auto-save (XP-84) doesn't fire mid-action.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSlashSelect(item)}
                style={{
                  ...slashItemStyle,
                  background: i === slashIndex ? 'var(--xp-layer)' : 'transparent',
                }}
              >
                <span style={{ fontWeight: 600, fontSize: 12 }}>{item.title}</span>
                <span style={{ fontSize: 11, color: 'var(--xp-muted)' }}>{item.description}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </IssueRefHoverLayer>
  );
}

/* ─── Helpers ─────────────────────────────────────────────── */

function getFilteredSlash(filter: string): SlashItem[] {
  return SLASH_ITEMS.filter((item) =>
    item.title.toLowerCase().includes(filter.toLowerCase()),
  );
}

/* ─── Persistent toolbar (full variant) ───────────────────── */

function EditorToolbar({
  editor,
  showImage,
  onImageClick,
}: {
  editor: NonNullable<ReturnType<typeof useEditor>>;
  showImage: boolean;
  onImageClick: () => void;
}) {
  const chain = () => editor.chain().focus();
  return (
    <div style={toolbarStyle}>
      <BubbleBtn active={editor.isActive('bold')} onClick={() => chain().toggleBold().run()} label="B" title="Bold" fontWeight={700} />
      <BubbleBtn active={editor.isActive('italic')} onClick={() => chain().toggleItalic().run()} label="I" title="Italic" fontStyle="italic" />
      <BubbleBtn active={editor.isActive('strike')} onClick={() => chain().toggleStrike().run()} label="S" title="Strikethrough" />
      <BubbleBtn active={editor.isActive('code')} onClick={() => chain().toggleCode().run()} label="<>" title="Inline code" mono />
      <span style={bubbleSepStyle} />
      <BubbleBtn active={editor.isActive('heading', { level: 1 })} onClick={() => chain().toggleHeading({ level: 1 }).run()} label="H1" title="Heading 1" fontWeight={700} />
      <BubbleBtn active={editor.isActive('heading', { level: 2 })} onClick={() => chain().toggleHeading({ level: 2 }).run()} label="H2" title="Heading 2" fontWeight={700} />
      <span style={bubbleSepStyle} />
      <BubbleBtn active={editor.isActive('bulletList')} onClick={() => chain().toggleBulletList().run()} label="•" title="Bullet list" />
      <BubbleBtn active={editor.isActive('orderedList')} onClick={() => chain().toggleOrderedList().run()} label="1." title="Numbered list" />
      <BubbleBtn active={editor.isActive('taskList')} onClick={() => chain().toggleTaskList().run()} label="☑" title="Checklist" />
      <BubbleBtn active={editor.isActive('blockquote')} onClick={() => chain().toggleBlockquote().run()} label="❝" title="Quote" />
      <BubbleBtn active={editor.isActive('codeBlock')} onClick={() => chain().toggleCodeBlock().run()} label="{}" title="Code block" mono />
      <span style={bubbleSepStyle} />
      <BubbleBtn
        active={editor.isActive('link')}
        onClick={() => {
          if (editor.isActive('link')) {
            chain().unsetLink().run();
          } else {
            const url = window.prompt('URL');
            if (url) chain().setLink({ href: url }).run();
          }
        }}
        label="Link"
        title="Link"
      />
      {showImage && <BubbleBtn active={false} onClick={onImageClick} label="Image" title="Insert image" />}
    </div>
  );
}

const toolbarStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 2,
  padding: '5px 6px',
  borderBottom: '1px solid var(--xp-hairline)',
};

/* ─── Bubble menu button ──────────────────────────────────── */

function BubbleBtn({
  active,
  onClick,
  label,
  title,
  fontWeight,
  fontStyle,
  mono,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  title: string;
  fontWeight?: number;
  fontStyle?: string;
  mono?: boolean;
}) {
  return (
    <button
      type="button"
      // Keep editor focus so onBlur auto-save (XP-84) doesn't fire mid-action.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      style={{
        border: 0,
        background: active ? 'var(--xp-accent-tint)' : 'transparent',
        color: active ? 'var(--xp-accent-strong)' : 'var(--xp-ink)',
        cursor: 'pointer',
        padding: '4px 8px',
        borderRadius: 'var(--xp-r-sm)',
        fontSize: 12,
        fontWeight: fontWeight ?? 500,
        fontStyle: fontStyle ?? 'normal',
        fontFamily: mono ? 'var(--xp-font-mono)' : 'inherit',
        lineHeight: 1,
      }}
    >
      {label}
    </button>
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

/* ─── Styles ──────────────────────────────────────────────── */

const bubbleMenuStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  padding: '4px 6px',
  background: 'var(--xp-surface)',
  border: '1px solid var(--xp-border)',
  borderRadius: 'var(--xp-r-md)',
  boxShadow: 'var(--xp-shadow-2)',
};

const bubbleSepStyle: CSSProperties = {
  width: 1,
  height: 16,
  background: 'var(--xp-hairline)',
  margin: '0 4px',
};

const slashMenuStyle: CSSProperties = {
  position: 'absolute',
  left: 14,
  bottom: 'auto',
  zIndex: 50,
  width: 240,
  maxHeight: 280,
  overflowY: 'auto',
  background: 'var(--xp-surface)',
  border: '1px solid var(--xp-border)',
  borderRadius: 'var(--xp-r-md)',
  boxShadow: 'var(--xp-shadow-2)',
  padding: 4,
};

const slashItemStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  width: '100%',
  textAlign: 'left',
  padding: '8px 10px',
  border: 0,
  borderRadius: 'var(--xp-r-sm)',
  cursor: 'pointer',
  color: 'var(--xp-ink)',
};
