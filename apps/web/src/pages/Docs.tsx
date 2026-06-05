// XP-89 — Docs as a wiki. Two-pane layout: a nestable doc tree on the left,
// the selected doc (title + rich-text, auto-saved) on the right, with a
// breadcrumb and the ability to move a doc under another (parent picker).

import { Select, Spinner } from '@xpntl/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppLayout } from '../components/AppLayout';
import { RichTextEditor } from '../components/RichTextEditor';
import { RichTextRenderer } from '../components/RichTextRenderer';
import { type Doc, type DocRevision, api } from '../lib/api';
import { useAuth } from '../lib/auth-store';
import { confirm } from '../lib/confirm-store';
import { formatRelative } from '../lib/format';
import { useProjectScope } from '../lib/use-project-scope';
import { useToasts } from '../lib/toast-store';
import { nameForUser, useUsers } from '../lib/user-store';

function parseHeadings(html: string): { level: number; text: string }[] {
  if (typeof window === 'undefined' || !html) return [];
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return Array.from(doc.querySelectorAll('h1, h2, h3'))
      .map((el) => ({ level: Number(el.tagName[1]), text: el.textContent?.trim() ?? '' }))
      .filter((h) => h.text.length > 0);
  } catch {
    return [];
  }
}

type DocNode = Doc & { children: DocNode[] };

function buildTree(docs: Doc[]): DocNode[] {
  const byId = new Map<string, DocNode>();
  for (const d of docs) byId.set(d.id, { ...d, children: [] });
  const roots: DocNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sort = (nodes: DocNode[]) => {
    nodes.sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));
    for (const n of nodes) sort(n.children);
  };
  sort(roots);
  return roots;
}

