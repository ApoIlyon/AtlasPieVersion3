import { useSystemStore } from '../../state/systemStore';
import { useLocalization } from '../../hooks/useLocalization';
import { openUrl } from '@tauri-apps/plugin-opener';
import { isTauriEnvironment } from '../../utils/tauriEnvironment';

export function OfflineNotice() {
  const { t } = useLocalization();
  const { status, error, instructionUrl } = useSystemStore((state) => ({
    status: state.status,
    error: state.error,
    instructionUrl: state.readOnlyInstructionUrl,
  }));

  if (!error && !status.connectivity.isOffline && !status.safeMode) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-border bg-overlay/80 px-4 py-3 text-sm shadow-lg shadow-black/30 space-y-2">
      {error && <p className="text-red-400">{error}</p>}
      {!error && status.connectivity.isOffline && (
        <p className="text-text-secondary">{t('status.offlineNotice')}</p>
      )}
      {!error && status.safeMode && (
        <div className="space-y-2">
          <p className="text-text-secondary">{t('status.readOnlyNotice')}</p>
          {instructionUrl && (
            <button
              type="button"
              onClick={async () => {
                if (isTauriEnvironment()) {
                  await openUrl(instructionUrl);
                } else {
                  window.open(instructionUrl, '_blank', 'noopener');
                }
              }}
              className="rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.3em] text-white/70 transition hover:bg-white/10"
            >
              {t('status.readOnlyInstructions')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
