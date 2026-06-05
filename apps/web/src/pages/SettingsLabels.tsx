import { type FormEvent, useEffect, useRef, useState } from 'react';
import { SettingsLayout } from '../components/SettingsLayout';
import { type Label, FetchError, api } from '../lib/api';
import { useAuth } from '../lib/auth-store';
import { useLabels } from '../lib/label-store';

const COLOR_PRESETS = [
  '#EF4444', '#F97316', '#F59E0B', '#84CC16',
  '#22C55E', '#14B8A6', '#06B6D4', '#3B82F6',
  '#6366F1', '#8B5CF6', '#A855F7', '#EC4899',
  '#F43F5E', '#78716C', '#64748B', '#1E293B',
];

export function SettingsLabelsPage() {
  return (
    <SettingsLayout>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 24 }}>Labels</h1>
      <LabelsSection />
    </SettingsLayout>
  );
}

function LabelsSection() {
  const { token } = useAuth();
  const reload = useLabels((s) => s.reload);
  const allLabels = useLabels((s) => s.all);
  const loading = useLabels((s) => s.loading);

  const [labels, setLabels] = useState<Label[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [colorPickerId, setColorPickerId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#3B82F6');
  const [newColorPickerOpen, setNewColorPickerOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setLabels(allLabels);
  }, [allLabels]);

  async function handleRename(label: Label) {
    const trimmed = editName.trim();
    if (!trimmed || trimmed === label.name) {
      setEditingId(null);
      return;
    }
    setBusy(label.id);
    setMsg(null);
    try {
      const { label: updated } = await api.updateLabel(label.id, { name: trimmed }, token);
      setLabels((prev) => prev.map((l) => (l.id === label.id ? updated : l)));
      await reload(token);
      setEditingId(null);
    } catch (err) {
      setMsg(err instanceof FetchError ? err.message : 'Failed to rename');
    } finally {
      setBusy(null);
    }
  }

  async function handleColorChange(label: Label, color: string) {
    setColorPickerId(null);
    if (color === label.color) return;
    setBusy(label.id);
    setMsg(null);
    try {
      const { label: updated } = await api.updateLabel(label.id, { color }, token);
      setLabels((prev) => prev.map((l) => (l.id === label.id ? updated : l)));
      await reload(token);
    } catch (err) {
      setMsg(err instanceof FetchError ? err.message : 'Failed to update color');
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(label: Label) {
    if (!confirm(`Delete label "${label.name}"? It will be removed from all issues.`)) return;
    setBusy(label.id);
    setMsg(null);
    try {
      await api.deleteLabel(label.id, token);
      setLabels((prev) => prev.filter((l) => l.id !== label.id));
      await reload(token);
    } catch (err) {
      setMsg(err instanceof FetchError ? err.message : 'Failed to delete');
    } finally {
      setBusy(null);
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    setBusy('new');
    setMsg(null);
    try {
      const { label } = await api.createLabel({ name: trimmed, color: newColor }, token);
      setLabels((prev) => [...prev, label].sort((a, b) => a.name.localeCompare(b.name)));
      await reload(token);
      setNewName('');
      setNewColor('#3B82F6');
      setCreating(false);
    } catch (err) {
      setMsg(err instanceof FetchError ? err.message : 'Failed to create');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--xp-ink)' }}>
          Workspace labels ({labels.length})
        </div>
        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            style={{
              padding: '4px 12px',
              fontSize: 11,
              fontWeight: 600,
              fontFamily: 'var(--xp-font-mono)',
              background: 'var(--xp-accent)',
              color: 'var(--xp-accent-fg)',
              border: 'none',
              borderRadius: 'var(--xp-r-sm)',
              cursor: 'pointer',
            }}
          >
            + Create label
          </button>
        )}
      </div>

      {msg && (
        <div
          style={{
            fontSize: 11,
            color: 'var(--xp-danger)',
            marginBottom: 12,
            padding: '6px 10px',
            background: 'var(--xp-surface)',
            border: '1px solid var(--xp-border)',
            borderRadius: 'var(--xp-r-sm)',
          }}
        >
          {msg}
        </div>
      )}

      {creating && (
        <form
          onSubmit={handleCreate}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 12,
            padding: '8px 10px',
            background: 'var(--xp-surface)',
            border: '1px solid var(--xp-border)',
            borderRadius: 'var(--xp-r-sm)',
          }}
        >
          <ColorSwatchButton
            color={newColor}
            open={newColorPickerOpen}
            onToggle={() => setNewColorPickerOpen(!newColorPickerOpen)}
            onSelect={(c) => {
              setNewColor(c);
              setNewColorPickerOpen(false);
            }}
          />
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Label name"
            style={{
              flex: 1,
              padding: '4px 8px',
              fontSize: 12,
              fontFamily: 'var(--xp-font-mono)',
              background: 'var(--xp-canvas)',
              border: '1px solid var(--xp-border)',
              borderRadius: 'var(--xp-r-sm)',
              color: 'var(--xp-ink)',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={busy === 'new'}
            style={{
              padding: '4px 12px',
              fontSize: 11,
              fontWeight: 600,
              fontFamily: 'var(--xp-font-mono)',
              background: 'var(--xp-accent)',
              color: 'var(--xp-accent-fg)',
              border: 'none',
              borderRadius: 'var(--xp-r-sm)',
              cursor: busy === 'new' ? 'wait' : 'pointer',
              opacity: busy === 'new' ? 0.6 : 1,
            }}
          >
            {busy === 'new' ? 'Creating...' : 'Create'}
          </button>
          <button
            type="button"
            onClick={() => {
              setCreating(false);
              setNewName('');
              setNewColorPickerOpen(false);
            }}
            style={{
              padding: '4px 8px',
              fontSize: 11,
              fontFamily: 'var(--xp-font-mono)',
              background: 'none',
              color: 'var(--xp-muted)',
              border: '1px solid var(--xp-border)',
              borderRadius: 'var(--xp-r-sm)',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </form>
      )}

      {loading && labels.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--xp-faint)' }}>Loading...</div>
      ) : labels.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--xp-faint)' }}>
          No labels yet. Create one to get started.
        </div>
      ) : (
        <div
          style={{
            border: '1px solid var(--xp-border)',
            borderRadius: 'var(--xp-r-sm)',
            overflow: 'hidden',
          }}
        >
          {labels.map((label, i) => (
            <div
              key={label.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 12px',
                borderBottom: i < labels.length - 1 ? '1px solid var(--xp-hairline)' : 'none',
                background: 'var(--xp-surface)',
                opacity: busy === label.id ? 0.6 : 1,
              }}
            >
              <ColorSwatchButton
                color={label.color}
                open={colorPickerId === label.id}
                onToggle={() =>
                  setColorPickerId(colorPickerId === label.id ? null : label.id)
                }
                onSelect={(c) => handleColorChange(label, c)}
              />

              <div style={{ flex: 1, minWidth: 0 }}>
                {editingId === label.id ? (
                  <EditableNameInput
                    value={editName}
                    onChange={setEditName}
                    onCommit={() => handleRename(label)}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(label.id);
                      setEditName(label.name);
                    }}
                    title="Click to rename"
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: '2px 0',
                      fontSize: 12,
                      fontFamily: 'var(--xp-font-mono)',
                      color: 'var(--xp-ink)',
                      cursor: 'text',
                      textAlign: 'left',
                      width: '100%',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {label.name}
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => handleDelete(label)}
                disabled={busy === label.id}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--xp-danger)',
                  cursor: busy === label.id ? 'wait' : 'pointer',
                  fontFamily: 'var(--xp-font-mono)',
                  fontSize: 11,
                  padding: '2px 4px',
                  textDecoration: 'underline',
                  flexShrink: 0,
                }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EditableNameInput({
  value,
  onChange,
  onCommit,
  onCancel,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onCommit();
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }}
      style={{
        width: '100%',
        padding: '2px 6px',
        fontSize: 12,
        fontFamily: 'var(--xp-font-mono)',
        background: 'var(--xp-canvas)',
        border: '1px solid var(--xp-accent-strong)',
        borderRadius: 'var(--xp-r-sm)',
        color: 'var(--xp-ink)',
        outline: 'none',
      }}
    />
  );
}

function ColorSwatchButton({
  color,
  open,
  onToggle,
  onSelect,
}: {
  color: string;
  open: boolean;
  onToggle: () => void;
  onSelect: (color: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onToggle();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, onToggle]);

  return (
    <div ref={containerRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        onClick={onToggle}
        title="Change color"
        style={{
          width: 20,
          height: 20,
          borderRadius: 4,
          background: color,
          border: '1px solid var(--xp-border)',
          cursor: 'pointer',
          padding: 0,
        }}
      />
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 26,
            left: 0,
            zIndex: 100,
            background: 'var(--xp-surface)',
            border: '1px solid var(--xp-border)',
            borderRadius: 'var(--xp-r-sm)',
            padding: 6,
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 4,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          {COLOR_PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onSelect(c)}
              style={{
                width: 24,
                height: 24,
                borderRadius: 4,
                background: c,
                border: c === color ? '2px solid var(--xp-ink)' : '1px solid var(--xp-border)',
                cursor: 'pointer',
                padding: 0,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
