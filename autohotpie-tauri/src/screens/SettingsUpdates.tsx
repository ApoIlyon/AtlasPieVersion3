import { useCallback, useEffect, useMemo } from 'react';
import clsx from 'clsx';
import { useUpdateStore, disposeUpdateStoreListener } from '../state/updateStore';
import { useLocalization } from '../hooks/useLocalization';
import { isTauriEnvironment } from '../utils/tauriEnvironment';

const STATUS_COLORS: Record<'current' | 'available' | 'error' | 'unsupported', string> = {
  current: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  available: 'border-sky-500/30 bg-sky-500/10 text-sky-100',
  error: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
  unsupported: 'border-amber-400/30 bg-amber-500/10 text-amber-100',
};

function formatTimestamp(timestamp: string | null, fallback: string): string {
  if (!timestamp) {
    return fallback;
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }
  return date.toLocaleString();
}

export function SettingsUpdates() {
  const { t } = useLocalization();
  const { status, isChecking, error, initialize, checkForUpdates } = useUpdateStore((state) => ({
    status: state.status,
    isChecking: state.isChecking,
    error: state.error,
    initialize: state.initialize,
    checkForUpdates: state.checkForUpdates,
  }));

  const deriveErrorMessage = useCallback(
    (rawError: string | null | undefined) => {
      if (!rawError) {
        return null;
      }

      if (rawError === 'updates.desktopOnly') {
        return t('settings.updates.error.desktopOnly');
      }

      if (rawError.startsWith('updates.error.http:')) {
        const statusCode = rawError.split(':')[1] ?? 'unknown';
        return t('settings.updates.error.http').replace('{status}', statusCode);
      }

      if (rawError.startsWith('updates.error.network:')) {
        return `${t('settings.updates.error.network')}\n${rawError.split(':').slice(1).join(':')}`;
      }

      if (rawError.startsWith('updates.error.parse:')) {
        return `${t('settings.updates.error.parse')}\n${rawError.split(':').slice(1).join(':')}`;
      }

      if (rawError.startsWith('updates.error.')) {
        const key = rawError.split(':')[0];
        return t(key);
      }

      return t('settings.updates.error.unknown');
    },
    [t],
  );

  useEffect(() => {
    void initialize();
    return () => {
      void disposeUpdateStoreListener();
    };
  }, [initialize]);

  const badgeTone = useMemo(() => {
    if (!status) {
      return STATUS_COLORS.error;
    }
    if (status.error === 'updates.desktopOnly') {
      return STATUS_COLORS.unsupported;
    }
    if (status.isUpdateAvailable) {
      return STATUS_COLORS.available;
    }
    if (status.error) {
      return STATUS_COLORS.error;
    }
    return STATUS_COLORS.current;
  }, [status]);

  const badgeLabel = (() => {
    if (!status) {
      return t('settings.updates.error');
    }
    if (status.error === 'updates.desktopOnly') {
      return t('settings.updates.status.desktopOnly');
    }
    if (status.isUpdateAvailable) {
      return t('settings.updates.status.available');
    }
    if (status.error) {
      return t('settings.updates.error');
    }
    return t('settings.updates.status.current');
  })();

  const lastCheckedLabel = formatTimestamp(status?.lastChecked ?? null, t('settings.updates.lastChecked.never'));

  if (!isTauriEnvironment()) {
    return (
      <div className="rounded-3xl border border-dashed border-white/15 bg-white/5 p-10 text-center text-sm text-white/60">
        {t('settings.updates.status.desktopOnly')}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="space-y-4">
        <h2 className="text-2xl font-semibold text-white">{t('settings.updates.title')}</h2>
        <p className="max-w-2xl text-sm text-white/70">{t('settings.updates.description')}</p>
      </header>

      <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_0_30px_rgba(15,23,42,0.35)] backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <span
            className={clsx(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs uppercase tracking-[0.3em]',
              badgeTone,
            )}
          >
            {badgeLabel}
          </span>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className={clsx(
                'rounded-full border border-white/10 px-5 py-2 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/15',
                isChecking && 'opacity-40',
              )}
              disabled={isChecking}
              onClick={() => {
                void checkForUpdates(false);
              }}
            >
              {isChecking ? t('settings.updates.checking') : t('settings.updates.check')}
            </button>
            <button
              type="button"
              className="rounded-full border border-white/10 px-5 py-2 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/15"
              disabled={isChecking}
              onClick={() => {
                void checkForUpdates(true);
              }}
            >
              {t('settings.updates.forceCheck')}
            </button>
            <button
              type="button"
              className={clsx(
                'rounded-full border border-white/10 px-5 py-2 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/15',
                (!status?.downloadUrl || !status.isUpdateAvailable) && 'opacity-40',
              )}
              disabled={!status?.downloadUrl || !status.isUpdateAvailable}
              onClick={() => {
                if (status?.downloadUrl) {
                  void window.open(status.downloadUrl, '_blank', 'noopener,noreferrer');
                }
              }}
            >
              {t('settings.updates.download')}
            </button>
          </div>
        </div>

        <dl className="mt-6 grid gap-6 sm:grid-cols-2">
          <div className="space-y-1">
            <dt className="text-xs uppercase tracking-[0.3em] text-white/40">{t('settings.updates.currentVersion')}</dt>
            <dd className="font-mono text-sm text-white/80">{status?.currentVersion ?? '—'}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-xs uppercase tracking-[0.3em] text-white/40">{t('settings.updates.latestVersion')}</dt>
            <dd className="font-mono text-sm text-white/80">{status?.latestVersion ?? '—'}</dd>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <dt className="text-xs uppercase tracking-[0.3em] text-white/40">{t('settings.updates.lastChecked')}</dt>
            <dd className="text-sm text-white/70">{lastCheckedLabel}</dd>
          </div>
        </dl>

        {status?.releaseNotes && (
          <div className="mt-6 space-y-3">
            <h3 className="text-xs uppercase tracking-[0.3em] text-white/40">{t('settings.updates.releaseNotes')}</h3>
            <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white/70 whitespace-pre-wrap">
              {status.releaseNotes}
            </div>
          </div>
        )}

        {(() => {
          const errorSource = status?.error ?? error;
          const message = deriveErrorMessage(errorSource);
          if (!message) {
            return null;
          }

          return (
            <div className="mt-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100 whitespace-pre-wrap">
              {message}
            </div>
          );
        })()}
      </section>
    </div>
  );
}

export default SettingsUpdates;
