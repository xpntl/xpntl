// packages/ui/src/primitives/Dialog.tsx
//
// Centered dialog with backdrop. Radix Dialog handles focus-trap, scroll-lock,
// and screen-reader semantics. Controlled via `open` / `onClose`.

import type { ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { CloseEsc } from './CloseEsc';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}

export function Dialog({ open, onClose, title, children, footer, width = 420 }: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          data-xp-overlay
          className="fixed inset-0 z-[60] bg-xp-overlay"
        />
        <DialogPrimitive.Content
          data-xp-content
          className="fixed inset-0 z-[60] grid place-items-center pointer-events-none"
        >
          <div
            className="pointer-events-auto bg-xp-surface border border-xp-border rounded-xp-sm shadow-xp-3"
            style={{ width }}
          >
            {/* Title bar */}
            <div className="flex items-center gap-[10px] px-[16px] py-[12px] border-b border-xp-hairline">
              <span className="xp-meta">DIALOG</span>
              <DialogPrimitive.Title className="flex-1 font-semibold text-[13px] text-xp-ink font-mono leading-none">
                {title}
              </DialogPrimitive.Title>
              <DialogPrimitive.Close asChild>
                <CloseEsc aria-label="Close dialog" />
              </DialogPrimitive.Close>
            </div>
            <DialogPrimitive.Description className="sr-only">
              {title}
            </DialogPrimitive.Description>

            {/* Body */}
            <div className="p-[16px] text-[12.5px] leading-[1.55] text-xp-ink font-mono">
              {children}
            </div>

            {/* Footer */}
            {footer && (
              <div className="flex justify-end gap-[8px] px-[16px] py-[10px] border-t border-xp-hairline">
                {footer}
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
