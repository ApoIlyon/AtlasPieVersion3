import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { LastActionState } from '../../hooks/usePieMenuHotkey';
import { useLocalization } from '../../hooks/useLocalization';
import { useSystemStore } from '../../state/systemStore';

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
  const { t } = useLocalization();
  const activeProfile = useSystemStore((state) => state.activeProfile);
  const isSafeMode = useSystemStore((state) => state.status.safeMode);

  const isActive = isPieMenuOpen;

  const status = useMemo(() => {
    if (lastSafeModeReason) {
      return {
        tone: 'warn',
        label: t('linuxFallback.safeModeLabel'),
        message: lastSafeModeReason,
      } as const;
    }
    if (lastAction) {
      return {
        tone: lastAction.status === 'success' ? 'success' : 'error',
        label: t('linuxFallback.lastActionLabel').replace('{status}', t(`common.status.${lastAction.status === 'success' ? 'success' : 'error'}`)),
        message: lastAction.message ?? t('linuxFallback.lastActionFallback'),
      } as const;
    }
    return {
      tone: 'idle',
      label: isPieMenuOpen ? t('linuxFallback.openLabel') : t('linuxFallback.closedLabel'),
      message: isPieMenuOpen
        ? t('linuxFallback.openMessage')
        : t('linuxFallback.closedMessage'),
    } as const;
  }, [isPieMenuOpen, lastAction, lastSafeModeReason, t]);

  const badgeColor = useMemo(() => {
    switch (status.tone) {
      case 'success':
        return 'bg-emerald-400/80';
      case 'error':
        return 'bg-rose-500/85';
      case 'warn':
        return 'bg-amber-400/90';
      default:
        return 'bg-slate-400/70';
    }
  }, [status.tone]);

  const pieStatus = isActive ? t('linuxFallback.pieStatusActive') : t('linuxFallback.pieStatusIdle');
  const activeProfileName = activeProfile?.name ?? t('linuxFallback.profileUnknown');
  const safeModeReason = lastSafeModeReason;

  const toggleLabel = isActive ? t('linuxFallback.toggleButtonActive') : t('linuxFallback.toggleButton');
  const toggleTooltip = isActive ? t('linuxFallback.toggleButtonActiveTooltip') : t('linuxFallback.toggleButtonTooltip');
  const statusToggleLabel = isPanelVisible ? t('linuxFallback.hideStatus') : t('linuxFallback.showStatus');
  const openButtonLabel = isActive ? t('linuxFallback.focusButton') : t('linuxFallback.openButton');

  const hotkeyHint = t('linuxFallback.hotkeyFallback');

  const details = useMemo(() => {
    const entries = [
      { label: t('linuxFallback.details.hotkey'), value: hotkeyHint },
      { label: t('linuxFallback.details.profile'), value: activeProfileName },
      { label: t('linuxFallback.details.pieStatus'), value: pieStatus },
      {
        label: t('linuxFallback.details.safeMode'),
        value: isSafeMode
          ? safeModeReason ?? t('linuxFallback.details.safeModeEnabled')
          : t('linuxFallback.details.safeModeDisabled'),
      },
    ];

    if (lastAction?.message) {
      entries.push({ label: t('linuxFallback.details.lastActionMessage'), value: lastAction.message });
    }

    return entries;
  }, [
    activeProfileName,
    hotkeyHint,
    isSafeMode,
    lastAction?.message,
    pieStatus,
    safeModeReason,
    t,
  ]);

  const lastActionTimestamp = lastAction?.timestamp ?? null;

  const renderDetails = () => (
    <dl className="mt-4 space-y-2 text-xs text-white/70">
      {details.map((item) => (
        <div key={item.label} className="flex items-start justify-between gap-3">
          <dt className="uppercase tracking-[0.35em] text-white/45">{item.label}</dt>
          <dd className="text-right text-white/90">{item.value}</dd>
        </div>
      ))}
      {lastActionTimestamp && (
        <div className="flex items-start justify-between gap-3">
          <dt className="uppercase tracking-[0.35em] text-white/45">{t('linuxFallback.details.lastUpdated')}</dt>
          <dd className="text-right text-white/90">{new Date(lastActionTimestamp).toLocaleTimeString()}</dd>
        </div>
      )}
    </dl>
  );

  return (
    <div className="pointer-events-none fixed right-6 bottom-6 z-50 flex flex-col items-end gap-3">
      <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-white/10 bg-black/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.35em] text-white/70 shadow-[0_0_25px_rgba(15,23,42,0.55)] backdrop-blur-lg">
        <button
          type="button"
          className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] uppercase tracking-[0.35em] text-white/70 transition hover:bg-white/10"
          onClick={() => {
            onTogglePieMenu();
            setIsPanelVisible(true);
          }}
          title={toggleTooltip}
        >
          {toggleLabel}
        </button>
        <button
          type="button"
          className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[11px] uppercase tracking-[0.35em] text-white/50 transition hover:bg-white/10"
          onClick={() => setIsPanelVisible((value) => !value)}
        >
          {statusToggleLabel}
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
            className="pointer-events-auto w-[360px] rounded-3xl border border-white/10 bg-black/75 p-5 text-white shadow-[0_0_45px_rgba(15,23,42,0.6)] backdrop-blur-xl"
          >
            <header className="flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.35em] text-white/50">{t('linuxFallback.caption')}</p>
                <h2 className="mt-1 text-lg font-semibold text-white">{t('linuxFallback.title')}</h2>
              </div>
              <span
                className={`inline-flex h-2.5 w-2.5 rounded-full transition-colors ${badgeColor}`}
                title={status.label}
              />
            </header>

            <p className="mt-4 text-sm text-white/70">{status.message}</p>

            {renderDetails()}

            {lastAction && (
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-white/70">
                <p className="font-semibold text-white">{t('linuxFallback.details.lastActionTitle')}</p>
                <p className="mt-1 text-sm text-white/80">{lastAction.actionName}</p>
                <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-white/40">
                  {t('linuxFallback.details.statusLine')
                    .replace('{status}', t(`common.status.${lastAction.status === 'success' ? 'success' : 'error'}`))
                    .replace('{time}', new Date(lastAction.timestamp).toLocaleTimeString())}
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
                {openButtonLabel}
              </button>
              <button
                type="button"
                className="w-full rounded-2xl border border-white/10 bg-white/5 py-3 text-[11px] uppercase tracking-[0.35em] text-white/50 transition hover:bg-white/10"
                onClick={() => {
                  onClosePieMenu();
                  setIsPanelVisible(false);
                }}
              >
                {t('common.close')}
              </button>
            </section>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