export function DocsPage() {
  const { token } = useAuth();
  const { projectId } = useProjectScope();
  const { push: pushToast } = useToasts();

  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const { docs: list } = await api.listDocs(projectId ? { projectId } : undefined, token);
        if (!cancelled) setDocs(list);
      } catch {
        /* silent */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, projectId]);

  const tree = useMemo(() => buildTree(docs), [docs]);
  const byId = useMemo(() => new Map(docs.map((d) => [d.id, d])), [docs]);
  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;

  const breadcrumb = useMemo(() => {
    const chain: Doc[] = [];
    let cur = selected;
    const guard = new Set<string>();
    while (cur && !guard.has(cur.id)) {
      guard.add(cur.id);
      chain.unshift(cur);
      cur = cur.parentId ? (byId.get(cur.parentId) ?? null) : null;
    }
    return chain;
  }, [selected, byId]);

  async function handleNew(parentId?: string) {
    if (!token || creating) return;
    setCreating(true);
    try {
      const { doc } = await api.createDoc(
        { title: 'Untitled', content: '', projectId: projectId || undefined, parentId: parentId ?? null },
        token,
      );
      setDocs((prev) => [...prev, doc]);
      setSelectedId(doc.id);
      if (parentId) setExpanded((s) => new Set(s).add(parentId));
    } catch {
      pushToast('danger', 'Failed to create doc');
    } finally {
      setCreating(false);
    }
  }

  function handleUpdated(updated: Doc) {
    setDocs((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
  }

  async function handleDelete(doc: Doc) {
    const childCount = docs.filter((d) => d.parentId === doc.id).length;
    const ok = await confirm({
      title: 'Delete doc',
      message: childCount
        ? `Delete "${doc.title || 'Untitled'}"? Its ${childCount} sub-page${childCount === 1 ? '' : 's'} will move up to its parent.`
        : `Delete "${doc.title || 'Untitled'}"?`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok || !token) return;
    try {
      await api.deleteDoc(doc.id, token);
      // Children's parent_id is set null server-side (ON DELETE SET NULL) → re-fetch
      // would be ideal; locally, reparent children to the deleted doc's parent.
      setDocs((prev) =>
        prev
          .filter((d) => d.id !== doc.id)
          .map((d) => (d.parentId === doc.id ? { ...d, parentId: doc.parentId } : d)),
      );
      if (selectedId === doc.id) setSelectedId(null);
    } catch {
      pushToast('danger', 'Failed to delete doc');
    }
  }

  return (
    <AppLayout>
      <div style={{ display: 'flex', height: '100%', minHeight: 0, fontFamily: 'var(--xp-font-mono)', color: 'var(--xp-ink)' }}>
        {/* ── Left: doc tree ── */}
        <aside
          style={{
            width: 260,
            flexShrink: 0,
            borderRight: '1px solid var(--xp-hairline)',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            overflow: 'auto',
          }}
          className="xp-scroll"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 12px 8px' }}>
            <span style={{ flex: 1, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--xp-faint)' }}>
              DOCS
            </span>
            <button
              type="button"
              onClick={() => handleNew()}
              disabled={creating}
              title="New doc"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 8px',
                background: 'var(--xp-accent)',
                color: 'var(--xp-accent-fg)',
                border: 'none',
                borderRadius: 'var(--xp-r-sm)',
                fontFamily: 'var(--xp-font-mono)',
                fontSize: 11,
                fontWeight: 600,
                cursor: creating ? 'default' : 'pointer',
                opacity: creating ? 0.6 : 1,
              }}
            >
              + New
            </button>
          </div>

          {loading ? (
            <div style={{ padding: 12 }}>
              <Spinner label="Loading…" />
            </div>
          ) : tree.length === 0 ? (
            <div style={{ padding: '12px', fontSize: 12, color: 'var(--xp-faint)' }}>
              No docs yet. Click <strong>+ New</strong> to start.
            </div>
          ) : (
            <div style={{ paddingBottom: 12 }}>
              {tree.map((node) => (
                <DocTreeNode
                  key={node.id}
                  node={node}
                  depth={0}
                  selectedId={selectedId}
                  expanded={expanded}
                  onSelect={setSelectedId}
                  onToggle={(id) =>
                    setExpanded((s) => {
                      const n = new Set(s);
                      n.has(id) ? n.delete(id) : n.add(id);
                      return n;
                    })
                  }
                  onAddChild={handleNew}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </aside>

        {/* ── Right: selected doc ── */}
        <main style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: '24px 32px' }} className="xp-scroll">
          {selected ? (
            <>
              {breadcrumb.length > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 14, fontSize: 11, color: 'var(--xp-muted)', flexWrap: 'wrap' }}>
                  {breadcrumb.map((d, i) => (
                    <span key={d.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      {i > 0 && <span style={{ color: 'var(--xp-faint)' }}>/</span>}
                      <button
                        type="button"
                        onClick={() => setSelectedId(d.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontFamily: 'var(--xp-font-mono)',
                          fontSize: 11,
                          color: d.id === selected.id ? 'var(--xp-ink)' : 'var(--xp-muted)',
                          padding: 0,
                        }}
                      >
                        {d.title || 'Untitled'}
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <DocEditor
                key={selected.id}
                doc={selected}
                docs={docs}
                token={token}
                onUpdated={handleUpdated}
                onAddChild={() => handleNew(selected.id)}
                onDelete={() => handleDelete(selected)}
                onMoved={handleUpdated}
                pushToast={pushToast}
              />
            </>
          ) : (
            <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--xp-faint)', fontSize: 13 }}>
              {tree.length === 0 ? 'Create a doc to get started.' : 'Select a doc to read or edit.'}
            </div>
          )}
        </main>
      </div>
    </AppLayout>
  );
}

// ── Tree node ──────────────────────────────────────────────────────────────

function DocTreeNode({
  node,
  depth,
  selectedId,
  expanded,
  onSelect,
  onToggle,
  onAddChild,
  onDelete,
}: {
  node: DocNode;
  depth: number;
  selectedId: string | null;
  expanded: Set<string>;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onDelete: (doc: Doc) => void;
}) {
  const isSelected = selectedId === node.id;
  const isOpen = expanded.has(node.id);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div
        className="xp-doc-row"
        onClick={() => onSelect(node.id)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          height: 28,
          paddingRight: 8,
          paddingLeft: 6 + depth * 14,
          cursor: 'pointer',
          fontSize: 12.5,
          background: isSelected ? 'var(--xp-layer)' : 'transparent',
          color: isSelected ? 'var(--xp-ink)' : 'var(--xp-muted)',
          borderLeft: isSelected ? '2px solid var(--xp-accent-strong)' : '2px solid transparent',
        }}
      >
        <button
          type="button"
          aria-label={isOpen ? 'Collapse' : 'Expand'}
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) onToggle(node.id);
          }}
          style={{
            width: 14,
            height: 28,
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'none',
            border: 'none',
            cursor: hasChildren ? 'pointer' : 'default',
            color: 'var(--xp-faint)',
            visibility: hasChildren ? 'visible' : 'hidden',
          }}
        >
          <svg width="7" height="7" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 120ms' }} aria-hidden>
            <path d="M2.5 1.5 L5.5 4 L2.5 6.5" />
          </svg>
        </button>
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" style={{ flexShrink: 0, color: 'var(--xp-faint)' }} aria-hidden>
          <rect x="2.5" y="1.5" width="9" height="11" rx="1" />
          <path d="M4.5 5h5M4.5 7.5h5M4.5 10h3" />
        </svg>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isSelected ? 600 : 400 }}>
          {node.title || 'Untitled'}
        </span>
        <button
          type="button"
          className="xp-doc-add"
          title="Add sub-page"
          onClick={(e) => {
            e.stopPropagation();
            onAddChild(node.id);
          }}
          style={{ ...rowActionStyle }}
        >
          +
        </button>
        <button
          type="button"
          className="xp-doc-add"
          title="Delete"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(node);
          }}
          style={{ ...rowActionStyle, fontSize: 11 }}
        >
          ✕
        </button>
      </div>
      {isOpen &&
        node.children.map((child) => (
          <DocTreeNode
            key={child.id}
            node={child}
            depth={depth + 1}
            selectedId={selectedId}
            expanded={expanded}
            onSelect={onSelect}
            onToggle={onToggle}
            onAddChild={onAddChild}
            onDelete={onDelete}
          />
        ))}
    </div>
  );
}

