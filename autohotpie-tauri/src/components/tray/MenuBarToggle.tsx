import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { LastActionState } from '../../hooks/usePieMenuHotkey';

interface MenuBarToggleProps {
  isPieMenuOpen: boolean;
  onTogglePieMenu: () => void;
  onOpenPieMenu: () => void;
  onClosePieMenu: () => void;
  lastAction: LastActionState | null;
  lastSafeModeReason: string | null;
}

export function MenuBarToggle({
  isPieMenuOpen,
  onTogglePieMenu,
  onOpenPieMenu,
  onClosePieMenu,
  lastAction,
  lastSafeModeReason,
}: MenuBarToggleProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  const status = useMemo(() => {
    if (lastSafeModeReason) {
      return {
        tone: 'warn' as const,
        label: 'Safe Mode',
        message: lastSafeModeReason,
      };
    }
    if (lastAction) {
      return {
        tone: lastAction.status === 'success' ? ('success' as const) : ('error' as const),
        label: `Last action: ${lastAction.status}`,
        message: lastAction.message ?? 'Completed',
      };
    }
    return {
      tone: isPieMenuOpen ? ('info' as const) : ('idle' as const),
      label: isPieMenuOpen ? 'Pie menu open' : 'Menu ready',
      message: isPieMenuOpen
        ? 'Pie menu is currently visible. Use the menu bar or close button below.'
        : 'Use the macOS menu bar → Toggle Pie Menu to open the overlay.',
    };
  }, [isPieMenuOpen, lastAction, lastSafeModeReason]);

  const toneColor = useMemo(() => {
    switch (status.tone) {
      case 'success':
        return 'rgba(34,197,94,0.85)';
      case 'error':
        return 'rgba(239,68,68,0.85)';
      case 'warn':
        return 'rgba(249,115,22,0.9)';
      case 'info':
        return 'rgba(96,165,250,0.75)';
      default:
        return 'rgba(148,163,184,0.7)';
    }
  }, [status.tone]);

  return (
    <div className="pointer-events-none fixed left-6 top-6 z-50 flex flex-col gap-3">
      <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-white/10 bg-black/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.35em] text-white/70 shadow-[0_0_25px_rgba(15,23,42,0.55)] backdrop-blur-lg">
        <button
          type="button"
          className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] uppercase tracking-[0.35em] text-white/70 transition hover:bg-white/10"
          onClick={() => {
            onTogglePieMenu();
            setDetailsOpen(true);
          }}
        >
          Toggle Pie Menu
        </button>
        <button
          type="button"
          className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[11px] uppercase tracking-[0.35em] text-white/50 transition hover:bg-white/10"
          onClick={() => setDetailsOpen((value) => !value)}
        >
          {detailsOpen ? 'Hide' : 'Status'}
        </button>
      </div>

      <AnimatePresence>
        {detailsOpen && (
          <motion.div
            key="mac-menu-bar-details"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-auto w-[320px] rounded-3xl border border-white/10 bg-black/75 p-5 text-white shadow-[0_0_45px_rgba(15,23,42,0.6)] backdrop-blur-xl"
          >
            <header className="flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.35em] text-white/50">macOS menu bar</p>
                <h2 className="mt-1 text-lg font-semibold text-white">Pie Menu Control</h2>
              </div>
              <span
                className="flex h-2 w-2 rounded-full"
                title={status.label}
                style={{ backgroundColor: toneColor }}
              />
            </header>

            <p className="mt-4 text-sm text-white/70">{status.message}</p>

            {lastAction && (
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-white/70">
                <p className="font-semibold text-white">Last action:</p>
                <p className="mt-1 text-sm text-white/80">{lastAction.actionName}</p>
                <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-white/40">
                  Status: {lastAction.status} · {new Date(lastAction.timestamp).toLocaleTimeString()}
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
                  setDetailsOpen(true);
                }}
              >
                Open Pie Menu
              </button>
              <button
                type="button"
                className="w-full rounded-2xl border border-white/10 bg-white/5 py-3 text-[11px] uppercase tracking-[0.35em] text-white/50 transition hover:bg-white/10"
                onClick={() => {
                  onClosePieMenu();
                  setDetailsOpen(false);
                }}
              >
                Close
              </button>
            </section>

            <footer className="mt-6 text-[10px] uppercase tracking-[0.3em] text-white/40">
              Shortcut: Command + Shift + P
            </footer>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
