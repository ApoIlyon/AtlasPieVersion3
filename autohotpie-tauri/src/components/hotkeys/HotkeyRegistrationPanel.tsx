import { FormEvent, useMemo, useState } from 'react';
import { useHotkeyStore } from '../../state/hotkeyStore';
import { useProfileStore, selectProfileHotkeyStatus } from '../../state/profileStore';

export function HotkeyRegistrationPanel() {
  const [id, setId] = useState('global-pie');
  const [accelerator, setAccelerator] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const { registerHotkey, isSubmitting, error, clearError } = useHotkeyStore((state) => ({
    registerHotkey: state.registerHotkey,
    isSubmitting: state.isSubmitting,
    error: state.error,
    clearError: state.clearError,
  }));
  const profileHotkeyStatus = useProfileStore(selectProfileHotkeyStatus);
  const clearProfileHotkeyStatus = useProfileStore((state) => state.clearHotkeyStatus);

  const profileConflicts = useMemo(
    () => profileHotkeyStatus?.conflicts ?? [],
    [profileHotkeyStatus?.conflicts],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearError();
    setMessage(null);
    try {
      const trimmed = accelerator.trim();
      const success = await registerHotkey({ id, accelerator: trimmed });
      if (success) {
        setMessage(trimmed ? 'Hotkey registered successfully.' : 'Hotkey cleared.');
      } else {
        setMessage(null);
      }
    } catch {
      setMessage(null);
    }
  }

  return (
    <section className="rounded-3xl border border-border bg-overlay/70 p-6 shadow-lg shadow-black/30">
      <h3 className="text-lg font-semibold text-text-primary">Hotkey registration</h3>
      <p className="mt-2 text-sm text-text-secondary">
        Configure a global accelerator for the pie menu. Conflicts will surface a retry dialog with override options.
      </p>

      <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
        <label className="block text-sm">
          <span className="text-text-muted">Identifier</span>
          <input
            className="mt-1 w-full rounded-2xl border border-border bg-background/70 px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
            value={id}
            onChange={(event) => setId(event.target.value)}
            placeholder="global-pie"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-text-muted">Accelerator</span>
          <input
            className="mt-1 w-full rounded-2xl border border-border bg-background/70 px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
            value={accelerator}
            onChange={(event) => setAccelerator(event.target.value)}
            placeholder="Ctrl+Alt+P"
          />
        </label>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="submit"
            className="rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Registering…' : 'Register hotkey'}
          </button>
          <button
            type="button"
            className="rounded-2xl border border-border px-4 py-2 text-sm font-medium text-text-secondary transition hover:bg-overlay hover:text-text-primary"
            onClick={() => {
              setAccelerator('');
              setMessage(null);
              clearError();
            }}
            disabled={isSubmitting && !accelerator.length}
          >
            Clear
          </button>
          {message && <span className="text-xs text-text-secondary">{message}</span>}
        </div>

        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        {profileHotkeyStatus && !profileHotkeyStatus.registered && (
          <div className="rounded-2xl border border-border/60 bg-overlay/60 p-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-text-primary">Profile hotkey conflicts</h4>
              <button
                type="button"
                className="text-xs uppercase tracking-[0.25em] text-text-tertiary transition hover:text-text-secondary"
                onClick={clearProfileHotkeyStatus}
              >
                Clear
              </button>
            </div>
            <p className="mt-2 text-xs text-text-secondary">
              Resolve the conflicts below in the Profiles dashboard before re-registering this shortcut.
            </p>
            <ul className="mt-3 space-y-2">
              {profileConflicts.map((conflict, index) => (
                <li
                  key={`${conflict.code}-${conflict.message}-${index}`}
                  className="rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-xs text-text-secondary"
                >
                  <span className="font-semibold text-text-primary">{conflict.code}</span>
                  {conflict.message ? ` — ${conflict.message}` : null}
                </li>
              ))}
            </ul>
          </div>
        )}
      </form>
    </section>
  );
}
