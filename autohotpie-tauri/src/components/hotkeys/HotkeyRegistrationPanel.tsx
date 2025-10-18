import { FormEvent, useState } from 'react';
import { useHotkeyStore } from '@/state/hotkeyStore';

export function HotkeyRegistrationPanel() {
  const [id, setId] = useState('global-pie');
  const [accelerator, setAccelerator] = useState('Ctrl+Alt+P');
  const [message, setMessage] = useState<string | null>(null);
  const { registerHotkey, isSubmitting, error, clearError } = useHotkeyStore((state) => ({
    registerHotkey: state.registerHotkey,
    isSubmitting: state.isSubmitting,
    error: state.error,
    clearError: state.clearError,
  }));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearError();
    setMessage(null);
    try {
      const success = await registerHotkey({ id, accelerator });
      if (success) {
        setMessage('Hotkey registered successfully.');
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
            required
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
          {message && <span className="text-xs text-text-secondary">{message}</span>}
        </div>

        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}
      </form>
    </section>
  );
}
