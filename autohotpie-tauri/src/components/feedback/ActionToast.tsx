import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { LastActionState } from '@/hooks/usePieMenuHotkey';

interface ActionToastProps {
  action: LastActionState | null;
  onDismiss?: () => void;
}

const statusStyles: Record<LastActionState['status'], string> = {
  success: 'border-emerald-400/70 text-emerald-100 shadow-[0_0_30px_rgba(16,185,129,0.25)]',
  failure: 'border-rose-400/70 text-rose-100 shadow-[0_0_30px_rgba(244,63,94,0.25)]',
  skipped: 'border-amber-400/70 text-amber-100 shadow-[0_0_30px_rgba(251,191,36,0.2)]',
};

const statusLabel: Record<LastActionState['status'], string> = {
  success: 'Action completed',
  failure: 'Action failed',
  skipped: 'Action skipped',
};

const statusBadge: Record<LastActionState['status'], string> = {
  success: 'SUCCESS',
  failure: 'ERROR',
  skipped: 'SKIPPED',
};

export function ActionToast({ action, onDismiss }: ActionToastProps) {
  useEffect(() => {
    if (!action || !onDismiss) {
      return;
    }

    const timeout = window.setTimeout(() => {
      onDismiss();
    }, 5000);

    return () => window.clearTimeout(timeout);
  }, [action, onDismiss]);

  const helperMessage = action
    ? action.status === 'failure'
      ? 'Try launching the action again or review the audit log for details.'
      : action.status === 'skipped'
        ? 'This action was skipped. Adjust its configuration if you expected it to run.'
        : 'Action completed successfully.'
    : '';

  return (
    <AnimatePresence>
      {action && (
        <motion.div
          key={action.timestamp}
          initial={{ opacity: 0, y: 24, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 220, damping: 26 }}
          className="pointer-events-auto fixed bottom-10 left-1/2 z-50 w-[min(420px,92vw)] -translate-x-1/2"
        >
          <div
            className={`relative overflow-hidden rounded-3xl border bg-[#0f111a]/95 backdrop-blur-xl ${
              statusStyles[action.status]
            }`}
            role="status"
            aria-live="polite"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.12),transparent_70%)]" />
            <div className="relative px-6 py-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-[0.4em] text-text-muted">
                  {statusBadge[action.status]}
                </span>
                <button
                  type="button"
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.3em] text-white/70 transition hover:bg-white/10"
                  onClick={onDismiss}
                >
                  CLOSE
                </button>
              </div>

              <h4 className="mt-3 text-lg font-semibold text-white">{statusLabel[action.status]}</h4>
              <p className="mt-1 line-clamp-2 text-sm text-white/80">{action.actionName}</p>
              {action.message && (
                <p className="mt-2 text-xs text-white/60">
                  {action.message}
                </p>
              )}

              <p className="mt-3 text-[11px] uppercase tracking-[0.25em] text-white/50">
                {helperMessage}
              </p>

              <p className="mt-4 text-[11px] uppercase tracking-[0.35em] text-white/30">
                {new Date(action.timestamp).toLocaleTimeString()}
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
