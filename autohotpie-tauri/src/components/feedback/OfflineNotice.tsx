import { useSystemStore } from '../../state/systemStore';

export function OfflineNotice() {
  const { status, error } = useSystemStore((state) => ({
    status: state.status,
    error: state.error,
  }));

  if (!error && !status.connectivity.isOffline && !status.safeMode) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-border bg-overlay/80 px-4 py-3 text-sm shadow-lg shadow-black/30">
      {error && <p className="text-red-400">{error}</p>}
      {!error && status.connectivity.isOffline && (
        <p className="text-text-secondary">
          Offline mode is active. Some features may be unavailable until connectivity is restored.
        </p>
      )}
      {!error && status.safeMode && (
        <p className="mt-2 text-text-secondary">
          Safe mode enabled due to read-only storage or fullscreen app. Editing capabilities are limited.
        </p>
      )}
    </div>
  );
}
