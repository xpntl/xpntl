import {
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  /** Leading icon shown both in the trigger (when selected) and the menu row. */
  icon?: ReactNode;
  /** Tooltip for the menu row. */
  title?: string;
}

export interface SelectProps {
  options: SelectOption[];
  placeholder?: string;
  value?: string;
  name?: string;
  id?: string;
  disabled?: boolean;
  title?: string;
  'aria-label'?: string;
  onValueChange?: (value: string) => void;
  onFocus?: (event: FocusEvent<HTMLButtonElement>) => void;
  onBlur?: (event: FocusEvent<HTMLButtonElement>) => void;
}

export function Select({
  options,
  placeholder = 'Select…',
  value,
  onValueChange,
  onFocus,
  onBlur,
  disabled,
  name,
  id,
  title,
  'aria-label': ariaLabel,
}: SelectProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const selectedValue = typeof value === 'string' ? value : String(value ?? '');
  const selectedOption = options.find((option) => option.value === selectedValue) ?? null;
  const enabledOptions = useMemo(() => options.filter((option) => !option.disabled), [options]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const currentIndex = enabledOptions.findIndex((option) => option.value === selectedValue);
    setHighlightedIndex(currentIndex >= 0 ? currentIndex : 0);
  }, [enabledOptions, open, selectedValue]);

  function dispatchChange(nextValue: string) {
    onValueChange?.(nextValue);
  }

  function commit(nextValue: string) {
    dispatchChange(nextValue);
    setOpen(false);
    buttonRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (enabledOptions.length === 0) return;
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setHighlightedIndex(
        (index) => (index + delta + enabledOptions.length) % enabledOptions.length,
      );
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const option = enabledOptions[highlightedIndex];
      if (option) commit(option.value);
      return;
    }

    if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative w-full">
      <button
        ref={buttonRef}
        type="button"
        id={id}
        title={title}
        aria-label={ariaLabel}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => !disabled && setOpen((current) => !current)}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={handleKeyDown}
        className={`inline-flex items-center w-full h-[var(--xp-input-h)] rounded-xp-sm bg-xp-surface border outline-none transition-[box-shadow,border-color] duration-[var(--xp-dur-fast)] ease-[var(--xp-ease)] px-[10px] pr-[28px] font-mono text-[12.5px] text-left focus:shadow-[var(--xp-focus-ring)] focus:border-[var(--xp-focus-border)] ${open ? 'border-[var(--xp-focus-border)] shadow-[var(--xp-focus-ring)]' : 'border-xp-input'} ${selectedOption ? 'text-xp-ink' : 'text-xp-muted'} ${disabled ? 'opacity-60 cursor-default' : 'cursor-pointer'}`}
      >
        <span className="flex-1 inline-flex items-center gap-[6px] overflow-hidden whitespace-nowrap">
          {selectedOption?.icon && (
            <span className="inline-flex items-center shrink-0">{selectedOption.icon}</span>
          )}
          <span className="overflow-hidden text-ellipsis whitespace-nowrap">
            {selectedOption?.label ?? placeholder}
          </span>
        </span>
        <svg
          aria-hidden="true"
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          className="absolute right-[8px] top-1/2 text-xp-muted pointer-events-none transition-transform duration-[var(--xp-dur-fast)] ease-[var(--xp-ease)]"
          style={{ transform: `translateY(-50%) rotate(${open ? 180 : 0}deg)` }}
        >
          <path d="M2.5 4 L5 6.5 L7.5 4" />
        </svg>
      </button>

      {open && enabledOptions.length > 0 && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-[35] bg-xp-surface border border-xp-border rounded-xp-sm shadow-xp-3 p-[4px] max-h-[240px] overflow-auto [scrollbar-width:none]">
          {options.map((option) => {
            const optionIndex = enabledOptions.findIndex((entry) => entry.value === option.value);
            const active = option.value === selectedValue;
            const highlighted = optionIndex >= 0 && optionIndex === highlightedIndex;
            return (
              <button
                key={option.value}
                type="button"
                disabled={option.disabled}
                title={option.title}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => {
                  if (optionIndex >= 0) setHighlightedIndex(optionIndex);
                }}
                onClick={() => !option.disabled && commit(option.value)}
                className={`flex items-center gap-[8px] w-full py-[8px] px-[10px] border-0 rounded-xp-sm font-mono text-[12px] text-left ${highlighted ? 'bg-xp-layer' : 'bg-transparent'} ${option.disabled ? 'text-xp-faint cursor-default' : 'text-xp-ink cursor-pointer'}`}
              >
                <span
                  aria-hidden="true"
                  className={`w-[10px] text-[11px] shrink-0 ${active ? 'text-xp-accent-strong' : 'text-transparent'}`}
                >
                  ✓
                </span>
                {option.icon && <span className="inline-flex items-center shrink-0">{option.icon}</span>}
                <span className="flex-1">{option.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
