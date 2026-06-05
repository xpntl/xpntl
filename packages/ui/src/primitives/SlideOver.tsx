// packages/ui/src/primitives/SlideOver.tsx
//
// Right-anchored slide-over (PER-106 peek). Radix Dialog handles focus-trap,
// scroll-lock, and screen-reader semantics. Slide animation via data-xp-slide.

import type { ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { CloseEsc } from './CloseEsc';


export interface SlideOverProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  breadcrumb?: ReactNode;
  children: ReactNode;
  width?: number;
}

export function SlideOver({
  open,
  onClose,
  title,
  breadcrumb,
  children,
  width = 440,
}: SlideOverProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          data-xp-overlay
          className="fixed inset-0 z-[60] bg-xp-overlay"
        />
        <DialogPrimitive.Content
          data-xp-slide
          className="fixed top-0 right-0 bottom-0 z-[60] flex flex-col bg-xp-surface border-l border-xp-border shadow-xp-3"
          style={{ width }}
        >
          {/* Header */}
          <div className="flex items-center gap-[10px] px-[16px] py-[10px] border-b border-xp-hairline">
            <span className="xp-meta">PEEK</span>
            {breadcrumb && (
              <span className="xp-mono text-[10.5px] text-xp-muted">
                {breadcrumb}
              </span>
            )}
            <span className="flex-1" />
            <DialogPrimitive.Close asChild>
              <CloseEsc aria-label="Close panel" />
            </DialogPrimitive.Close>
          </div>

          <DialogPrimitive.Title className="sr-only">
            {title ?? 'Panel'}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Slide-over panel
          </DialogPrimitive.Description>

          {/* Visible title */}
          {title && (
            <div className="px-[16px] pt-[14px] text-[17px] font-semibold tracking-[var(--xp-track-tight)] leading-[1.2]">
              {title}
            </div>
          )}

          {/* Body */}
          <div className="flex-1 overflow-auto p-[16px] text-[12.5px] xp-scroll">
            {children}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
