import { useMemo } from 'react';
import type { HotkeyConflict, HotkeyRegistrationStatus } from '@/types/hotkeys';

export interface HotkeyConflictDialogProps {
  isOpen: boolean;
  status: HotkeyRegistrationStatus | null;
  isSubmitting: boolean;
  onClose: () => void;
  onRetry?: () => Promise<boolean> | Promise<void> | void;
  onDisable?: (conflictingId: string) => Promise<boolean> | Promise<void> | void;
}

const conflictCopy: Record<string, { title: string; description: string }> = {
  duplicateInternal: {
    title: 'Shortcut already assigned',
    description: 'The requested accelerator is already registered for a different internal command. Disable the existing binding or choose a new combination.',
  },
  reservedByPlatform: {
    title: 'Reserved by operating system',
    description: 'This shortcut is reserved by the current platform. Try removing the system modifier or selecting an alternative pattern.',
  },
  invalidAccelerator: {
    title: 'Invalid accelerator',
    description: 'The requested accelerator has an unsupported format. Verify the key sequence and try again.',
  },
  alreadyRegistered: {
    title: 'Shortcut captured elsewhere',
    description: 'Another application has already registered this shortcut. Choose a different combination or close the conflicting app.',
  },
  checkFailed: {
    title: 'Unable to verify shortcut',
    description: 'The system could not determine whether the shortcut is available. Retry or select another combination.',
  },
  registrationFailed: {
    title: 'Shortcut registration failed',
    description: 'Failed to register the shortcut. Ensure accessibility permissions are granted and retry.',
  },
  platformDenied: {
    title: 'Shortcut blocked by platform',
    description:
      'The operating system rejected this shortcut. Try disabling the existing binding or pick another key combination.',
  },
};

function ConflictItem({ conflict }: { conflict: HotkeyConflict }) {
  const copy = conflictCopy[conflict.code] ?? {
    title: conflict.code,
    description: conflict.message,
  };

  return (
    <li className="rounded-2xl border border-border bg-overlay/70 p-4">
      <h3 className="text-sm font-semibold text-text-primary">{copy.title}</h3>
      <p className="mt-1 text-xs text-text-secondary">{conflict.message || copy.description}</p>
    </li>
  );
}

export function HotkeyConflictDialog({
  isOpen,
  status,
  isSubmitting,
  onClose,
  onRetry,
  onDisable,
}: HotkeyConflictDialogProps) {
  const conflicts = status?.conflicts ?? [];
  const hasBlockingConflicts = useMemo(
    () => conflicts.some((conflict) => conflict.code !== 'duplicateInternal'),
    [conflicts],
  );
  const conflictingInternalId = useMemo(
    () =>
      conflicts.find((conflict) => conflict.code === 'duplicateInternal')?.meta?.conflictingId ?? null,
    [conflicts],
  );
  const canDisableExisting = Boolean(onDisable && conflictingInternalId);

  if (!isOpen || !status) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-3xl border border-border bg-surface/95 p-6 shadow-xl shadow-black/40">
        <h2 className="text-lg font-semibold text-text-primary">Shortcut conflict detected</h2>
        <p className="mt-1 text-sm text-text-secondary">Review the issues below and choose how to proceed.</p>

        <ul className="mt-4 space-y-3">
          {conflicts.map((conflict) => (
            <ConflictItem key={`${conflict.code}-${conflict.message}`} conflict={conflict} />
          ))}
        </ul>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          {canDisableExisting && (
            <button
              type="button"
              className="flex-1 rounded-2xl border border-border bg-overlay/60 px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-overlay sm:flex-none"
              onClick={() => {
                if (onDisable && conflictingInternalId) {
                  void onDisable(conflictingInternalId);
                }
              }}
              disabled={isSubmitting}
            >
              Disable current binding
            </button>
          )}
          <button
            type="button"
            className="flex-1 rounded-2xl border border-border px-4 py-2 text-sm font-medium text-text-secondary transition hover:bg-overlay hover:text-text-primary sm:flex-none"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="flex-1 rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
            onClick={() => {
              if (onRetry) {
                void onRetry();
              }
            }}
            disabled={!onRetry || hasBlockingConflicts || isSubmitting}
          >
            {hasBlockingConflicts ? 'Fix issues' : 'Retry with override'}
          </button>
        </div>
      </div>
    </div>
  );
}