const rowActionStyle: React.CSSProperties = {
  width: 18,
  height: 20,
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--xp-faint)',
  borderRadius: 'var(--xp-r-sm)',
  fontSize: 14,
  lineHeight: 1,
};

// ── Editor ───────────────────────────────────────────────────────────────────

function DocEditor({
  doc,
  docs,
  token,
  onUpdated,
  onAddChild,
  onDelete,
  onMoved,
  pushToast,
}: {
  doc: Doc;
  docs: Doc[];
  token: string | null | undefined;
  onUpdated: (doc: Doc) => void;
  onAddChild: () => void;
  onDelete: () => void;
  onMoved: (doc: Doc) => void;
  pushToast: (kind: 'success' | 'danger' | 'info', msg: string) => void;
}) {
  const [title, setTitle] = useState(doc.title);
  const [content, setContent] = useState(doc.content);
  const titleRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorWrapRef = useRef<HTMLDivElement>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  // XP-89 Phase 3: table of contents from the live content.
  const headings = useMemo(() => parseHeadings(content), [content]);

  function scrollToHeading(index: number) {
    const els = editorWrapRef.current?.querySelectorAll('h1, h2, h3');
    els?.[index]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  useEffect(() => {
    setTitle(doc.title);
    setContent(doc.content);
    setHistoryOpen(false);
  }, [doc.id]);

  const saveContent = useCallback(
    async (html: string) => {
      if (!token) return;
      try {
        const { doc: updated } = await api.updateDoc(doc.id, { content: html }, token);
        onUpdated(updated);
      } catch {
        /* silent */
      }
    },
    [doc.id, token, onUpdated],
  );

  function handleContentChange(html: string) {
    setContent(html);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void saveContent(html), 1000);
  }

  async function handleTitleBlur() {
    if (!token) return;
    const trimmed = title.trim() || 'Untitled';
    if (trimmed === doc.title) return;
    setTitle(trimmed);
    try {
      const { doc: updated } = await api.updateDoc(doc.id, { title: trimmed }, token);
      onUpdated(updated);
    } catch {
      /* silent */
    }
  }

  async function handleMove(parentId: string) {
    if (!token) return;
    try {
      const { doc: updated } = await api.updateDoc(doc.id, { parentId: parentId || null }, token);
      onMoved(updated);
    } catch {
      pushToast('danger', "Can't move a doc under itself or its sub-page");
    }
  }

  const handleImageUpload = useCallback(
    async (file: File): Promise<string> =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      }),
    [],
  );

  // Parent options: every other doc (the server rejects cycles defensively).
  const parentOptions = [
    { value: '', label: '— Top level' },
    ...docs.filter((d) => d.id !== doc.id).map((d) => ({ value: d.id, label: d.title || 'Untitled' })),
  ];

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 10.5, color: 'var(--xp-faint)', letterSpacing: '0.04em' }}>PARENT</span>
        <div style={{ width: 220 }}>
          <Select value={doc.parentId ?? ''} onValueChange={handleMove} options={parentOptions} />
        </div>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={() => setHistoryOpen(true)} style={editorActionStyle} title="Version history">
          History
        </button>
        <button type="button" onClick={onAddChild} style={editorActionStyle} title="Add a sub-page">
          + Sub-page
        </button>
        <button type="button" onClick={onDelete} style={{ ...editorActionStyle, color: 'var(--xp-danger)', borderColor: 'var(--xp-danger)' }}>
          Delete
        </button>
      </div>

      {headings.length >= 2 && (
        <div
          style={{
            border: '1px solid var(--xp-hairline)',
            borderRadius: 'var(--xp-r-sm)',
            background: 'var(--xp-surface)',
            padding: '8px 12px',
            marginBottom: 14,
          }}
        >
          <div style={{ fontSize: 10, letterSpacing: '0.06em', color: 'var(--xp-faint)', marginBottom: 4 }}>
            ON THIS PAGE
          </div>
          {headings.map((h, i) => (
            <button
              key={`${i}-${h.text}`}
              type="button"
              onClick={() => scrollToHeading(i)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'var(--xp-font-mono)',
                fontSize: 12,
                color: 'var(--xp-muted)',
                padding: '2px 0',
                paddingLeft: (h.level - 1) * 12,
              }}
            >
              {h.text}
            </button>
          ))}
        </div>
      )}

      <input
        ref={titleRef}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={handleTitleBlur}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            titleRef.current?.blur();
          }
        }}
        placeholder="Untitled"
        style={{
          width: '100%',
          background: 'none',
          border: 'none',
          outline: 'none',
          fontFamily: 'var(--xp-font-mono)',
          fontSize: 24,
          fontWeight: 700,
          color: 'var(--xp-ink)',
          letterSpacing: '-0.02em',
          padding: '0 0 12px',
        }}
      />

      <div ref={editorWrapRef}>
        <RichTextEditor
          content={content}
          onChange={handleContentChange}
          variant="full"
          placeholder="Start writing… (type / for commands)"
          onImageUpload={handleImageUpload}
          minHeight={320}
          style={{ border: '1px solid var(--xp-border)', borderRadius: 'var(--xp-r-sm)', background: 'var(--xp-surface)' }}
        />
      </div>

      {historyOpen && (
        <HistoryDrawer
          doc={doc}
          token={token}
          onClose={() => setHistoryOpen(false)}
          onRestored={(updated) => {
            setContent(updated.content);
            onUpdated(updated);
            setHistoryOpen(false);
            pushToast('success', 'Restored revision');
          }}
          pushToast={pushToast}
        />
      )}
    </div>
  );
}

