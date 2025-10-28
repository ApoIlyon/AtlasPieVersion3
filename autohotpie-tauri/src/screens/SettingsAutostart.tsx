import { useEffect, useMemo } from 'react';
import clsx from 'clsx';
import { useAutostartStore } from '../state/autostartStore';
import { useLocalization } from '../hooks/useLocalization';
import { isTauriEnvironment } from '../utils/tauriEnvironment';

function StatusBadge({ label, tone }: { label: string; tone: 'success' | 'warning' | 'danger' }) {
  const toneClasses: Record<typeof tone, string> = {
    success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
    warning: 'border-amber-400/30 bg-amber-500/10 text-amber-200',
    danger: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
  } as const;

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs uppercase tracking-[0.3em]',
        toneClasses[tone],
      )}
    >
      {label}
    </span>
  );
}

export function SettingsAutostart() {
  const { t } = useLocalization();
  const { info, isLoading, isUpdating, error, initialize, setEnabled, openLocation, clearError } = useAutostartStore(
    (state) => ({
      info: state.info,
      isLoading: state.isLoading,
      isUpdating: state.isUpdating,
      error: state.error,
      initialize: state.initialize,
      setEnabled: state.setEnabled,
      openLocation: state.openLocation,
      clearError: state.clearError,
    }),
  );

  useEffect(() => {
    void initialize();
  }, [initialize]);

  const statusLabel = (() => {
    if (!info) {
      return t('settings.autostart.status.unsupported');
    }
    switch (info.status) {
      case 'enabled':
        return t('settings.autostart.status.enabled');
      case 'disabled':
        return t('settings.autostart.status.disabled');
      default:
        return info.message ?? t('settings.autostart.status.unsupported');
    }
  })();

  const statusTone: 'success' | 'warning' | 'danger' = useMemo(() => {
    if (!info || info.status === 'unsupported') {
      return 'warning';
    }
    return info.status === 'enabled' ? 'success' : 'danger';
  }, [info]);

  if (!isTauriEnvironment()) {
    return (
      <div className="rounded-3xl border border-dashed border-white/15 bg-white/5 p-10 text-center text-sm text-white/60">
        {t('settings.autostart.error.desktopOnly')}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="space-y-4">
        <h2 className="text-2xl font-semibold text-white">{t('settings.autostart.title')}</h2>
        <p className="max-w-2xl text-sm text-white/70">{t('settings.autostart.description')}</p>
      </header>

      <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_0_30px_rgba(15,23,42,0.35)] backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <StatusBadge label={statusLabel} tone={statusTone} />
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className={clsx(
                'rounded-full border border-white/10 px-5 py-2 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/15',
                info?.status === 'enabled' && 'opacity-40',
              )}
              disabled={isUpdating || info?.status === 'enabled'}
              onClick={() => {
                void setEnabled(true);
              }}
            >
              {isUpdating && info?.status !== 'enabled' ? '…' : t('settings.autostart.enable')}
            </button>
            <button
              type="button"
              className={clsx(
                'rounded-full border border-white/10 px-5 py-2 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/15',
                info?.status !== 'enabled' && 'opacity-40',
              )}
              disabled={isUpdating || info?.status !== 'enabled'}
              onClick={() => {
                void setEnabled(false);
              }}
            >
              {isUpdating && info?.status === 'enabled' ? '…' : t('settings.autostart.disable')}
            </button>
            <button
              type="button"
              className="rounded-full border border-white/10 px-5 py-2 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/15"
              disabled={isLoading || isUpdating || info?.status === 'unsupported'}
              onClick={() => {
                void openLocation();
              }}
            >
              {t('settings.autostart.openLocation')}
            </button>
          </div>
        </div>

        <div className="mt-6 space-y-4 text-sm text-white/70">
          <p>{t('settings.autostart.permissions')}</p>
          {info?.launcherPath && (
            <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-xs">
              <p className="text-white/70">{t('settings.autostart.macosLauncher')}</p>
              <p className="mt-2 font-mono text-white/60">{info.launcherPath}</p>
            </div>
          )}
          {info?.message && info.status !== 'unsupported' && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200">
              {info.message}
            </div>
          )}
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">
          <div className="flex items-start justify-between gap-4">
            <p>{error}</p>
            <button
              type="button"
              className="rounded-full border border-white/20 px-3 py-1 text-xs uppercase tracking-[0.3em] text-white/70 transition hover:border-white/30 hover:text-white"
              onClick={clearError}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default SettingsAutostart;
