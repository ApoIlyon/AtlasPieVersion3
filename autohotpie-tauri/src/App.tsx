import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from './state/appStore';
import { useSystemStore } from './state/systemStore';
import { OfflineNotice } from './components/feedback/OfflineNotice';
import { ProfileRecoveryDialog } from './components/feedback/ProfileRecoveryDialog';
import { HotkeyConflictDialog } from './components/hotkeys/HotkeyConflictDialog';
import { HotkeyRegistrationPanel } from './components/hotkeys/HotkeyRegistrationPanel';
import { useHotkeyStore } from './state/hotkeyStore';
import { useProfileStore, selectProfileHotkeyStatus } from './state/profileStore';
import { isTauriEnvironment } from './utils/tauriEnvironment';
import { ProfilesDashboard } from './screens/ProfilesDashboard';
import { ProfileEditor } from './components/profile-editor/ProfileEditor';
import { LanguageSwitcher } from './components/localization/LanguageSwitcher';
import { SettingsImportExport } from './screens/SettingsImportExport';
import { SettingsAutostart } from './screens/SettingsAutostart';
import { SettingsUpdates } from './screens/SettingsUpdates';
import { useLocalization } from './hooks/useLocalization';
import { usePieMenuHotkey } from './hooks/usePieMenuHotkey';
import type { PieSliceDefinition } from './components/pie/PieMenu';
import { slicesForProfile } from './mocks/contextProfiles';
import { LogPanel } from './components/log/LogPanel';
import { useUpdateStore } from './state/updateStore';
import type { UpdateStatus } from './state/types';

type AppSection = 'dashboard' | 'profiles' | 'actions' | 'settings';

function useVersion() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauriEnvironment()) {
      setVersion(null);
      return;
    }

    invoke<string>('get_version').then(setVersion).catch(() => setVersion(null));
  }, []);

  return version;
}