// ── Version history drawer (XP-89 Phase 3) ─────────────────────────────────

function HistoryDrawer({
  doc,
  token,
  onClose,
  onRestored,
  pushToast,
}: {
  doc: Doc;
  token: string | null | undefined;
  onClose: () => void;
  onRestored: (doc: Doc) => void;
  pushToast: (kind: 'success' | 'danger' | 'info', msg: string) => void;
}) {
  const usersById = useUsers((s) => s.byId);
  const [revisions, setRevisions] = useState<DocRevision[] | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!token) return;
    api
      .listDocRevisions(doc.id, token)
      .then((r) => {
        if (!cancelled) setRevisions(r.revisions);
      })
      .catch(() => {
        if (!cancelled) setRevisions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [doc.id, token]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const preview = revisions?.find((r) => r.id === previewId) ?? null;

  async function restore(rev: DocRevision) {
    if (!token) return;
    const ok = await confirm({
      title: 'Restore revision',
      message: 'Replace the current content with this older version? The current content is saved as a new revision first.',
      confirmLabel: 'Restore',
    });
    if (!ok) return;
    try {
      const { doc: updated } = await api.updateDoc(doc.id, { content: rev.content }, token);
      onRestored(updated);
    } catch {
      pushToast('danger', 'Failed to restore revision');
    }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'var(--xp-overlay, rgba(0,0,0,0.3))', zIndex: 80 }} />
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 380,
          maxWidth: '90vw',
          background: 'var(--xp-surface)',
          borderLeft: '1px solid var(--xp-border)',
          boxShadow: 'var(--xp-shadow-3)',
          zIndex: 81,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'var(--xp-font-mono)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderBottom: '1px solid var(--xp-hairline)' }}>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>Version history</span>
          <button type="button" onClick={onClose} style={{ ...editorActionStyle, padding: '2px 8px' }}>
            Close
          </button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }} className="xp-scroll">
          {revisions === null ? (
            <div style={{ padding: 14 }}>
              <Spinner label="Loading…" />
            </div>
          ) : revisions.length === 0 ? (
            <div style={{ padding: 14, fontSize: 12, color: 'var(--xp-faint)' }}>No earlier versions yet.</div>
          ) : (
            revisions.map((rev) => (
              <div key={rev.id} style={{ padding: '8px 14px', borderBottom: '1px solid var(--xp-hairline)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12 }}>{formatRelative(rev.createdAt)}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--xp-faint)' }}>
                      {rev.editedBy ? nameForUser(rev.editedBy, usersById) : 'Unknown'}
                    </div>
                  </div>
                  <button type="button" onClick={() => setPreviewId(previewId === rev.id ? null : rev.id)} style={{ ...editorActionStyle, padding: '2px 8px' }}>
                    {previewId === rev.id ? 'Hide' : 'Preview'}
                  </button>
                  <button type="button" onClick={() => restore(rev)} style={{ ...editorActionStyle, padding: '2px 8px' }}>
                    Restore
                  </button>
                </div>
                {preview?.id === rev.id && (
                  <div
                    style={{
                      marginTop: 8,
                      padding: '8px 10px',
                      background: 'var(--xp-canvas)',
                      border: '1px solid var(--xp-hairline)',
                      borderRadius: 'var(--xp-r-sm)',
                      maxHeight: 240,
                      overflow: 'auto',
                    }}
                    className="xp-scroll"
                  >
                    <RichTextRenderer content={rev.content} />
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

const editorActionStyle: React.CSSProperties = {
  padding: '4px 10px',
  fontSize: 11,
  fontFamily: 'var(--xp-font-mono)',
  fontWeight: 600,
  background: 'transparent',
  color: 'var(--xp-muted)',
  border: '1px solid var(--xp-border)',
  borderRadius: 'var(--xp-r-sm)',
  cursor: 'pointer',
};
