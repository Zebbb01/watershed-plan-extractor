'use client';

import { AlertDialog } from 'radix-ui';
import type { ReactNode } from 'react';
import { buttonClass } from './button';

/** Asks before something that cannot be undone. The safe choice has focus; the destructive one is red. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirm,
  cancel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  confirm: string;
  cancel: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 bg-slate-900/25" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-panel border border-slate-200 bg-white p-5 shadow-overlay outline-none">
          <AlertDialog.Title className="text-[15px] font-semibold text-slate-900">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mt-1.5 text-[14px] text-slate-600">{description}</AlertDialog.Description>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Cancel className={buttonClass('secondary')}>{cancel}</AlertDialog.Cancel>
            <AlertDialog.Action className={buttonClass('destructive')} onClick={onConfirm}>
              {confirm}
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
