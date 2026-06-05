// apps/web/src/components/ConfirmDialogProvider.tsx
//
// Global confirm/alert dialog driven by confirm-store. Mount once near the app
// root — every call to confirm() or alertNotice() renders through this.

import { AlertDialog } from '@xpntl/ui';
import { useConfirmStore } from '../lib/confirm-store';

export function ConfirmDialogProvider() {
  const { open, title, message, confirmLabel, cancelLabel, variant, alertOnly, respond } =
    useConfirmStore();

  if (alertOnly) {
    return (
      <AlertDialog
        open={open}
        onOpenChange={(v) => {
          if (!v) respond(true);
        }}
        title={title}
        description={message}
        cancelLabel={cancelLabel}
        confirmLabel={confirmLabel}
        onConfirm={() => respond(true)}
        variant="default"
      />
    );
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) respond(false);
      }}
      title={title}
      description={message}
      cancelLabel={cancelLabel}
      confirmLabel={confirmLabel}
      onConfirm={() => respond(true)}
      variant={variant}
    />
  );
}
