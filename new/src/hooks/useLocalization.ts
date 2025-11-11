import { useCallback, useEffect } from 'react';
import { useLocalizationStore } from '../state/localizationStore';

export function useLocalization() {
  const translate = useLocalizationStore((state) => state.translate);
  const initialize = useLocalizationStore((state) => state.initialize);
  const languages = useLocalizationStore((state) => state.languages);
  const currentLanguage = useLocalizationStore((state) => state.currentLanguage);
  const missingKeys = useLocalizationStore((state) => state.missingKeys);
  const runtimeMissingKeys = useLocalizationStore((state) => state.runtimeMissingKeys);
  const isLoading = useLocalizationStore((state) => state.isLoading);
  const isRefreshing = useLocalizationStore((state) => state.isRefreshing);
  const lastUpdated = useLocalizationStore((state) => state.lastUpdated);
  const error = useLocalizationStore((state) => state.error);
  const setLanguage = useLocalizationStore((state) => state.setLanguage);
  const refresh = useLocalizationStore((state) => state.refresh);
  const clearError = useLocalizationStore((state) => state.clearError);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  return {
    t: translate,
    translate,
    languages,
    currentLanguage,
    missingKeys,
    runtimeMissingKeys,
    isLoading,
    isRefreshing,
    lastUpdated,
    setLanguage,
    refresh,
    error,
    clearError,
  };
}
