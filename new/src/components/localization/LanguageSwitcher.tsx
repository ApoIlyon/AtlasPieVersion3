import { useCallback, useMemo, type ChangeEvent, useId } from 'react';
import clsx from 'clsx';
import { useLocalization } from '../../hooks/useLocalization';

export function LanguageSwitcher() {
  const {
    t,
    languages,
    currentLanguage,
    setLanguage,
    refresh,
    isLoading,
    isRefreshing,
    missingKeys,
    runtimeMissingKeys,
    error,
    clearError,
  } = useLocalization();

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const next = event.target.value;
      if (next === currentLanguage) {
        return;
      }
      void setLanguage(next).catch(() => {
        /* error state handled by store */
      });
    },
    [currentLanguage, setLanguage],
  );

  const handleRefresh = useCallback(() => {
    void refresh();
  }, [refresh]);

  const selectId = useId();

  const missingCount = missingKeys.length;
  const runtimeMissingCount = useMemo(() => {
    const unique = new Set(runtimeMissingKeys);
    return unique.size;
  }, [runtimeMissingKeys]);

  const missingSummary = useMemo(() => missingKeys.join(', '), [missingKeys]);
  const runtimeSummary = useMemo(() => runtimeMissingKeys.join(', '), [runtimeMissingKeys]);

  const hasError = Boolean(error);

  return (
    <div className="flex flex-col items-end gap-2 text-right">
      <div className="flex items-center gap-2">
        <label className="text-xs uppercase tracking-[0.3em] text-white/50" htmlFor={selectId}>
          {t('localization.switcher.label')}
        </label>
        <select
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.3em] text-white/80 shadow-[0_0_12px_rgba(59,130,246,0.15)] transition hover:border-white/20 hover:text-white focus:outline-none"
          id={selectId}
          data-testid="language-select"
          value={currentLanguage}
          onChange={handleChange}
          disabled={isLoading || isRefreshing}
        >
          {languages.map((code) => (
            <option key={code} value={code} className="bg-slate-900 text-white">
              {code.toUpperCase()}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={clsx(
            'rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.3em] text-white/70 transition hover:bg-white/10 hover:text-white',
            (isLoading || isRefreshing) && 'cursor-not-allowed opacity-60',
          )}
          onClick={handleRefresh}
          disabled={isLoading || isRefreshing}
        >
          {isRefreshing ? '…' : t('localization.switcher.refresh')}
        </button>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 text-[11px] text-white/60">
        {missingCount > 0 && (
          <span
            className="rounded-full border border-yellow-400/30 bg-yellow-400/10 px-2 py-[2px] text-yellow-200"
            title={missingSummary}
            data-testid="localization-missing-badge"
          >
            {t('localization.switcher.missingLabel')}: {missingCount}
          </span>
        )}
        {runtimeMissingCount > 0 && (
          <span
            className="rounded-full border border-red-400/30 bg-red-400/10 px-2 py-[2px] text-red-200"
            title={runtimeSummary}
            data-testid="localization-runtime-badge"
          >
            {t('localization.switcher.runtimeLabel')}: {runtimeMissingCount}
          </span>
        )}
      </div>
      {hasError && (
        <button
          type="button"
          className="text-[11px] text-red-300 underline underline-offset-4 hover:text-red-200"
          onClick={clearError}
          title={error ?? undefined}
          data-testid="localization-error-button"
        >
          {t('localization.switcher.error')}
        </button>
      )}
    </div>
  );
}
