// packages/ui/src/primitives/Combobox.tsx
//
// Filterable popover under a text input. Use for project picker, assignee
// picker, etc. For full ARIA-grade combobox semantics, wrap Radix or
// Headless UI; this is the visual layer.

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Input } from './Input';

export interface ComboboxOption {
  value: string;
  label: string;
  meta?: ReactNode;
  leading?: ReactNode;
}

export interface ComboboxProps {
  options: ComboboxOption[];
  placeholder?: string;
  onSelect?: (option: ComboboxOption) => void;
  value?: string;
}

export function Combobox({ options, placeholder = 'Search…', onSelect, value }: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(value ?? '');
  const ref = useRef<HTMLDivElement>(null);
  const filtered = useMemo(
    () => options.filter(o => o.label.toLowerCase().includes(q.toLowerCase())),
    [q, options],
  );
  return (
    <div ref={ref} className="relative w-full">
      <Input
        placeholder={placeholder}
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => { /* delay close to allow click */ setTimeout(() => setOpen(false), 100); }}
        leading={<span className="text-[11px]">⌕</span>}
        trailing={<span className="text-[9px]">▾</span>}
      />
      {open && filtered.length > 0 && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 bg-xp-surface border border-xp-border rounded-xp-sm shadow-xp-2 max-h-[220px] overflow-auto [scrollbar-width:none]">
          {filtered.map(o => (
            <button
              key={o.value}
              type="button"
              onMouseDown={(e) => e.preventDefault() /* keep input focused */}
              onClick={() => { onSelect?.(o); setQ(o.label); setOpen(false); }}
              className="flex items-center gap-[8px] w-full px-[10px] py-[6px] bg-transparent border-0 font-mono text-[12px] text-xp-ink cursor-pointer text-left hover:bg-xp-layer"
            >
              {o.leading}
              <span className="flex-1">{o.label}</span>
              {o.meta && <span className="text-xp-muted text-[10px]">{o.meta}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
