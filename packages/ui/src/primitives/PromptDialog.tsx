// packages/ui/src/primitives/PromptDialog.tsx
//
// Themed replacement for window.prompt. Built on Radix Dialog with an
// auto-focused Input field. Enter submits, Escape cancels.

import { useRef, useState, useEffect, type KeyboardEvent } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Button } from './Button';
import { CloseEsc } from './CloseEsc';
import { Input } from './Input';

export interface PromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  onConfirm: (value: string) => void;
  confirmLabel?: string;
}

export function PromptDialog({
  open,
  onOpenChange,
  title,
  label,
  placeholder,
  defaultValue = '',
  onConfirm,
  confirmLabel = 'Save',
}: PromptDialogProps) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset value when dialog opens with a new defaultValue
  useEffect(() => {
    if (open) {
      setValue(defaultValue);
    }
  }, [open, defaultValue]);

  const handleSubmit = () => {
    onConfirm(value);
    onOpenChange(false);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          data-xp-overlay
          className="fixed inset-0 z-40 bg-xp-overlay"
        />
        <DialogPrimitive.Content
          data-xp-content
          className="fixed inset-0 z-40 grid place-items-center pointer-events-none"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
        >
          <div className="pointer-events-auto w-[380px] bg-xp-surface border border-xp-border rounded-xp-sm shadow-xp-3">
            {/* Title bar */}
            <div className="flex items-center gap-[10px] px-[16px] py-[12px] border-b border-xp-hairline">
              <span className="xp-meta">PROMPT</span>
              <DialogPrimitive.Title className="flex-1 font-semibold text-[13px] text-xp-ink font-mono leading-none">
                {title}
              </DialogPrimitive.Title>
              <DialogPrimitive.Close asChild>
                <CloseEsc aria-label="Close" />
              </DialogPrimitive.Close>
            </div>

            {/* Body */}
            <div className="p-[16px] flex flex-col gap-[8px]">
              {label && (
                <span className="text-[11px] text-xp-muted font-mono tracking-[var(--xp-track-wide)] uppercase font-medium">
                  {label}
                </span>
              )}
              <Input
                ref={inputRef}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
              />
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-[8px] px-[16px] py-[10px] border-t border-xp-hairline">
              <DialogPrimitive.Close asChild>
                <Button variant="secondary" size="sm">
                  Cancel
                </Button>
              </DialogPrimitive.Close>
              <Button variant="primary" size="sm" onClick={handleSubmit}>
                {confirmLabel}
              </Button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
