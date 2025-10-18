import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LastActionState } from '@/hooks/usePieMenuHotkey';

interface LinuxFallbackPanelProps {
  isPieMenuOpen: boolean;
  onTogglePieMenu: () => void;
  onOpenPieMenu: () => void;
  onClosePieMenu: () => void;
  lastAction: LastActionState | null;
  lastSafeModeReason: string | null;
}

export function LinuxFallbackPanel({
  isPieMenuOpen,
  onTogglePieMenu,
  onOpenPieMenu,
  onClosePieMenu,
  lastAction,
  lastSafeModeReason,
}: LinuxFallbackPanelProps) {
  const [isPanelVisible, setIsPanelVisible] = useState(false);

  const status = useMemo(() => {
    if (lastSafeModeReason) {
      return {
        tone: 'warn',
        label: 'Safe Mode',
        message: lastSafeModeReason,
      } as const;
    }
    if (lastAction) {
      return {
        tone: lastAction.status === 'success' ? 'success' : 'error',
        label: `Last action: ${lastAction.status}`,
        message: lastAction.message ?? 'Completed',
      } as const;
    }
    return {
      tone: 'idle',
      label: isPieMenuOpen ? 'Pie menu open' : 'Ready',
      message: isPieMenuOpen
        ? 'Overlay is visible. Use your pointer to select an action.'
        : 'Press the pie hotkey or use the buttons below.',
    } as const;
  }, [isPieMenuOpen, lastAction, lastSafeModeReason]);

  return (
    <div className="pointer-events-none fixed right-6 bottom-6 z-50 flex flex-col items-end gap-3">
      <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-white/10 bg-black/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.35em] text-white/70 shadow-[0_0_25px_rgba(15,23,42,0.55)] backdrop-blur-lg">
        <button
          type="button"
          className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] uppercase tracking-[0.35em] text-white/70 transition hover:bg-white/10"
          onClick={() => {
            onTogglePieMenu();
            setIsPanelVisible(true);
          }}
        >
          Toggle Pie Menu
        </button>
        <button
          type="button"
          className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[11px] uppercase tracking-[0.35em] text-white/50 transition hover:bg-white/10"
          onClick={() => setIsPanelVisible((value) => !value)}
        >
          {isPanelVisible ? 'Hide' : 'Status'}
        </button>
      </div>

      <AnimatePresence>
        {isPanelVisible && (
          <motion.div
            key="linux-fallback-panel"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-auto w-[320px] rounded-3xl border border-white/10 bg-black/70 p-5 text-white shadow-[0_0_45px_rgba(15,23,42,0.6)] backdrop-blur-xl"
          >
            <header className="flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.35em] text-white/50">Linux fallback</p>
                <h2 className="mt-1 text-lg font-semibold text-white">Pie Controls</h2>
              </div>
              <span
                className="flex h-2 w-2 rounded-full"
                title={status.label}
                style={{
                  backgroundColor:
                    status.tone === 'success'
                      ? 'rgba(34,197,94,0.85)'
                      : status.tone === 'error'
                      ? 'rgba(239,68,68,0.85)'
                      : status.tone === 'warn'
                      ? 'rgba(249,115,22,0.9)'
                      : 'rgba(148,163,184,0.7)',
                }}
              />
            </header>

            <p className="mt-4 text-sm text-white/70">{status.message}</p>

            {lastAction && (
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-white/70">
                <p className="font-semibold text-white">Last action:</p>
                <p className="mt-1 text-sm text-white/80">{lastAction.actionName}</p>
                <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-white/40">
                  Status: {lastAction.status} ·{' '}
                  {new Date(lastAction.timestamp).toLocaleTimeString()}
                </p>
                {lastAction.message && (
                  <p className="mt-2 text-xs text-white/60">{lastAction.message}</p>
                )}
              </div>
            )}

            <section className="mt-6 space-y-3">
              <button
                type="button"
                className="w-full rounded-2xl border border-white/10 bg-white/5 py-3 text-[11px] uppercase tracking-[0.35em] text-white/70 transition hover:bg-white/10"
                onClick={() => {
                  onOpenPieMenu();
                  setIsPanelVisible(true);
                }}
              >
                Open Pie Menu
              </button>
              <button
                type="button"
                className="w-full rounded-2xl border border-white/10 bg-white/5 py-3 text-[11px] uppercase tracking-[0.35em] text-white/50 transition hover:bg-white/10"
                onClick={() => {
                  onClosePieMenu();
                  setIsPanelVisible(false);
                }}
              >
                Close
              </button>
            </section>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
