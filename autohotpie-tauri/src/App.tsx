import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { ActionBuilder } from './components/actions/ActionBuilder';
import { useLocalization } from './hooks/useLocalization';
import { LogPanel } from './components/log/LogPanel';
import { useUpdateStore } from './state/updateStore';
import type { UpdateStatus } from './state/types';
import { useActionsStore } from './state/actionsStore';
import { type ActionDefinition, type ActionValidationResult } from './types/actions';

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
  const actions = useActionsStore((state) => state.actions);
  const activeActionId = useActionsStore((state) => state.activeActionId);
  const actionsLoading = useActionsStore((state) => state.isLoading);
  const actionsError = useActionsStore((state) => state.error);
  const lastSavedAt = useActionsStore((state) => state.lastSavedAt);
  const loadActions = useActionsStore((state) => state.loadActions);
  const selectAction = useActionsStore((state) => state.selectAction);
  const createAction = useActionsStore((state) => state.createAction);
  const updateAction = useActionsStore((state) => state.updateAction);
  const deleteAction = useActionsStore((state) => state.deleteAction);
  const duplicateAction = useActionsStore((state) => state.duplicateAction);
  const clearActionsError = useActionsStore((state) => state.clearError);
  const [activeSection, setActiveSection] = useState<AppSection>('dashboard');
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [validationSnapshot, setValidationSnapshot] = useState<{ actionId: string | null; result: ActionValidationResult | null }>({
    actionId: null,
    result: null,
  });
  const activeAction = useMemo(() => actions.find((action) => action.id === activeActionId) ?? null, [actions, activeActionId]);
  const activeActionIdRef = useRef<string | null>(activeAction?.id ?? null);
  useEffect(() => {
    activeActionIdRef.current = activeAction?.id ?? null;
  }, [activeAction]);
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
    void loadActions();
  }, [loadActions]);
  useEffect(() => {
    if (!actionsLoading && actions.length > 0 && !activeActionId) {
      selectAction(actions[0].id);
    }
  }, [actionsLoading, actions, activeActionId, selectAction]);
  useEffect(() => {
    setValidationSnapshot((snapshot) =>
      snapshot.actionId === activeActionIdRef.current
        ? snapshot
        : { actionId: activeActionIdRef.current, result: null },
    );
  }, [actions, activeActionId]);
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

  const handleActionChange = useCallback(
    (next: ActionDefinition | null) => {
      if (!next) {
        return;
      }
      updateAction(next);
      selectAction(next.id);
    },
    [selectAction, updateAction],
  );

  const handleActionValidate = useCallback(
    (result: ActionValidationResult) => {
      setValidationSnapshot({ actionId: activeActionIdRef.current, result });
    },
    [],
  );

  const handleCreateAction = useCallback(() => {
    const created = createAction();
    setValidationSnapshot({ actionId: created.id, result: null });
  }, [createAction]);

  const handleDuplicateAction = useCallback(() => {
    if (!activeActionIdRef.current) {
      return;
    }
    const clone = duplicateAction(activeActionIdRef.current);
    if (clone) {
      setValidationSnapshot({ actionId: clone.id, result: null });
    }
  }, [duplicateAction]);

  const handleDeleteAction = useCallback(() => {
    if (!activeActionIdRef.current) {
      return;
    }
    deleteAction(activeActionIdRef.current);
    setValidationSnapshot({ actionId: null, result: null });
  }, [deleteAction]);

  const handleSelectAction = useCallback(
    (actionId: string) => {
      selectAction(actionId);
    },
    [selectAction],
  );

  const activeValidation = validationSnapshot.actionId === activeActionIdRef.current ? validationSnapshot.result : null;

  const savedAtLabel = useMemo(() => {
    if (!lastSavedAt) {
      return null;
    }
    try {
      return new Date(lastSavedAt).toLocaleString();
    } catch (error) {
      console.warn('Failed to format savedAt', error);
      return lastSavedAt;
    }
  }, [lastSavedAt]);

  const navItems = useMemo(
    () =>
      ([
        { id: 'dashboard' as AppSection, label: t('nav.dashboard') },
        { id: 'profiles' as AppSection, label: t('nav.profiles') },
        { id: 'actions' as AppSection, label: t('nav.actions') },
        { id: 'settings' as AppSection, label: t('nav.settings') },
      ]),
    [t, currentLanguage],
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#090a13] text-text-primary">
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
      <header className="relative z-10 flex items-center justify-between px-8 py-6 border-b border-white/5 backdrop-blur-md">
        <div>
          <p className="text-sm uppercase tracking-[0.35em] text-white/40">{t('header.brand')}</p>
          <h1 className="mt-1 text-3xl font-semibold text-white">{t('header.title')}</h1>
        </div>
        <div className="flex items-start gap-4">
          <LanguageSwitcher />
          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.35em] text-white/70 shadow-[0_0_20px_rgba(59,130,246,0.25)] transition hover:bg-white/10"
              onClick={openLogPanel}
            >
              {t('header.openLog')}
            </button>
            <div className="rounded-full bg-white/5 px-4 py-2 text-sm text-white/70 shadow-[0_0_20px_rgba(148,163,184,0.2)]">
              {version ? `${t('app.title')} v${version}` : t('header.versionLoading')}
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 grid gap-6 px-8 py-10 lg:grid-cols-[320px,1fr]">
        <nav className="space-y-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={clsx(
                'w-full rounded-2xl border px-4 py-3 text-left text-sm font-medium transition',
                activeSection === item.id
                  ? 'border-white/15 bg-white/15 text-white'
                  : 'border-white/5 bg-white/5 text-white/70 hover:border-white/10 hover:bg-white/10 hover:text-white',
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
              {item.label}
            </button>
          ))}
        </nav>

        <section className="rounded-3xl border border-white/5 bg-white/10/10 p-8 shadow-[0_0_35px_rgba(15,23,42,0.45)] backdrop-blur-xl">
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
            <div className="space-y-6" data-testid="actions-workspace">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-semibold text-white">Actions Workspace</h2>
                  <p className="text-sm text-white/70">
                    Создавай, редактируй и сохраняй макросы. Все изменения автоматически помещаются в локальное хранилище.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.3em] text-white/70 transition hover:border-white/20 hover:text-white"
                    onClick={handleCreateAction}
                    disabled={actionsLoading}
                  >
                    New Action
                  </button>
                  <button
                    type="button"
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.3em] text-white/70 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={handleDuplicateAction}
                    disabled={!activeAction || actionsLoading}
                  >
                    Duplicate
                  </button>
                  <button
                    type="button"
                    className="rounded-2xl border border-red-400/40 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.3em] text-red-200 transition hover:border-red-500/60 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={handleDeleteAction}
                    disabled={!activeAction || actionsLoading}
                  >
                    Delete
                  </button>
                </div>
              </div>

              {actionsError && (
                <div className="flex items-center justify-between rounded-2xl border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm text-red-100">
                  <span>{actionsError}</span>
                  <button
                    type="button"
                    className="rounded-xl border border-red-400/40 px-3 py-1 text-xs uppercase tracking-[0.3em] text-red-100 hover:border-red-300"
                    onClick={clearActionsError}
                  >
                    Скрыть
                  </button>
                </div>
              )}

              <div className="grid gap-6 lg:grid-cols-[minmax(260px,320px),1fr]">
                <div className="space-y-4">
                  <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-white">Saved Actions</h3>
                      {savedAtLabel && <span className="text-[11px] uppercase tracking-[0.3em] text-white/40">{savedAtLabel}</span>}
                    </div>
                    <div className="mt-4 space-y-2">
                      {actionsLoading && <p className="text-sm text-white/50">Loading actions…</p>}
                      {!actionsLoading && actions.length === 0 && (
                        <p className="text-sm text-white/50">No actions saved yet. Создай новый макрос.</p>
                      )}
                      {!actionsLoading &&
                        actions.map((action) => (
                          <button
                            key={action.id}
                            type="button"
                            className={clsx(
                              'w-full rounded-2xl border px-4 py-3 text-left text-sm transition',
                              activeActionId === action.id
                                ? 'border-accent/70 bg-accent/10 text-white'
                                : 'border-white/10 bg-black/20 text-white/70 hover:border-white/20 hover:bg-black/30',
                            )}
                            onClick={() => handleSelectAction(action.id)}
                          >
                            <span className="block text-xs uppercase tracking-[0.3em] text-white/40">{action.kind}</span>
                            <span className="mt-1 block text-sm font-semibold text-white">{action.name}</span>
                            <span className="mt-1 block text-[11px] text-white/40">{action.steps.length} step(s)</span>
                          </button>
                        ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
                    <ActionBuilder value={activeAction} onChange={handleActionChange} onValidate={handleActionValidate} />
                  </div>

                  {activeValidation && (
                    <div
                      className={clsx(
                        'rounded-3xl border p-6 text-sm transition',
                        activeValidation.isValid
                          ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-100'
                          : 'border-red-400/40 bg-red-400/10 text-red-100',
                      )}
                    >
                      <p className="text-xs uppercase tracking-[0.3em]">Validation Summary</p>
                      <p className="mt-2 text-sm text-inherit">
                        {activeValidation.isValid
                          ? 'Макрос проходит проверку и готов к запуску.'
                          : `Исправь ${activeValidation.errors.length} ошиб(ок).`}
                      </p>
                      <div className="mt-2 text-xs text-white/80">
                        <span>{`Warnings: ${activeValidation.warnings.length}`}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
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
