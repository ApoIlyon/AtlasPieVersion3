import { useEffect, useMemo } from 'react';
import clsx from 'clsx';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useAutostartStore } from '../state/autostartStore';
import { useLocalization } from '../hooks/useLocalization';
import { isTauriEnvironment } from '../utils/tauriEnvironment';
import { useSystemStore } from '../state/systemStore';

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
      data-testid="autostart-status"
    >
      {label}
    </span>
  );
}

export function SettingsAutostart() {
  const { t } = useLocalization();
  const isDesktop = isTauriEnvironment();
  const storageMode = useSystemStore((state) => state.status.storageMode);
  const showReadOnlyBanner = storageMode === 'read_only';
  const { info, isLoading, isUpdating, error, initialize, refresh, setEnabled, openLocation, clearError, setErrored } =
    useAutostartStore(
    (state) => ({
      info: state.info,
      isLoading: state.isLoading,
      isUpdating: state.isUpdating,
      error: state.error,
      initialize: state.initialize,
      refresh: state.refresh,
      setEnabled: state.setEnabled,
      openLocation: state.openLocation,
      clearError: state.clearError,
      setErrored: state.setErrored,
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
      case 'errored':
        return t('settings.autostart.status.errored');
      default:
        return info.message ?? t('settings.autostart.status.unsupported');
    }
  })();

  const statusTone: 'success' | 'warning' | 'danger' = useMemo(() => {
    if (!info || info.status === 'unsupported') {
      return 'warning';
    }
    if (info.status === 'errored') {
      return 'danger';
    }
    return info.status === 'enabled' ? 'success' : 'danger';
  }, [info]);

  const providerLabel = info?.provider ? t(`settings.autostart.provider.${info.provider}`) : null;
  const reasonMessage = info?.reasonCode ? t(`settings.autostart.reason.${info.reasonCode}`) : null;
  const infoMessage = reasonMessage ?? info?.message ?? null;

  const actionDisabled = !isDesktop || isLoading || showReadOnlyBanner;
  const canEnable = !actionDisabled && !isUpdating && info?.status !== 'enabled';
  const canDisable = !actionDisabled && !isUpdating && info?.status === 'enabled';
  const canOpenLocation = !actionDisabled && !isUpdating && info?.status !== 'unsupported' && info?.status !== 'errored';

  const messageVariant = info?.status === 'errored' ? 'danger' : 'warning';

  const handleRetry = () => {
    clearError();
    void refresh();
  };

  const handleInstructions = async () => {
    const url = 'https://github.com/Apollyon/AtlasPieVersion3/blob/main/specs/001-build-tauri-pie/quickstart.md#troubleshooting';
    if (isDesktop) {
      try {
        await openUrl(url);
      } catch (instructionError) {
        setErrored(toMessage(instructionError));
      }
      return;
    }
    window.open(url, '_blank', 'noopener');
  };

  return (
    <div className="space-y-8">
      {!isDesktop && (
        <div
          className="rounded-3xl border border-dashed border-white/15 bg-white/5 p-6 text-sm text-white/70"
          data-testid="autostart-desktop-guard"
        >
          {t('settings.autostart.error.desktopOnly')}
        </div>
      )}
      <header className="space-y-4">
        <h2 className="text-2xl font-semibold text-white" data-testid="settings-autostart-heading">
          {t('settings.autostart.title')}
        </h2>
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
                (!canEnable || info?.status === 'enabled') && 'opacity-40',
              )}
              disabled={!canEnable}
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
                (!canDisable || info?.status !== 'enabled') && 'opacity-40',
              )}
              disabled={!canDisable}
              onClick={() => {
                void setEnabled(false);
              }}
            >
              {isUpdating && info?.status === 'enabled' ? '…' : t('settings.autostart.disable')}
            </button>
            <button
              type="button"
              className="rounded-full border border-white/10 px-5 py-2 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/15"
              disabled={!canOpenLocation}
              onClick={() => {
                void openLocation();
              }}
            >
              {t('settings.autostart.openLocation')}
            </button>
            <button
              type="button"
              className="rounded-full border border-accent/40 bg-accent/20 px-5 py-2 text-sm font-medium text-accent transition hover:border-accent hover:bg-accent/30"
              disabled={isLoading}
              onClick={handleRetry}
              data-testid="autostart-retry"
            >
              {t('settings.autostart.retry')}
            </button>
            <button
              type="button"
              className="rounded-full border border-white/10 px-5 py-2 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/15"
              onClick={() => {
                void handleInstructions();
              }}
              data-testid="autostart-instructions"
            >
              {t('settings.autostart.viewInstructions')}
            </button>
          </div>
        </div>

        <div className="mt-6 space-y-4 text-sm text-white/70">
          <p>{t('settings.autostart.permissions')}</p>
          {providerLabel && (
            <div
              className="rounded-2xl border border-white/10 bg-black/30 p-4 text-xs text-white/70"
              data-testid="autostart-provider"
            >
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/60">
                {t('settings.autostart.provider.label')}
              </h3>
              <p className="mt-2 text-white/80">{providerLabel}</p>
            </div>
          )}
          {info?.launcherPath && (
            <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-xs">
              <p className="text-white/70">{t('settings.autostart.launcherPath')}</p>
              <p className="mt-2 font-mono text-white/60">{info.launcherPath}</p>
            </div>
          )}
          {infoMessage && (
            <div
              className={clsx(
                'rounded-2xl border p-4 text-xs',
                messageVariant === 'danger'
                  ? 'border-rose-500/30 bg-rose-500/10 text-rose-100'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-200',
              )}
              data-testid="autostart-status-message"
            >
              {infoMessage}
            </div>
          )}
        </div>
      </section>

      {showReadOnlyBanner && (
        <div
          className="rounded-3xl border border-rose-500/40 bg-rose-500/10 p-6 text-sm text-rose-100 shadow-[0_0_20px_rgba(190,18,60,0.25)]"
          data-testid="autostart-readonly-banner"
        >
          <h3 className="text-base font-semibold uppercase tracking-[0.3em]">{t('settings.autostart.readOnly.title')}</h3>
          <p className="mt-2 text-sm text-rose-50/90">{t('settings.autostart.readOnly.description')}</p>
        </div>
      )}

      {error && (
        <div
          className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100"
          data-testid="autostart-error"
        >
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

function toMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error';
}
