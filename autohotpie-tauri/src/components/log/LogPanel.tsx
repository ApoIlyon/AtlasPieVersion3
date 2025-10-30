import { useCallback, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { useLocalization } from '../../hooks/useLocalization';
import { useLogStore, LogLevel } from '../../state/logStore';
import { isTauriEnvironment } from '../../utils/tauriEnvironment';

interface LogPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const REFRESH_INTERVAL_MS = 5000;
const LOG_LEVELS: LogLevel[] = ['ACTION', 'ERROR', 'WARN', 'INFO'];

export function LogPanel({ isOpen, onClose }: LogPanelProps) {
  const { t } = useLocalization();

  const entries = useLogStore((state) => state.filtered);
  const truncated = useLogStore((state) => state.truncated);
  const filePath = useLogStore((state) => state.filePath);
  const isLoading = useLogStore((state) => state.isLoading);
  const isRefreshing = useLogStore((state) => state.isRefreshing);
  const error = useLogStore((state) => state.error);
  const clearError = useLogStore((state) => state.clearError);
  const search = useLogStore((state) => state.search);
  const setSearch = useLogStore((state) => state.setSearch);
  const activeLevels = useLogStore((state) => state.activeLevels);
  const toggleLevel = useLogStore((state) => state.toggleLevel);
  const autoRefresh = useLogStore((state) => state.autoRefresh);
  const setAutoRefresh = useLogStore((state) => state.setAutoRefresh);
  const refresh = useLogStore((state) => state.refresh);
  const lastUpdated = useLogStore((state) => state.lastUpdated);

  const levelLabels = useMemo(
    () => ({
      ACTION: t('logPanel.level.action'),
      ERROR: t('logPanel.level.error'),
      WARN: t('logPanel.level.warn'),
      INFO: t('logPanel.level.info'),
    }),
    [t],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (!isTauriEnvironment()) {
      return;
    }

    void refresh();
  }, [isOpen, refresh]);

  useEffect(() => {
    if (!isOpen || !autoRefresh || !isTauriEnvironment()) {
      return undefined;
    }

    const id = window.setInterval(() => {
      void refresh({ silent: true });
    }, REFRESH_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [isOpen, autoRefresh, refresh]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const handleOpenFile = useCallback(async () => {
    if (!isTauriEnvironment()) {
      return;
    }

    try {
      await invoke('open_logs');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Failed to open log file', err);
      useLogStore.setState({ error: message });
    }
  }, []);

  const levelIsActive = useCallback(
    (level: LogLevel) =>
      activeLevels.some((value) => value.toLowerCase() === level.toLowerCase()),
    [activeLevels],
  );

  const renderBody = () => {
    if (!isTauriEnvironment()) {
      return (
        <div className="py-16 text-center text-white/70">
          <p>{t('logPanel.desktopOnly')}</p>
        </div>
      );
    }

    if (isLoading) {
      return (
        <div className="py-16 text-center text-white/60">
          {t('logPanel.loading')}
        </div>
      );
    }

    if (!entries.length) {
      return (
        <div className="py-16 text-center text-white/50">
          {search.trim().length ? t('logPanel.noMatches') : t('logPanel.noEntries')}
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {entries.map((entry, index) => (
          <div
            key={`${entry.timestamp}-${entry.raw}-${index}`}
            className="rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:border-white/20"
          >
            <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.3em] text-white/50">
              <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] text-white/70">
                {entry.timestamp || '—'}
              </span>
              <span
                className={clsx(
                  'rounded-full px-3 py-1 text-[10px] font-semibold',
                  entry.level === 'ERROR'
                    ? 'bg-rose-500/20 text-rose-200'
                    : entry.level === 'WARN'
                      ? 'bg-amber-400/20 text-amber-200'
                      : entry.level === 'ACTION'
                        ? 'bg-emerald-400/20 text-emerald-100'
                        : 'bg-slate-500/20 text-slate-200',
                )}
              >
                {entry.level}
              </span>
            </div>
            <p className="mt-3 text-sm text-white/90">{entry.message}</p>
            {entry.raw !== entry.message && (
              <p className="mt-2 text-xs text-white/40">{entry.raw}</p>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur" onClick={onClose} />
          <motion.div
            className="relative z-10 flex h-[80vh] w-[min(960px,92vw)] flex-col rounded-3xl border border-white/10 bg-[#0b0d16]/95 p-8 shadow-[0_30px_80px_rgba(8,11,20,0.55)]"
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ type: 'spring', stiffness: 220, damping: 28 }}
          >
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="text-sm uppercase tracking-[0.35em] text-white/40">{t('logPanel.title')}</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">{t('logPanel.subtitle')}</h2>
                {filePath && (
                  <p className="mt-2 text-xs text-white/40">
                    {t('logPanel.filePath')}: <span className="text-white/70">{filePath}</span>
                  </p>
                )}
                {truncated && (
                  <p className="mt-1 text-xs text-amber-300/80">{t('logPanel.truncated')}</p>
                )}
                {lastUpdated && (
                  <p className="mt-1 text-xs text-white/40">
                    {`${t('logPanel.lastUpdatedPrefix')} ${new Date(lastUpdated).toLocaleTimeString()}`}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.3em] text-white/70 transition hover:bg-white/10"
                  onClick={() => {
                    const next = !autoRefresh;
                    setAutoRefresh(next);
                  }}
                >
                  {autoRefresh ? t('logPanel.autoRefreshOn') : t('logPanel.autoRefreshOff')}
                </button>
                <button
                  type="button"
                  className="rounded-full border border-white/10 bg-emerald-500/20 px-4 py-2 text-xs uppercase tracking-[0.3em] text-emerald-100 shadow-[0_0_20px_rgba(16,185,129,0.35)] transition hover:bg-emerald-500/25"
                  onClick={() => {
                    void refresh();
                  }}
                  disabled={isRefreshing}
                >
                  {isRefreshing ? t('logPanel.refreshing') : t('logPanel.refresh')}
                </button>
                <button
                  type="button"
                  className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs uppercase tracking-[0.3em] text-white/80 transition hover:bg-white/15"
                  onClick={handleOpenFile}
                  disabled={!isTauriEnvironment()}
                  title={!isTauriEnvironment() ? t('logPanel.desktopOnly') : undefined}
                >
                  {t('logPanel.openFile')}
                </button>
                <button
                  type="button"
                  className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs uppercase tracking-[0.3em] text-white/70 transition hover:bg-white/20"
                  onClick={onClose}
                >
                  {t('common.close')}
                </button>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-4">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t('logPanel.searchPlaceholder')}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs uppercase tracking-[0.3em] text-white/30">
                  {entries.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {LOG_LEVELS.map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => toggleLevel(level)}
                    className={clsx(
                      'rounded-full border px-3 py-2 text-xs uppercase tracking-[0.3em] transition',
                      levelIsActive(level)
                        ? 'border-white/20 bg-white/20 text-white shadow-[0_0_20px_rgba(148,163,184,0.35)]'
                        : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10',
                    )}
                  >
                    {levelLabels[level as keyof typeof levelLabels] ?? level}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="mt-6 rounded-2xl border border-rose-400/40 bg-rose-500/15 p-4 text-sm text-rose-100">
                <div className="flex items-start justify-between gap-4">
                  <span>{error}</span>
                  <button
                    type="button"
                    className="rounded-full border border-rose-200/40 px-3 py-1 text-xs uppercase tracking-[0.3em] text-rose-50 transition hover:bg-rose-400/30"
                    onClick={clearError}
                  >
                    {t('logPanel.dismissError')}
                  </button>
                </div>
              </div>
            )}

            <div className="mt-6 flex-1 overflow-y-auto pr-2">
              {renderBody()}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
