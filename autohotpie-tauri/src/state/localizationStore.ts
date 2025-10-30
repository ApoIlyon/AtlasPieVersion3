import { invoke } from '@tauri-apps/api/core';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { create } from 'zustand';
import { isTauriEnvironment } from '../utils/tauriEnvironment';
import type { LocalizationPack } from '../types/localization';

const FALLBACK_LANGUAGE = 'en';

const FALLBACK_STRINGS: Record<string, string> = {
  'app.title': 'AutoHotPie',
  'app.subtitle': 'Automation pies without AutoHotkey',
  'header.brand': 'AutoHotPie Tauri',
  'header.title': 'Pie Menu Studio',
  'header.openLog': 'Open log',
  'header.versionLoading': 'Loading version…',
  'nav.dashboard': 'Dashboard',
  'nav.profiles': 'Profiles',
  'nav.actions': 'Actions',
  'nav.settings': 'Settings',
  'logPanel.title': 'Audit log',
  'logPanel.subtitle': 'Recent activity and system events',
  'logPanel.filePath': 'File',
  'logPanel.truncated': 'Showing the most recent records. Open the log file to inspect the full history.',
  'logPanel.lastUpdated': 'Updated at {time}',
  'logPanel.lastUpdatedPrefix': 'Updated at',
  'logPanel.autoRefreshOn': 'Auto-refresh ✓',
  'logPanel.autoRefreshOff': 'Auto-refresh ✗',
  'logPanel.refresh': 'Refresh',
  'logPanel.refreshing': 'Refreshing…',
  'logPanel.openFile': 'Open file',
  'logPanel.searchPlaceholder': 'Search message, level, or raw entry…',
  'logPanel.level.action': 'Action',
  'logPanel.level.error': 'Error',
  'logPanel.level.warn': 'Warning',
  'logPanel.level.info': 'Info',
  'logPanel.desktopOnly': 'Log panel is only available in the desktop build.',
  'logPanel.loading': 'Loading log entries…',
  'logPanel.noMatches': 'No entries match the current filters.',
  'logPanel.noEntries': 'No log entries recorded yet.',
  'logPanel.dismissError': 'Dismiss',
  'settings.importExport.desktopOnly': 'Import/export is only available in the desktop build.',
  'settings.importExport.exportTitle': 'Export profiles',
  'settings.importExport.exportDescription': 'Generate a JSON bundle containing your profiles, actions, settings and icons. Keep it for backups or share with teammates.',
  'settings.importExport.exportAll': 'Export all profiles',
  'settings.importExport.exportActive': 'Export active profile',
  'settings.importExport.exporting': 'Exporting…',
  'settings.importExport.exportingActive': 'Please wait…',
  'settings.importExport.latestExport': 'Latest export',
  'settings.importExport.latestExportPending': 'Pending',
  'settings.importExport.downloadJson': 'Download JSON',
  'settings.importExport.copyBundle': 'Copy to clipboard',
  'settings.importExport.bundleCopied': 'Bundle copied to clipboard.',
  'settings.importExport.bundleDownloaded': 'Bundle downloaded as JSON file.',
  'settings.importExport.bundleSaved': 'Bundle saved to',
  'settings.importExport.clipboardFailed': 'Clipboard access failed. Try downloading the bundle instead.',
  'settings.importExport.saveFailed': 'Failed to save bundle. Try again or choose another location.',
  'settings.importExport.saveCancelled': 'Save cancelled.',
  'settings.importExport.preview': 'Preview bundle contents',
  'settings.importExport.importTitle': 'Import bundle',
  'settings.importExport.importDescription': 'Select an exported JSON file or paste bundle contents. Importing replaces profiles and updates settings/icons.',
  'settings.importExport.chooseFile': 'Choose file…',
  'settings.importExport.placeholder': 'Paste bundle JSON here or use the file picker',
  'settings.importExport.importing': 'Importing…',
  'settings.importExport.importButton': 'Import bundle',
  'settings.importExport.clearInput': 'Clear input',
  'settings.importExport.importSummary': 'Import summary',
  'settings.importExport.importedProfiles': 'Imported profiles',
  'settings.importExport.skippedProfiles': 'Skipped profiles',
  'settings.importExport.warnings': 'Warnings',
  'settings.importExport.fileEmpty': 'Selected file is empty.',
  'settings.importExport.fileReadError': 'Failed to read selected file.',
  'settings.importExport.provideJson': 'Provide JSON via upload or paste before importing.',
  'settings.autostart.title': 'Autostart',
  'settings.autostart.description': 'Control whether AutoHotPie launches automatically when you sign in to your device. Platform-specific permissions may apply.',
  'settings.autostart.status.enabled': 'Autostart is currently enabled.',
  'settings.autostart.status.disabled': 'Autostart is currently disabled.',
  'settings.autostart.status.unsupported': 'Autostart is not available on this platform.',
  'settings.autostart.status.errored': 'Autostart encountered an error.',
  'settings.autostart.enable': 'Enable autostart',
  'settings.autostart.disable': 'Disable autostart',
  'settings.autostart.openLocation': 'Open autostart location',
  'settings.autostart.openSuccess': 'Opening autostart location…',
  'settings.autostart.permissions': 'If the toggle fails, verify that you granted startup permissions to the app.',
  'settings.autostart.macosLauncher': 'macOS launch agent path',
  'settings.autostart.error.desktopOnly': 'Autostart is only available in the desktop build.',
  'settings.autostart.error.generic': 'Failed to update autostart. Try again or adjust system settings.',
  'settings.autostart.retry': 'Retry',
  'settings.autostart.viewInstructions': 'View instructions',
  'settings.autostart.readOnly.title': 'Read-only safeguard',
  'settings.autostart.readOnly.description':
    'Storage is read-only. Autostart controls are paused until write access is restored.',
  'settings.updates.title': 'Updates',
  'settings.updates.description': 'Check for new AutoHotPie releases on GitHub and download installers when they become available.',
  'settings.updates.status.available': 'A new version is available.',
  'settings.updates.status.current': 'You are on the latest version.',
  'settings.updates.status.desktopOnly': 'Updates are only available in the desktop build.',
  'settings.updates.currentVersion': 'Current version',
  'settings.updates.latestVersion': 'Latest version',
  'settings.updates.releaseNotes': 'Release notes',
  'settings.updates.lastChecked': 'Last checked',
  'settings.updates.lastChecked.never': 'Never',
  'settings.updates.check': 'Check for updates',
  'settings.updates.checking': 'Checking…',
  'settings.updates.forceCheck': 'Force refresh',
  'settings.updates.download': 'Open release page',
  'settings.updates.error': 'Failed to check for updates. Try again later.',
  'settings.updates.error.rateLimit': 'GitHub rate limit exceeded. Please wait a few minutes and retry.',
  'settings.updates.error.unauthorized': 'GitHub authorization failed. Check the access token.',
  'settings.updates.error.notFound': 'No releases found for the configured repository.',
  'settings.updates.error.noReleases': 'No stable releases are available yet.',
  'settings.updates.error.http': 'GitHub responded with HTTP {status}. Try again later.',
  'settings.updates.error.network': 'Network error while contacting GitHub.',
  'settings.updates.error.parse': 'Failed to parse GitHub releases response.',
  'settings.updates.error.unknown': 'Unexpected update checker error.',
  'settings.updates.error.desktopOnly': 'Updates are only available in the desktop build.',
  'localization.switcher.label': 'Language',
  'localization.switcher.refresh': 'Refresh',
  'localization.switcher.updated': 'Localization packs refreshed',
  'localization.switcher.error': 'Failed to load localization',
  'localization.switcher.missingLabel': 'Missing entries',
  'localization.switcher.runtimeLabel': 'Runtime missing',
  'tray.menu.refresh': 'Refresh localization',
  'tray.menu.open': 'Open application',
};

