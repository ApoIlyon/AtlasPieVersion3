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

type ConflictCopy = {
  title: string;
  description: string;
  hint?: string;
};

const conflictCopy: Record<string, ConflictCopy> = {
  duplicateInternal: {
    title: 'Shortcut already assigned',
    description:
      'This accelerator is already bound to another AutoHotPie action. Disable the conflicting binding to continue.',
    hint: 'Disable the existing binding below or switch to a new combination.',
  },
  reservedByPlatform: {
    title: 'Reserved by operating system',
    description: 'This shortcut is reserved by the operating system and cannot be overridden.',
    hint: 'Try another combination that avoids OS-reserved keys.',
  },
  invalidAccelerator: {
    title: 'Invalid accelerator',
    description: 'The accelerator format is invalid for this platform.',
    hint: 'Use a combination like Ctrl+Alt+Key or Cmd+Option+Key.',
  },
  alreadyRegistered: {
    title: 'Shortcut captured elsewhere',
    description: 'Another application currently owns this shortcut.',
    hint: 'Close the conflicting application or pick a different shortcut.',
  },
  checkFailed: {
    title: 'Unable to verify shortcut',
    description: 'The shortcut availability check failed.',
    hint: 'Retry the registration or choose a different combination.',
  },
  registrationFailed: {
    title: 'Shortcut registration failed',
    description: 'The system rejected the registration request.',
    hint: 'Verify accessibility permissions and retry.',
  },
  platformDenied: {
    title: 'Shortcut blocked by platform',
    description:
      'The operating system rejected this shortcut. It cannot be registered in its current form.',
    hint: 'Pick another key combination that is not blocked by the OS.',
  },
};

function ConflictItem({ conflict }: { conflict: HotkeyConflict }) {
  const copy: ConflictCopy = conflictCopy[conflict.code] ?? {
    title: conflict.code,
    description: conflict.message,
  };

  return (
    <li className="rounded-2xl border border-border bg-overlay/70 p-4">
      <h3 className="text-sm font-semibold text-text-primary">{copy.title}</h3>
      <p className="mt-1 text-xs text-text-secondary">{conflict.message || copy.description}</p>
      {copy.hint ? <p className="mt-2 text-[11px] uppercase tracking-[0.25em] text-text-tertiary">{copy.hint}</p> : null}
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
  const headingId = 'hotkey-conflict-dialog-title';
  const conflicts = status?.conflicts ?? [];
  const hasBlockingConflicts = useMemo(() => {
    if (!conflicts.length) {
      return false;
    }
    const nonInternal = conflicts.filter((conflict) => conflict.code !== 'duplicateInternal');
    return nonInternal.length > 0;
  }, [conflicts]);
  const conflictingInternalId = useMemo(
    () =>
      conflicts.find((conflict) => conflict.code === 'duplicateInternal')?.meta?.conflictingId ?? null,
    [conflicts],
  );
  const canDisableExisting = Boolean(onDisable && conflictingInternalId);
  const disableButtonLabel = conflictingInternalId ? 'Disable conflicting binding' : 'Disable current binding';
  const primaryActionLabel = hasBlockingConflicts ? 'Fix issues to continue' : 'Apply override & register';
  const disableHint = hasBlockingConflicts
    ? 'Resolve non-removable conflicts before disabling AutoHotPie bindings.'
    : 'Disable the existing AutoHotPie shortcut to free this accelerator.';

  if (!isOpen || !status) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="relative w-full max-w-md rounded-3xl border border-border bg-surface/95 p-6 shadow-xl shadow-black/40"
      >
        <h2 id={headingId} className="text-lg font-semibold text-text-primary">
          Shortcut conflict detected
        </h2>
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
              className="flex-1 rounded-2xl border border-border bg-overlay/60 px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-overlay disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
              onClick={() => {
                if (onDisable && conflictingInternalId) {
                  void onDisable(conflictingInternalId);
                }
              }}
              disabled={isSubmitting || hasBlockingConflicts}
            >
              {disableButtonLabel}
            </button>
          )}
          {canDisableExisting ? (
            <p className="text-[11px] uppercase tracking-[0.25em] text-text-tertiary sm:flex-1 sm:self-center">
              {disableHint}
            </p>
          ) : null}
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
            {primaryActionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
