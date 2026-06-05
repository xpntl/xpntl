import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type Issue, type IssueRelation } from '../lib/api';

const RELATION_TYPES: Array<{ value: IssueRelation['type']; label: string }> = [
  { value: 'blocks', label: 'Blocks' },
  { value: 'blocked_by', label: 'Blocked by' },
  { value: 'relates_to', label: 'Related to' },
  { value: 'duplicate_of', label: 'Duplicate of' },
];

interface RelationCreatorProps {
  token: string | null;
  currentIssueKey: string;
  onAdd: (toIssueKey: string, type: IssueRelation['type']) => Promise<void>;
}

export function RelationCreator({ token, currentIssueKey, onAdd }: RelationCreatorProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState('');
  const [selectedLabel, setSelectedLabel] = useState('');
  const [results, setResults] = useState<Issue[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const [type, setType] = useState<IssueRelation['type']>('relates_to');
  const [saving, setSaving] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const search = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setResults([]);
        setShowDropdown(false);
        return;
      }
      try {
        const { issues } = await api.listIssues({ q: q.trim() }, token);
        const filtered = issues.filter((i) => i.key !== currentIssueKey);
        setResults(filtered);
        setShowDropdown(filtered.length > 0);
        setHighlightIdx(-1);
      } catch {
        setResults([]);
        setShowDropdown(false);
      }
    },
    [token, currentIssueKey],
  );

  function handleInputChange(value: string) {
    setQuery(value);
    setSelectedKey('');
    setSelectedLabel('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 300);
  }

  function selectIssue(issue: Issue) {
    setSelectedKey(issue.key);
    setSelectedLabel(`${issue.key} — ${issue.title}`);
    setQuery(`${issue.key} — ${issue.title}`);
    setShowDropdown(false);
    setResults([]);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      if (showDropdown) {
        setShowDropdown(false);
      } else {
        reset();
      }
      return;
    }
    if (showDropdown && results.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightIdx((prev) => (prev < results.length - 1 ? prev + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightIdx((prev) => (prev > 0 ? prev - 1 : results.length - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (highlightIdx >= 0 && highlightIdx < results.length) {
          selectIssue(results[highlightIdx]!);
        }
      }
    } else if (e.key === 'Enter' && selectedKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function reset() {
    setOpen(false);
    setQuery('');
    setSelectedKey('');
    setSelectedLabel('');
    setResults([]);
    setShowDropdown(false);
    setHighlightIdx(-1);
  }

  async function handleSubmit() {
    if (!selectedKey) return;
    setSaving(true);
    try {
      await onAdd(selectedKey, type);
      reset();
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
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
        + Add relation
      </button>
    );
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
      <div style={{ display: 'flex', gap: 6 }}>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as IssueRelation['type'])}
          style={{
            flex: 'none',
            padding: '4px 6px',
            border: '1px solid var(--xp-border)',
            borderRadius: 'var(--xp-r-sm)',
            background: 'var(--xp-surface)',
            fontFamily: 'var(--xp-font-mono)',
            fontSize: 11,
            color: 'var(--xp-ink)',
          }}
        >
          {RELATION_TYPES.map((rt) => (
            <option key={rt.value} value={rt.value}>
              {rt.label}
            </option>
          ))}
        </select>
        <div ref={wrapperRef} style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          <input
            autoFocus
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (results.length > 0 && !selectedKey) setShowDropdown(true);
            }}
            placeholder="Search issues…"
            disabled={saving}
            style={{
              width: '100%',
              padding: '4px 6px',
              border: '1px solid var(--xp-border)',
              borderRadius: 'var(--xp-r-sm)',
              background: 'var(--xp-surface)',
              fontFamily: 'var(--xp-font-mono)',
              fontSize: 11,
              color: 'var(--xp-ink)',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          {showDropdown && results.length > 0 && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                marginTop: 2,
                background: 'var(--xp-surface)',
                border: '1px solid var(--xp-border)',
                borderRadius: 'var(--xp-r-sm)',
                boxShadow: 'var(--xp-shadow-2)',
                zIndex: 30,
                maxHeight: 200,
                overflowY: 'auto',
              }}
            >
              {results.map((issue, idx) => (
                <div
                  key={issue.id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectIssue(issue);
                  }}
                  onMouseEnter={() => setHighlightIdx(idx)}
                  style={{
                    padding: '5px 8px',
                    cursor: 'pointer',
                    fontFamily: 'var(--xp-font-mono)',
                    fontSize: 11,
                    color: 'var(--xp-ink)',
                    background: idx === highlightIdx ? 'var(--xp-layer)' : 'transparent',
                    display: 'flex',
                    gap: 6,
                    alignItems: 'baseline',
                    overflow: 'hidden',
                  }}
                >
                  <span
                    style={{
                      flexShrink: 0,
                      color: 'var(--xp-muted)',
                      fontSize: 10,
                    }}
                  >
                    {issue.key}
                  </span>
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {issue.title}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={reset}
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
        <button
          type="button"
          disabled={saving || !selectedKey}
          onClick={handleSubmit}
          style={{
            background: 'var(--xp-accent)',
            border: '1px solid transparent',
            borderRadius: 'var(--xp-r-sm)',
            color: 'var(--xp-accent-fg)',
            cursor: saving || !selectedKey ? 'default' : 'pointer',
            fontFamily: 'var(--xp-font-mono)',
            fontSize: 10,
            fontWeight: 600,
            padding: '3px 8px',
            opacity: saving || !selectedKey ? 0.6 : 1,
          }}
        >
          {saving ? 'Adding…' : 'Add'}
        </button>
      </div>
    </div>
  );
}