const FALLBACK_PACK: LocalizationPack = {
  schemaVersion: 1,
  language: FALLBACK_LANGUAGE,
  version: '1.0.0',
  strings: FALLBACK_STRINGS,
  missingKeys: [],
  fallbackOf: null,
};

function toMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error';
}

type LocalizationStore = {
  fallbackLanguage: string;
  fallbackStrings: Record<string, string>;
  currentLanguage: string;
  languages: string[];
  pack: LocalizationPack;
  missingKeys: string[];
  runtimeMissingKeys: string[];
  isLoading: boolean;
  isRefreshing: boolean;
  initialized: boolean;
  listenerRegistered: boolean;
  lastUpdated: string | null;
  error: string | null;
  unlisten: UnlistenFn | null;
  packs: Record<string, LocalizationPack>;
  initialize: () => Promise<void>;
  setLanguage: (language: string) => Promise<void>;
  refresh: () => Promise<boolean>;
  reloadCurrentLanguage: () => Promise<void>;
  registerListener: () => Promise<void>;
  unregisterListener: () => void;
  applyPack: (pack: LocalizationPack, languages?: string[]) => void;
  translate: (key: string) => string;
  clearError: () => void;
};

export const useLocalizationStore = create<LocalizationStore>((set, get) => ({
  fallbackLanguage: FALLBACK_LANGUAGE,
  fallbackStrings: FALLBACK_STRINGS,
  currentLanguage: FALLBACK_LANGUAGE,
  languages: [FALLBACK_LANGUAGE],
  pack: FALLBACK_PACK,
  missingKeys: [],
  runtimeMissingKeys: [],
  isLoading: false,
  isRefreshing: false,
  initialized: false,
  listenerRegistered: false,
  lastUpdated: null,
  error: null,
  unlisten: null,
  packs: { [FALLBACK_LANGUAGE]: FALLBACK_PACK },
  initialize: async () => {
    if (get().initialized) {
      return;
    }

    if (!isTauriEnvironment()) {
      set({
        initialized: true,
        pack: FALLBACK_PACK,
        currentLanguage: FALLBACK_LANGUAGE,
        languages: Array.from(new Set([FALLBACK_LANGUAGE, ...Object.keys(get().packs)])).sort(),
        missingKeys: [],
        runtimeMissingKeys: [],
        lastUpdated: new Date().toISOString(),
      });
      return;
    }

    set({ isLoading: true, error: null });

    try {
      const languages = await invoke<string[]>('list_localization_languages');
      const preferred = get().currentLanguage;
      const available = languages.length ? languages : [FALLBACK_LANGUAGE];
      const target = available.includes(preferred)
        ? preferred
        : available.includes(FALLBACK_LANGUAGE)
          ? FALLBACK_LANGUAGE
          : available[0];

      const pack = await invoke<LocalizationPack>('get_localization_pack', {
        language: target,
      });

      get().applyPack(pack, languages);
      set({ initialized: true });
      await get().registerListener();
    } catch (error) {
      console.error('Failed to initialize localization', error);
      set({
        error: toMessage(error),
        pack: FALLBACK_PACK,
        currentLanguage: FALLBACK_LANGUAGE,
        languages: [FALLBACK_LANGUAGE],
        missingKeys: [],
        runtimeMissingKeys: [],
        initialized: true,
      });
    } finally {
      set({ isLoading: false });
    }
  },
  setLanguage: async (language: string) => {
    if (!isTauriEnvironment()) {
      const packs = get().packs;
      const nextPack = packs[language];
      if (nextPack) {
        get().applyPack(nextPack);
        return;
      }

      const fallback = packs[language] ??
        (language === FALLBACK_LANGUAGE ? FALLBACK_PACK : undefined);

      if (fallback) {
        get().applyPack(fallback);
        return;
      }
      set({
        currentLanguage: language,
        pack: FALLBACK_PACK,
        languages: Array.from(new Set([language, ...Object.keys(packs), FALLBACK_LANGUAGE])).sort(),
      });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      const pack = await invoke<LocalizationPack>('get_localization_pack', {
        language,
      });
      get().applyPack(pack);
    } catch (error) {
      set({ error: toMessage(error) });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },
  refresh: async () => {
    if (!isTauriEnvironment()) {
      get().applyPack(FALLBACK_PACK);
      return true;
    }

    set({ isRefreshing: true, error: null });
    try {
      await invoke('refresh_localization_packs');
      await get().reloadCurrentLanguage();
      return true;
    } catch (error) {
      set({ error: toMessage(error), isRefreshing: false });
      return false;
    }
  },
  reloadCurrentLanguage: async () => {
    if (!isTauriEnvironment()) {
      get().applyPack(FALLBACK_PACK);
      return;
    }

    try {
      const current = get().currentLanguage || FALLBACK_LANGUAGE;
      const pack = await invoke<LocalizationPack>('get_localization_pack', {
        language: current,
      });
      get().applyPack(pack);
    } catch (error) {
      console.error('Failed to reload localization pack', error);
      set({ error: toMessage(error), isRefreshing: false, isLoading: false });
    }
  },
  registerListener: async () => {
    if (!isTauriEnvironment() || get().listenerRegistered) {
      return;
    }

    try {
      const { listen } = await import('@tauri-apps/api/event');
      const unlisten = await listen('localization://updated', () => {
        void get().reloadCurrentLanguage();
      });
      set({ listenerRegistered: true, unlisten });
    } catch (error) {
      console.error('Failed to subscribe to localization updates', error);
    }
  },
  unregisterListener: () => {
    const unlisten = get().unlisten;
    if (unlisten) {
      try {
        unlisten();
      } catch (error) {
        console.error('Failed to unsubscribe from localization updates', error);
      }
    }
    set({ listenerRegistered: false, unlisten: null });
  },
  applyPack: (pack: LocalizationPack, languages?: string[]) => {
    const nextLanguages = languages && languages.length ? languages : get().languages;
    const languageSet = new Set(nextLanguages);
    const resolvedLanguage = pack.language || FALLBACK_LANGUAGE;
    languageSet.add(resolvedLanguage);
    const orderedLanguages = Array.from(languageSet).sort();

    set({
      pack,
      currentLanguage: resolvedLanguage,
      languages: orderedLanguages,
      missingKeys: pack.missingKeys ?? [],
      runtimeMissingKeys: [],
      lastUpdated: new Date().toISOString(),
      isLoading: false,
      isRefreshing: false,
      error: null,
      packs: {
        ...get().packs,
        [resolvedLanguage]: pack,
      },
    });
  },
  translate: (key: string) => {
    const { pack, fallbackStrings, fallbackLanguage, missingKeys } = get();
    const candidate = pack?.strings?.[key];
    if (candidate) {
      return candidate;
    }

    const fallback = fallbackStrings[key] ?? key;

    if (pack && pack.language !== fallbackLanguage && !missingKeys.includes(key)) {
      const schedule =
        typeof queueMicrotask === 'function'
          ? queueMicrotask
          : (callback: () => void) => {
              setTimeout(callback, 0);
            };
      schedule(() => {
        set((state) => {
          if (state.runtimeMissingKeys.includes(key)) {
            return state;
          }
          return {
            runtimeMissingKeys: [...state.runtimeMissingKeys, key],
          };
        });
      });
    }

    return fallback;
  },
  clearError: () => set({ error: null }),
}));

if (typeof window !== 'undefined') {
  (window as typeof window & { __AUTOHOTPIE_LOCALIZATION_STORE__?: typeof useLocalizationStore })
    .__AUTOHOTPIE_LOCALIZATION_STORE__ = useLocalizationStore;
}
