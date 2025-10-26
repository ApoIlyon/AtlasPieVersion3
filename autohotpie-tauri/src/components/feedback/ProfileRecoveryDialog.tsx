import { useProfileStore } from '../../state/profileStore';

export function ProfileRecoveryDialog() {
  const recovery = useProfileStore((state) => state.recovery);
  const openBackups = useProfileStore((state) => state.openRecoveryBackups);
  const retryLoad = useProfileStore((state) => state.retryRecoveryLoad);
  const acknowledge = useProfileStore((state) => state.acknowledgeRecovery);

  if (!recovery) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/80 px-6 py-10 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-[#10121f] p-8 text-white shadow-[0_0_50px_rgba(15,23,42,0.85)]">
        <h2 className="text-2xl font-semibold">Profile recovery required</h2>
        <p className="mt-3 text-sm text-white/70">
          {recovery.message || 'The profile data could not be loaded. Please recover from a backup and retry.'}
        </p>
        <dl className="mt-5 space-y-3 text-xs text-white/60">
          <div>
            <dt className="font-semibold uppercase tracking-[0.25em] text-white/40">Profile file</dt>
            <dd className="mt-1 break-words font-mono text-[13px] text-white/80">{recovery.filePath}</dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-[0.25em] text-white/40">Backups directory</dt>
            <dd className="mt-1 break-words font-mono text-[13px] text-white/80">{recovery.backupsDir}</dd>
          </div>
        </dl>
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-white/70">
          <p>
            Restore the profile JSON from one of the available backups or delete the corrupted file. Once fixed,
            press <span className="font-semibold text-white">Retry load</span> to reload profiles.
          </p>
        </div>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="rounded-full border border-white/20 bg-white/10 px-5 py-2 text-sm font-medium text-white/80 transition hover:border-white/30 hover:text-white"
            onClick={() => void openBackups()}
          >
            Open backups folder
          </button>
          <button
            type="button"
            className="rounded-full border border-accent/40 bg-accent/30 px-5 py-2 text-sm font-semibold text-white transition hover:border-accent hover:bg-accent/50"
            onClick={() => void retryLoad()}
          >
            Retry load
          </button>
          <button
            type="button"
            className="rounded-full border border-white/10 bg-white/5 px-5 py-2 text-sm font-medium text-white/70 transition hover:border-white/20 hover:text-white"
            onClick={() => void acknowledge()}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