export function App() {
  const { t, currentLanguage } = useLocalization();
  useEffect(() => {
    if (isTauriEnvironment()) {
      const tauriWindow = window as typeof window & {
        __TAURI__?: {
          window?: {
            appWindow?: {
              openDevtools?: () => Promise<void>;
            };
          };
        };
      };

      void tauriWindow.__TAURI__?.window?.appWindow?.openDevtools?.();
    }
  }, []);

  const version = useVersion();
  const { settings, isLoading, error } = useAppStore((state) => ({
    settings: state.settings,
    isLoading: state.isLoading,
    error: state.error,
  }));
  const {
    profiles,
    activeProfileId,
    loadProfiles,
    initialized: profilesInitialized,
    isLoading: profilesLoading,
    error: profilesError,
    activateProfile,
    createProfile,
  } = useProfileStore((state) => ({
    profiles: state.profiles,
    activeProfileId: state.activeProfileId,
    loadProfiles: state.loadProfiles,
    initialized: state.initialized,
    isLoading: state.isLoading,
    error: state.error,
    activateProfile: state.activateProfile,
    createProfile: state.createProfile,
  }));
  const initialize = useAppStore((state) => state.initialize);
  const systemInit = useSystemStore((state) => state.init);
  const systemStatus = useSystemStore((state) => state.status);
  const systemError = useSystemStore((state) => state.error);
  const setSystemOffline = useSystemStore((state) => state.setOffline);
  const setSystemStorageMode = useSystemStore((state) => state.setStorageMode);
  const {
    dialogOpen,
    dialogStatus,
    closeDialog,
    retryWithOverride,
    disableConflictingHotkey,
    isSubmitting: isHotkeySubmitting,
  } = useHotkeyStore((state) => ({
    dialogOpen: state.dialogOpen,
    dialogStatus: state.dialogStatus,
    closeDialog: state.closeDialog,
    retryWithOverride: state.retryWithOverride,
    disableConflictingHotkey: state.disableConflictingHotkey,
    isSubmitting: state.isSubmitting,
  }));
  const retryProfileHotkeyWithOverride = useProfileStore((state) => state.retryProfileHotkeyWithOverride);
  const profileHotkeyStatus = useProfileStore(selectProfileHotkeyStatus);
  const clearProfileHotkeyStatus = useProfileStore((state) => state.clearHotkeyStatus);
  const systemActiveProfile = useSystemStore((state) => state.activeProfile);
  const status = useSystemStore((state) => state.status);
  const [activeSection, setActiveSection] = useState<AppSection>('dashboard');
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const mockOffline = params.get('mockOffline');
    if (!mockOffline) {
      return;
    }
    const normalized = mockOffline.toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
      const timestamp = new Date().toISOString();
      setSystemOffline(true, timestamp);
      setSystemStorageMode('read_only');
    }
  }, [setSystemOffline, setSystemStorageMode]);
  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }
    const appWindow = window as typeof window & {
      __AUTOHOTPIE_APP__?: { setSection: (section: AppSection) => void };
    };
    const previousHelper = appWindow.__AUTOHOTPIE_APP__;

    appWindow.__AUTOHOTPIE_APP__ = {
      setSection: (section: AppSection) => {
        setActiveSection(section);
        if (section !== 'profiles') {
          setSelectedProfileId(null);
        }
      },
    };

    return () => {
      if (previousHelper) {
        appWindow.__AUTOHOTPIE_APP__ = previousHelper;
        return;
      }
      if (appWindow.__AUTOHOTPIE_APP__) {
        delete appWindow.__AUTOHOTPIE_APP__;
      }
    };
  }, [setActiveSection, setSelectedProfileId]);
  const [isLogPanelOpen, setIsLogPanelOpen] = useState(false);

  const loadedProfilesText = t('dashboard.loadedProfiles').replace('{count}', String(profiles.length));

  const statusMessages: string[] = [];
  if (isLoading) {
    statusMessages.push(t('dashboard.loadingSettings'));
  } else if (!settings) {
    statusMessages.push(t('dashboard.settingsMissing'));
  }
  if (profilesLoading) {
    statusMessages.push(t('dashboard.loadingProfiles'));
  } else if (profilesInitialized) {
    statusMessages.push(loadedProfilesText);
  }

  useEffect(() => {
    if (isTauriEnvironment()) {
      return;
    }

    type UpdateMocks = {
      openCalls: string[];
      seed: (status: UpdateStatus) => void;
      next: (status: UpdateStatus) => void;
      fail: (message: string) => void;
    };

    const appWindow = window as typeof window & {
      __AUTOHOTPIE_MOCKS__?: Record<string, unknown> & { updates?: UpdateMocks };
    };

    const previousMocks = appWindow.__AUTOHOTPIE_MOCKS__;
    const openCalls: string[] = [];
    const originalOpen = window.open?.bind(window) ?? null;

    const storeSnapshot = useUpdateStore.getState();
    const originalInitialize = storeSnapshot.initialize;
    const originalCheckForUpdates = storeSnapshot.checkForUpdates;

    let queuedStatuses: UpdateStatus[] = [];
    let pendingError: string | null = null;

    const mockInitialize = async () => {};
    const mockCheckForUpdates = async () => {
      useUpdateStore.setState({ isChecking: true, error: null });
      const nextStatus = queuedStatuses.shift();
      if (nextStatus) {
        useUpdateStore.setState({ status: nextStatus, isChecking: false, error: null });
        return;
      }
      if (pendingError) {
        const errorMessage = pendingError;
        pendingError = null;
        useUpdateStore.setState((state) => ({
          status: state.status ? { ...state.status, error: errorMessage } : null,
          error: errorMessage,
          isChecking: false,
        }));
        return;
      }
      useUpdateStore.setState({ isChecking: false });
    };

    useUpdateStore.setState({
      initialize: mockInitialize,
      checkForUpdates: mockCheckForUpdates,
    });

    const updatesMock: UpdateMocks = {
      openCalls,
      seed(status) {
        queuedStatuses = [];
        pendingError = null;
        openCalls.length = 0;
        useUpdateStore.setState({ status, initialized: true, error: null, isChecking: false });
      },
      next(status) {
        queuedStatuses.push(status);
      },
      fail(message) {
        pendingError = message;
      },
    };

    window.open = ((url: string | URL | undefined, target?: string, features?: string) => {
      if (typeof url !== 'undefined') {
        openCalls.push(String(url));
      }
      return originalOpen ? originalOpen(url, target, features) : null;
    }) as typeof window.open;

    appWindow.__AUTOHOTPIE_MOCKS__ = {
      ...previousMocks,
      updates: updatesMock,
    };

    return () => {
      if (originalOpen) {
        window.open = originalOpen;
      }
      if (previousMocks) {
        appWindow.__AUTOHOTPIE_MOCKS__ = previousMocks;
      } else if (appWindow.__AUTOHOTPIE_MOCKS__) {
        delete appWindow.__AUTOHOTPIE_MOCKS__;
      }
      useUpdateStore.setState({
        initialize: originalInitialize,
        checkForUpdates: originalCheckForUpdates,
      });
    };
  }, []);

  useEffect(() => {
    if (!profilesInitialized) {
      void loadProfiles();
    }
  }, [loadProfiles, profilesInitialized]);

  useEffect(() => {
    if (activeSection !== 'profiles') {
      return;
    }
    if (selectedProfileId) {
      return;
    }
    const defaultProfileId = activeProfileId ?? profiles[0]?.profile.id ?? null;
    if (defaultProfileId) {
      setSelectedProfileId(defaultProfileId);
    }
  }, [activeSection, activeProfileId, profiles, selectedProfileId]);

  const activeProfileRecord = useMemo(() => {
    if (!selectedProfileId) {
      return null;
    }
    return profiles.find((record) => record.profile.id === selectedProfileId) ?? null;
  }, [profiles, selectedProfileId]);

  const pieMenuState = usePieMenuHotkey({
    hotkeyEvent: 'hotkeys://trigger',
    autoCloseMs: 0,
    profileHoldToOpen: systemActiveProfile?.holdToOpen,
  });
  const {
    isOpen: isPieMenuVisible,
    activeSliceId,
    setActiveSlice,
    handleSelect,
    lastAction,
    clearLastAction,
    lastSafeModeReason,
    activeProfile: pieMenuActiveProfile,
    toggle: togglePieMenu,
    open: openPieMenu,
    close: closePieMenu,
  } = pieMenuState;

  const menuSlices = useMemo<PieSliceDefinition[]>(() => {
    const fallbackSlices: PieSliceDefinition[] = slicesForProfile(0);
    const activeSnapshot = pieMenuActiveProfile ?? systemActiveProfile;

    if (!isTauriEnvironment()) {
      if (activeSnapshot) {
        const mockSlices = slicesForProfile(activeSnapshot.index) as PieSliceDefinition[];
        if (mockSlices.length) {
          return mockSlices;
        }
      }
      const fallbackMock = slicesForProfile(0) as PieSliceDefinition[];
      return fallbackMock.length ? fallbackMock : fallbackSlices;
    }

    if (!profiles.length) {
      return fallbackSlices;
    }

    let activeRecord =
      (activeSnapshot?.index != null ? profiles[activeSnapshot.index] : undefined) ??
      (activeProfileId ? profiles.find((record) => record.profile.id === activeProfileId) : undefined) ??
      profiles[0];

    if (!activeRecord) {
      return fallbackSlices;
    }

    const rootMenu =
      activeRecord.menus.find((menu) => menu.id === activeRecord.profile.rootMenu) ??
      activeRecord.menus[0];

    if (!rootMenu) {
      return fallbackSlices;
    }

    const derivedSlices = [...rootMenu.slices]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map<PieSliceDefinition>((slice, order) => ({
        id: slice.id,
        label: slice.label || `Slice ${order + 1}`,
        order: slice.order ?? order,
      }));

    return derivedSlices.length ? derivedSlices : fallbackSlices;
  }, [activeProfileId, pieMenuActiveProfile, profiles, systemActiveProfile]);

  const previousMatchKindRef = useRef<string | null>(null);

  const isProfileConflictOnly = useMemo(
    () => Boolean(!dialogStatus && profileHotkeyStatus && !profileHotkeyStatus.registered),
    [dialogStatus, profileHotkeyStatus],
  );

  const combinedHotkeyStatus = useMemo(
    () =>
      dialogStatus ??
      (profileHotkeyStatus && !profileHotkeyStatus.registered ? profileHotkeyStatus : null),
    [dialogStatus, profileHotkeyStatus],
  );

  const isConflictDialogOpen = useMemo(
    () => dialogOpen || (!!profileHotkeyStatus && !profileHotkeyStatus.registered),
    [dialogOpen, profileHotkeyStatus],
  );

  const handleHotkeyDialogClose = useCallback(() => {
    closeDialog();
    clearProfileHotkeyStatus();
  }, [clearProfileHotkeyStatus, closeDialog]);

  useEffect(() => {
    void initialize();
    void systemInit();
  }, [initialize, systemInit]);

  const openLogPanel = useCallback(() => {
    setIsLogPanelOpen(true);
  }, []);

  const navItems = useMemo(
    () =>
      ([
        { id: 'dashboard' as AppSection, label: t('nav.dashboard') },
        { id: 'profiles' as AppSection, label: t('nav.profiles') },
        { id: 'actions' as AppSection, label: t('nav.actions') },
        { id: 'settings' as AppSection, label: t('nav.settings') },
      ] satisfies { id: AppSection; label: string }[]),
    [t],
  );

  const renderNavIcon = (section: AppSection) => {
    switch (section) {
      case 'dashboard':
        return (
          <svg
            className="h-6 w-6"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M2.25 12L11.204 3.045a.75.75 0 011.06 0L21.75 12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M4.5 9.75v10.5A1.5 1.5 0 006 21.75h12a1.5 1.5 0 001.5-1.5V9.75"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M9 21.75V12h6v9.75"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        );
      case 'profiles':
        return (
          <svg
            className="h-6 w-6"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M4.5 20.25a9.75 9.75 0 0115 0"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        );
      case 'actions':
        return (
          <svg
            className="h-6 w-6"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M2.25 12.75V6a1.5 1.5 0 011.5-1.5h5.379a1.5 1.5 0 011.06.44l1.121 1.12a1.5 1.5 0 001.06.44h5.13a1.5 1.5 0 011.5 1.5v4.13"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M2.25 12.75v7.5a1.5 1.5 0 001.5 1.5h16.5a1.5 1.5 0 001.5-1.5v-7.5H2.25z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        );
      case 'settings':
        return (
          <svg
            className="h-6 w-6"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M9.594 2.25l-.413 1.654a1.125 1.125 0 01-1.095.846H6.75a1.125 1.125 0 00-1.125 1.125v1.336a1.125 1.125 0 01-.846 1.095l-1.654.413a1.125 1.125 0 00-.84 1.278l.286 1.429a1.125 1.125 0 00.756.84l.972.27a7.5 7.5 0 000 3.054l-.972.27a1.125 1.125 0 00-.756.84l-.286 1.429a1.125 1.125 0 00.84 1.278l1.654.413a1.125 1.125 0 01.846 1.095V18.75A1.125 1.125 0 006.75 19.875h1.336c.533 0 .994.36 1.095.846l.413 1.654a1.125 1.125 0 001.278.84l1.429-.286a1.125 1.125 0 00.84-.756l.27-.972a7.5 7.5 0 003.054 0l.27.972a1.125 1.125 0 00.84.756l1.429.286a1.125 1.125 0 001.278-.84l.413-1.654a1.125 1.125 0 011.095-.846h1.336A1.125 1.125 0 0021.75 18.75v-1.336a1.125 1.125 0 01.846-1.095l1.654-.413a1.125 1.125 0 00.84-1.278l-.286-1.429a1.125 1.125 0 00-.756-.84l-.972-.27a7.5 7.5 0 000-3.054l.972-.27a1.125 1.125 0 00.756-.84l.286-1.429a1.125 1.125 0 00-.84-1.278l-1.654-.413a1.125 1.125 0 01-.846-1.095V5.875A1.125 1.125 0 0018.75 4.75h-1.336a1.125 1.125 0 01-1.095-.846l-.413-1.654a1.125 1.125 0 00-1.278-.84l-1.429.286a1.125 1.125 0 00-.84.756l-.27.972a7.5 7.5 0 00-3.054 0l-.27-.972a1.125 1.125 0 00-.84-.756l-1.429-.286a1.125 1.125 0 00-1.278.84z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(96,165,250,0.12),transparent_65%)]" />
        <div className="absolute -top-24 right-[-10%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,_rgba(244,63,94,0.18),transparent_70%)] blur-3xl" />
        <div className="absolute bottom-[-30%] left-[-10%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,_rgba(16,185,129,0.16),transparent_70%)] blur-3xl" />
      </div>
      <HotkeyConflictDialog
        isOpen={isConflictDialogOpen}
        status={combinedHotkeyStatus}
        isSubmitting={isHotkeySubmitting}
        onClose={handleHotkeyDialogClose}
        onRetry={
          isProfileConflictOnly
            ? () => {
                void retryProfileHotkeyWithOverride();
              }
            : retryWithOverride
              ? () => {
                  void retryWithOverride();
                }
              : () => {
                  void retryProfileHotkeyWithOverride();
                }
        }
        onDisable={isProfileConflictOnly ? undefined : disableConflictingHotkey}
      />
      <nav className="fixed left-0 right-0 top-4 z-30 flex justify-center px-8">
        <div className="flex items-center gap-4 rounded-[2.25rem] border border-white/10 bg-white/5 px-6 py-4 shadow-[0_0_45px_rgba(59,130,246,0.2)] backdrop-blur-xl">
          {navItems.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                className={clsx(
                  'flex h-14 w-14 items-center justify-center rounded-2xl border transition',
                  isActive
                    ? 'border-accent/70 bg-accent text-white shadow-[0_0_30px_rgba(59,130,246,0.45)]'
                    : 'border-white/10 bg-white/10 text-white/60 hover:border-white/20 hover:bg-white/20 hover:text-white',
                )}
                type="button"
                data-testid={`nav-${item.id}`}
                onClick={() => {
                  setActiveSection(item.id);
                  if (item.id !== 'profiles') {
                    setSelectedProfileId(null);
                  }
                }}
              >
                <span className="sr-only">{item.label}</span>
                {renderNavIcon(item.id)}
              </button>
            );
          })}
        </div>
      </nav>
      <header className="relative z-20 mt-28 flex items-center justify-between px-8 py-6 border-b border-white/5 backdrop-blur-md">
        <div>
          <p className="text-sm uppercase tracking-[0.35em] text-white/40">{t('header.brand')}</p>
          <h1 className="mt-1 text-3xl font-semibold text-white">{t('header.title')}</h1>
        </div>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <button
            type="button"
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.35em] text-white/70 shadow-[0_0_20px_rgba(59,130,246,0.25)] transition hover:bg-white/10"
            onClick={openLogPanel}
          >
            {t('header.openLog')}
          </button>
          <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.35em] text-white/70 shadow-[0_0_20px_rgba(148,163,184,0.2)]">
            {version ? `${t('app.title')} v${version}` : t('header.versionLoading')}
          </span>
        </div>
      </header>

      <main className="relative z-10 flex flex-col gap-6 px-8 pt-10 pb-10">
        <section className="rounded-3xl border border-white/5 bg-white/5 p-8 shadow-[0_0_35px_rgba(15,23,42,0.45)] backdrop-blur-xl">
          {activeSection === 'dashboard' && (
            <>
              <h2 className="text-2xl font-semibold text-white">{t('dashboard.welcomeTitle')}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/70">
                {t('dashboard.welcomeBody.p1')}{' '}
                <span className="text-accent">kando-2.0.0</span>.
              </p>

              <div className="mt-6 space-y-4">
                <OfflineNotice />
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  {systemError ? (
                    <span className="text-red-400">{systemError}</span>
                  ) : (
                    <>
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.2em] text-white/60">
                        {systemStatus.safeMode ? t('dashboard.safeMode') : t('dashboard.normalMode')} · {systemStatus.storageMode}
                      </span>
                      <span className="text-white/60" data-testid="status-last-check">
                        {systemStatus.connectivity.isOffline ? t('dashboard.offline') : t('dashboard.online')} · {t('dashboard.lastCheck')}{' '}
                        {systemStatus.connectivity.lastChecked ?? '—'}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-6 rounded-3xl border border-white/5 bg-white/5 p-6">
                {error && (
                  <p className="text-sm text-red-400">{error}</p>
                )}
                {!error && (
                  <>
                    <p className="text-sm text-white/70">
                      {statusMessages.join(' ')}
                    </p>
                    {settings && (
                      <p className="mt-2 text-xs uppercase tracking-[0.2em] text-white/40">
                        {t('dashboard.globalSource')}: {settings.global?.app ? (settings.global as Record<string, any>).app?.sourceFileName ?? 'N/A' : 'N/A'}
                      </p>
                    )}
                    {profilesError && (
                      <p className="mt-2 text-sm text-red-400">{profilesError}</p>
                    )}
                  </>
                )}

                <div className="mt-8">
                  <HotkeyRegistrationPanel />
                </div>

                <div className="mt-10 rounded-3xl border border-white/5 bg-white/5 p-6">
                  <h3 className="text-lg font-semibold text-white">{t('dashboard.contextualTitle')}</h3>
                  <p className="mt-2 text-sm text-white/70">{t('dashboard.contextualBody')}</p>
                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
                    <p>{t('dashboard.contextualActiveProfile')}: {systemActiveProfile?.name ?? '—'}</p>
                    <p>{t('dashboard.contextualMatchMode')}: {systemActiveProfile?.matchKind ?? '—'}</p>
                    <p>{t('dashboard.contextualSafeMode')}: {status.safeMode ? t('dashboard.enabled') : t('dashboard.disabled')}</p>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeSection === 'profiles' && (
            <div className="space-y-10">
              <ProfilesDashboard
                profiles={profiles}
                activeProfileId={activeProfileId}
                isLoading={profilesLoading}
                error={profilesError}
                onCreateProfile={() => {
                  void (async () => {
                    const record = await createProfile();
                    if (record?.profile?.id) {
                      setSelectedProfileId(record.profile.id);
                    }
                  })();
                }}
                onOpenEditor={(profileId) => {
                  setSelectedProfileId(profileId);
                }}
                onActivateProfile={(profileId) => {
                  void activateProfile(profileId);
                }}
              />

              <ProfileEditor
                profile={activeProfileRecord}
                mode={activeProfileRecord ? 'view' : 'create'}
                onClose={() => setSelectedProfileId(null)}
              />
            </div>
          )}

          {activeSection === 'actions' && (
            <div className="rounded-3xl border border-dashed border-white/15 bg-white/5 p-10 text-center text-sm text-white/60">
              Actions workspace coming soon.
            </div>
          )}

          {activeSection === 'settings' && (
            <div className="space-y-10">
              <SettingsImportExport />
              <SettingsAutostart />
              <SettingsUpdates />
            </div>
          )}
        </section>
      </main>
      <LogPanel isOpen={isLogPanelOpen} onClose={() => setIsLogPanelOpen(false)} />
      <ProfileRecoveryDialog />
    </div>
  );
}
