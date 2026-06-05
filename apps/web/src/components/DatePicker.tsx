// apps/web/src/components/DatePicker.tsx
//
// Inline date picker with calendar grid and relative shortcuts.
// Uses the same popover approach as CellPopover for consistency.
// Designed for setting start/due dates on issues.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ---- Helpers ----------------------------------------------------------------

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function nextFriday(d: Date): Date {
  const day = d.getDay(); // 0=Sun ... 6=Sat
  const daysUntilFri = day <= 5 ? 5 - day : 6; // if Sat, next Fri is 6 days
  return daysUntilFri === 0 ? addDays(d, 7) : addDays(d, daysUntilFri);
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function formatDisplay(dateStr: string | null): string {
  if (!dateStr) return 'None';
  const dateOnly = dateStr.includes('T') ? dateStr.split('T')[0]! : dateStr;
  const d = new Date(dateOnly + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

// ---- DatePicker Component ---------------------------------------------------

interface DatePickerProps {
  /** Label shown above the trigger, e.g. "Start" or "Due" */
  label: string;
  /** Current date value as ISO string (YYYY-MM-DD) or null */
  value: string | null;
  /** Called with the new date string or null to clear */
  onChange: (date: string | null) => void;
  /** Compact mode for peek view — smaller trigger */
  compact?: boolean;
}

export function DatePicker({ label, value, onChange, compact }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={compact ? compactTriggerStyle : triggerStyle}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'var(--xp-layer)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
        }}
      >
        {compact ? (
          <span className="xp-mono" style={{ color: value ? 'var(--xp-ink)' : 'var(--xp-muted)', fontSize: 11 }}>
            {value ? formatDisplay(value) : `No ${label.toLowerCase()}`}
          </span>
        ) : (
          <span style={{ color: value ? 'var(--xp-ink)' : 'var(--xp-muted)' }}>
            {formatDisplay(value)}
          </span>
        )}
      </button>
      {open && (
        <DatePickerPopover
          anchor={triggerRef.current}
          label={label}
          value={value}
          onChange={(d) => {
            onChange(d);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// ---- Inline variant for MetaRow replacement in IssueDetail ------------------

interface DatePickerInlineProps {
  /** Current date value as ISO string (YYYY-MM-DD) or null */
  value: string | null;
  /** Label for the popover header */
  label: string;
  /** Called with the new date string or null to clear */
  onChange: (date: string | null) => void;
}

export function DatePickerInline({ value, label, onChange }: DatePickerInlineProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={inlineTriggerStyle}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'var(--xp-layer)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
        }}
      >
        <span style={{ color: value ? 'var(--xp-ink)' : 'var(--xp-muted)' }}>
          {value ? formatDisplay(value) : 'None'}
        </span>
      </button>
      {open && (
        <DatePickerPopover
          anchor={triggerRef.current}
          label={label}
          value={value}
          onChange={(d) => {
            onChange(d);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// ---- Popover with calendar + shortcuts -------------------------------------

interface DatePickerPopoverProps {
  anchor: HTMLElement | null;
  label: string;
  value: string | null;
  onChange: (date: string | null) => void;
  onClose: () => void;
}

function DatePickerPopover({ anchor, label, value, onChange, onClose }: DatePickerPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const today = useMemo(() => startOfDay(new Date()), []);

  // Calendar navigation state: month/year being viewed
  const initialDate = value ? new Date(value + 'T00:00:00') : today;
  const [viewYear, setViewYear] = useState(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth());

  // Close on Escape / outside click
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!panelRef.current || !target) return;
      if (panelRef.current.contains(target)) return;
      if (anchor?.contains(target)) return;
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onClick, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onClick, true);
    };
  }, [anchor, onClose]);

  // Shortcuts
  const shortcuts = useMemo(() => {
    const t = today;
    return [
      { label: 'Today', date: toDateStr(t) },
      { label: 'Tomorrow', date: toDateStr(addDays(t, 1)) },
      { label: 'This Friday', date: toDateStr(nextFriday(t)) },
      { label: 'In 1 Week', date: toDateStr(addDays(t, 7)) },
      { label: 'In 2 Weeks', date: toDateStr(addDays(t, 14)) },
    ];
  }, [today]);

  // Calendar grid
  const numDays = daysInMonth(viewYear, viewMonth);
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  // Convert Sun=0 to Mon-based: Mon=0..Sun=6
  const startOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

  const prevMonth = useCallback(() => {
    setViewMonth((m) => {
      if (m === 0) {
        setViewYear((y) => y - 1);
        return 11;
      }
      return m - 1;
    });
  }, []);

  const nextMonth = useCallback(() => {
    setViewMonth((m) => {
      if (m === 11) {
        setViewYear((y) => y + 1);
        return 0;
      }
      return m + 1;
    });
  }, []);

  if (!anchor) return null;
  const rect = anchor.getBoundingClientRect();
  const panelWidth = 260;
  const top = rect.bottom + 4;
  const left = Math.min(rect.left, window.innerWidth - panelWidth - 8);

  const todayStr = toDateStr(today);
  const selectedStr = value ? (value.includes('T') ? value.split('T')[0]! : value) : '';
  const monthLabel = new Date(viewYear, viewMonth).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div
      ref={panelRef}
      role="dialog"
      style={{
        position: 'fixed',
        top,
        left,
        width: panelWidth,
        zIndex: 60,
        background: 'var(--xp-surface)',
        border: '1px solid var(--xp-border)',
        borderRadius: 'var(--xp-r-sm)',
        boxShadow: 'var(--xp-shadow-3)',
        padding: 4,
        fontFamily: 'var(--xp-font-mono)',
        fontSize: 12,
        color: 'var(--xp-ink)',
      }}
    >
      {/* Header */}
      <div style={{ padding: '4px 8px 6px', color: 'var(--xp-muted)', fontSize: 10, letterSpacing: 'var(--xp-track-wide)', textTransform: 'uppercase' }}>
        {label} DATE
      </div>

      {/* Shortcuts */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '0 4px 6px' }}>
        {shortcuts.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => onChange(s.date)}
            style={{
              ...shortcutButtonStyle,
              background: s.date === selectedStr ? 'var(--xp-accent-tint)' : 'transparent',
              borderColor: s.date === selectedStr ? 'var(--xp-accent-strong)' : 'var(--xp-border)',
            }}
            onMouseEnter={(e) => {
              if (s.date !== selectedStr) {
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--xp-layer)';
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                s.date === selectedStr ? 'var(--xp-accent-tint)' : 'transparent';
            }}
          >
            {s.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onChange(null)}
          style={{
            ...shortcutButtonStyle,
            color: 'var(--xp-danger)',
            borderColor: 'var(--xp-border)',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--xp-layer)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          }}
        >
          Clear
        </button>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--xp-hairline)', margin: '0 4px 6px' }} />

      {/* Month navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 6px 6px' }}>
        <button type="button" onClick={prevMonth} style={navButtonStyle} aria-label="Previous month">
          &lsaquo;
        </button>
        <span style={{ fontSize: 11, fontWeight: 600 }}>{monthLabel}</span>
        <button type="button" onClick={nextMonth} style={navButtonStyle} aria-label="Next month">
          &rsaquo;
        </button>
      </div>

      {/* Weekday headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0, padding: '0 4px' }}>
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            style={{
              textAlign: 'center',
              fontSize: 9,
              color: 'var(--xp-muted)',
              padding: '2px 0',
              letterSpacing: 'var(--xp-track-wide)',
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0, padding: '0 4px 6px' }}>
        {/* Empty cells before month starts */}
        {Array.from({ length: startOffset }, (_, i) => (
          <div key={`empty-${i}`} />
        ))}
        {/* Day cells */}
        {Array.from({ length: numDays }, (_, i) => {
          const day = i + 1;
          const dateStr = toDateStr(new Date(viewYear, viewMonth, day));
          const isToday = dateStr === todayStr;
          const isSelected = dateStr === selectedStr;
          return (
            <button
              key={day}
              type="button"
              onClick={() => onChange(dateStr)}
              style={{
                width: '100%',
                aspectRatio: '1',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: isToday && !isSelected ? '1px solid var(--xp-accent-strong)' : '1px solid transparent',
                borderRadius: 'var(--xp-r-sm)',
                background: isSelected ? 'var(--xp-accent)' : 'transparent',
                color: isSelected ? 'var(--xp-accent-fg)' : 'var(--xp-ink)',
                fontFamily: 'var(--xp-font-mono)',
                fontSize: 11,
                cursor: 'pointer',
                padding: 0,
                fontWeight: isToday ? 700 : 400,
              }}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'var(--xp-layer)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                }
              }}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---- Styles ----------------------------------------------------------------

const triggerStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  border: 0,
  background: 'transparent',
  cursor: 'pointer',
  fontFamily: 'var(--xp-font-mono)',
  fontSize: 12,
  padding: '2px 4px',
  borderRadius: 'var(--xp-r-sm)',
  textAlign: 'left',
};

const compactTriggerStyle: React.CSSProperties = {
  ...triggerStyle,
  padding: '1px 2px',
  fontSize: 11,
};

const inlineTriggerStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  border: 0,
  background: 'transparent',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 'inherit',
  padding: '1px 4px',
  borderRadius: 'var(--xp-r-sm)',
  textAlign: 'left',
  margin: '-1px -4px',
};

const shortcutButtonStyle: React.CSSProperties = {
  border: '1px solid var(--xp-border)',
  borderRadius: 'var(--xp-r-sm)',
  background: 'transparent',
  color: 'var(--xp-ink)',
  fontFamily: 'var(--xp-font-mono)',
  fontSize: 10,
  padding: '3px 7px',
  cursor: 'pointer',
};

const navButtonStyle: React.CSSProperties = {
  width: 24,
  height: 24,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid var(--xp-border)',
  borderRadius: 'var(--xp-r-sm)',
  background: 'transparent',
  color: 'var(--xp-ink)',
  cursor: 'pointer',
  fontFamily: 'var(--xp-font-mono)',
  fontSize: 14,
  fontWeight: 600,
  padding: 0,
};
