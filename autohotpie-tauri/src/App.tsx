import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { useAppStore } from './state/appStore';

function useVersion() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    invoke<string>('get_version').then(setVersion).catch(() => setVersion(null));
  }, []);

  return version;
}

export function App() {
  const version = useVersion();
  const { settings, isLoading, error } = useAppStore((state) => ({
    settings: state.settings,
    isLoading: state.isLoading,
    error: state.error,
  }));
  const initialize = useAppStore((state) => state.initialize);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  return (
    <div className="min-h-screen bg-background text-text-primary">
      <header className="flex items-center justify-between px-8 py-6 border-b border-border">
        <div>
          <p className="text-sm uppercase tracking-[0.35em] text-text-muted">AutoHotPie Tauri</p>
          <h1 className="mt-1 text-3xl font-semibold">Pie Menu Studio</h1>
        </div>
        <div className="rounded-full bg-overlay px-4 py-2 text-sm text-text-secondary shadow-glow-focus">
          {version ? `App v${version}` : 'Loading version…'}
        </div>
      </header>

      <main className="grid gap-6 px-8 py-10 lg:grid-cols-[320px,1fr]">
        <nav className="space-y-2">
          {[
            { id: 'dashboard', label: 'Dashboard' },
            { id: 'profiles', label: 'Profiles' },
            { id: 'actions', label: 'Actions' },
            { id: 'settings', label: 'Settings' },
          ].map((item) => (
            <button
              key={item.id}
              className="w-full rounded-2xl bg-surface/80 px-4 py-3 text-left text-sm font-medium text-text-secondary transition hover:bg-overlay hover:text-text-primary"
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>

        <section className="rounded-3xl bg-surface/90 p-8 shadow-lg shadow-black/30">
          <h2 className="text-2xl font-semibold text-text-primary">Welcome</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
            This is the placeholder UI shell for the AutoHotPie Tauri application. Phase 1
            tasks will flesh out the Tailwind token system, React state containers, and
            routing needed to render the pie menu designer, contextual profile editor, and
            settings surfaces inspired by <span className="text-accent">kando-2.0.0</span>.
          </p>

          <div className="mt-6 rounded-3xl border border-border bg-overlay/70 p-6">
            {error && (
              <p className="text-sm text-red-400">{error}</p>
            )}
            {!error && (
              <>
                <p className="text-sm text-text-secondary">
                  {isLoading && 'Loading settings…'}
                  {!isLoading && settings &&
                    `Loaded ${settings.app_profiles.length} profile${settings.app_profiles.length === 1 ? '' : 's'}.`}
                  {!isLoading && !settings && 'Settings not loaded yet.'}
                </p>
                {!isLoading && settings && (
                  <p className="mt-2 text-xs uppercase tracking-[0.2em] text-text-muted">
                    Global source: {settings.global?.app ? (settings.global as Record<string, any>).app?.sourceFileName ?? 'N/A' : 'N/A'}
                  </p>
                )}
              </>
            )}
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <article className="rounded-3xl border border-border bg-overlay/70 p-6">
              <h3 className="text-lg font-semibold">Global Pie Menu</h3>
              <p className="mt-2 text-sm text-text-secondary">
                Future iterations will render a live pie-menu preview with interactive
                segments and hover animations sourced from Tailwind tokens.
              </p>
            </article>
            <article className="rounded-3xl border border-border bg-overlay/70 p-6">
              <h3 className="text-lg font-semibold">Contextual Profiles</h3>
              <p className="mt-2 text-sm text-text-secondary">
                Profiles will react to active processes, window titles, or screen zones —
                mimicking the contextual behaviour from Kando and the original AutoHotPie.
              </p>
            </article>
          </div>
        </section>
      </main>
    </div>
  );
}
