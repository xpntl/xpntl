// packages/ui/src/primitives/AlertDialog.tsx
//
// Destructive confirmation dialog. Replaces window.confirm with a themed,
// accessible Radix AlertDialog. Escape closes without confirming.

import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import { Button } from './Button';
import { CloseEsc } from './CloseEsc';

export interface AlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  cancelLabel?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  variant?: 'danger' | 'default';
}

export function AlertDialog({
  open,
  onOpenChange,
  title,
  description,
  cancelLabel = 'Cancel',
  confirmLabel = 'Delete',
  onConfirm,
  variant = 'danger',
}: AlertDialogProps) {
  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay
          data-xp-overlay
          className="fixed inset-0 z-[60] bg-xp-overlay"
        />
        <AlertDialogPrimitive.Content
          data-xp-content
          className="fixed inset-0 z-[60] grid place-items-center pointer-events-none"
        >
          <div className="pointer-events-auto w-[380px] bg-xp-surface border border-xp-border rounded-xp-sm shadow-xp-3">
            {/* Title bar */}
            <div className="flex items-center gap-[10px] px-[16px] py-[12px] border-b border-xp-hairline">
              <span className="xp-meta">CONFIRM</span>
              <AlertDialogPrimitive.Title className="flex-1 font-semibold text-[13px] text-xp-ink font-mono leading-none">
                {title}
              </AlertDialogPrimitive.Title>
              <AlertDialogPrimitive.Cancel asChild>
                <CloseEsc aria-label="Close" />
              </AlertDialogPrimitive.Cancel>
            </div>

            {/* Body */}
            <div className="p-[16px] text-[12.5px] leading-[1.55] text-xp-ink font-mono">
              <AlertDialogPrimitive.Description className="text-xp-muted">
                {description}
              </AlertDialogPrimitive.Description>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-[8px] px-[16px] py-[10px] border-t border-xp-hairline">
              <AlertDialogPrimitive.Cancel asChild>
                <Button variant="secondary" size="sm">
                  {cancelLabel}
                </Button>
              </AlertDialogPrimitive.Cancel>
              <AlertDialogPrimitive.Action asChild>
                <Button
                  variant={variant === 'danger' ? 'danger' : 'primary'}
                  size="sm"
                  onClick={onConfirm}
                >
                  {confirmLabel}
                </Button>
              </AlertDialogPrimitive.Action>
            </div>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}
