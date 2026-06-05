import { useState } from 'react';

const PRESETS = [
  { label: 'Daily', value: 'daily' },
  { label: 'Weekly', value: 'weekly' },
  { label: 'Every 2 weeks', value: 'every 2 weeks' },
  { label: 'Monthly', value: 'monthly' },
  { label: 'Custom…', value: '__custom' },
];

interface RecurrenceEditorProps {
  rule: string | null;
  active: boolean;
  nextAt: string | null;
  onSet: (rule: string, active?: boolean) => Promise<void>;
  onClear: () => Promise<void>;
}

export function RecurrenceEditor({ rule, active, nextAt, onSet, onClear }: RecurrenceEditorProps) {
  const [editing, setEditing] = useState(false);
  const [customRule, setCustomRule] = useState('');
  const [saving, setSaving] = useState(false);

  if (!rule && !editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        style={{
          background: 'transparent',
          border: '1px dashed var(--xp-border)',
          borderRadius: 'var(--xp-r-sm)',
          color: 'var(--xp-muted)',
          cursor: 'pointer',
          fontFamily: 'var(--xp-font-mono)',
          fontSize: 11,
          padding: '5px 8px',
          width: '100%',
          textAlign: 'left',
        }}
      >
        + Set recurrence
      </button>
    );
  }

  if (rule && !editing) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 11,
          fontFamily: 'var(--xp-font-mono)',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            color: active ? 'var(--xp-accent-strong)' : 'var(--xp-muted)',
          }}
        >
          <span title={`Recurring: ${rule}${active ? '' : ' (paused)'}`} style={{ fontSize: 13 }}>↻</span>
          {rule}
          {!active && ' (paused)'}
        </span>
        {nextAt && active && (
          <span style={{ color: 'var(--xp-muted)', fontSize: 10 }}>
            next {new Date(nextAt).toLocaleDateString()}
          </span>
        )}
        <span style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          <button
            type="button"
            onClick={() => setEditing(true)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--xp-muted)',
              cursor: 'pointer',
              fontSize: 10,
              padding: '2px 4px',
            }}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={async () => {
              setSaving(true);
              try {
                await onSet(rule, !active);
              } finally {
                setSaving(false);
              }
            }}
            disabled={saving}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--xp-muted)',
              cursor: 'pointer',
              fontSize: 10,
              padding: '2px 4px',
            }}
          >
            {active ? 'Pause' : 'Resume'}
          </button>
          <button
            type="button"
            onClick={async () => {
              setSaving(true);
              try {
                await onClear();
              } finally {
                setSaving(false);
              }
            }}
            disabled={saving}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--xp-danger, #e53e3e)',
              cursor: 'pointer',
              fontSize: 10,
              padding: '2px 4px',
            }}
          >
            Remove
          </button>
        </span>
      </div>
    );
  }

  async function handleSelect(value: string) {
    if (value === '__custom') {
      setCustomRule(rule ?? '');
      return;
    }
    setSaving(true);
    try {
      await onSet(value);
      setEditing(false);
      setCustomRule('');
    } finally {
      setSaving(false);
    }
  }

  async function handleCustomSubmit() {
    const trimmed = customRule.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await onSet(trimmed);
      setEditing(false);
      setCustomRule('');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        border: '1px solid var(--xp-border)',
        borderRadius: 'var(--xp-r-sm)',
        padding: 8,
        background: 'var(--xp-canvas)',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {PRESETS.filter((p) => p.value !== '__custom').map((p) => (
          <button
            key={p.value}
            type="button"
            disabled={saving}
            onClick={() => handleSelect(p.value)}
            style={{
              background: rule === p.value ? 'var(--xp-accent)' : 'var(--xp-surface)',
              border: '1px solid var(--xp-border)',
              borderRadius: 'var(--xp-r-sm)',
              color: rule === p.value ? 'var(--xp-accent-fg)' : 'var(--xp-ink)',
              cursor: 'pointer',
              fontFamily: 'var(--xp-font-mono)',
              fontSize: 10,
              padding: '3px 8px',
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          autoFocus
          value={customRule}
          onChange={(e) => setCustomRule(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleCustomSubmit();
            }
            if (e.key === 'Escape') {
              setEditing(false);
              setCustomRule('');
            }
          }}
          placeholder='e.g. "every 3 days", "weekly on monday,friday"'
          disabled={saving}
          style={{
            flex: 1,
            padding: '4px 6px',
            border: '1px solid var(--xp-border)',
            borderRadius: 'var(--xp-r-sm)',
            background: 'var(--xp-surface)',
            fontFamily: 'var(--xp-font-mono)',
            fontSize: 11,
            color: 'var(--xp-ink)',
            outline: 'none',
            minWidth: 0,
          }}
        />
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setCustomRule('');
          }}
          style={{
            background: 'transparent',
            border: '1px solid var(--xp-border)',
            borderRadius: 'var(--xp-r-sm)',
            color: 'var(--xp-muted)',
            cursor: 'pointer',
            fontFamily: 'var(--xp-font-mono)',
            fontSize: 10,
            padding: '3px 8px',
          }}
        >
          Cancel
        </button>
        {customRule.trim() && (
          <button
            type="button"
            disabled={saving}
            onClick={handleCustomSubmit}
            style={{
              background: 'var(--xp-accent)',
              border: '1px solid transparent',
              borderRadius: 'var(--xp-r-sm)',
              color: 'var(--xp-accent-fg)',
              cursor: saving ? 'default' : 'pointer',
              fontFamily: 'var(--xp-font-mono)',
              fontSize: 10,
              fontWeight: 600,
              padding: '3px 8px',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Saving…' : 'Set'}
          </button>
        )}
      </div>
    </div>
  );
}
